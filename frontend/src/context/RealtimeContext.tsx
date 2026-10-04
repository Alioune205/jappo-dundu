import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { openRealtimeSocket, type RealtimeMessage } from '@/lib/realtimeSocket'
import { useAuth } from './AuthContext'

export interface RealtimeAlert {
  id: string
  type: 'blood' | 'bed' | 'ambulance' | 'prediction' | 'general'
  title: string
  message: string
  timestamp: string
  data?: unknown
  isRead?: boolean
}

type RealtimeListener = (event: string, data: Record<string, unknown>) => void

/** connecting : première connexion en cours ; interrupted : flux perdu après coup. */
export type RealtimeStatus = 'connecting' | 'open' | 'interrupted'

interface RealtimeContextType {
  isConnected: boolean
  status: RealtimeStatus
  /** Instant (ms) de la coupure en cours, ou null. */
  interruptedSince: number | null
  alerts: RealtimeAlert[]
  unreadCount: number
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  clearAlerts: () => void
  /**
   * Écoute un événement métier (`data.event`, ou le type du message à défaut :
   * `mission_created`, `bed_capacity_updated`, `prediction_update`…).
   * Le joker `*` reçoit tout : à réserver au débogage.
   */
  subscribe: (event: string, callback: RealtimeListener) => () => void
}

/** Messages de contrôle du protocole, sans intérêt pour les écrans. */
const CONTROL_TYPES = new Set(['connection_established', 'pong', 'subscribed', 'unsubscribed', 'error'])

const MAX_ALERTS = 50

/**
 * Ticket WebSocket à usage unique. Passe par le client API : un JWT expiré
 * est rafraîchi avant la demande, comme pour toute requête REST.
 */
async function fetchTicket(): Promise<string | null> {
  try {
    const { ticket } = await api.post<{ ticket: string }>('/api/realtime/ticket/')
    return ticket || null
  } catch {
    return null
  }
}

const RealtimeContext = createContext<RealtimeContextType | undefined>(undefined)

/** Nom de l'événement métier porté par un message. */
function eventName(message: RealtimeMessage): string {
  const event = message.data?.event
  return typeof event === 'string' && event ? event : message.type
}

/** Traduit un message du flux d'alertes en notification affichable, ou null. */
function toAlert(message: RealtimeMessage): Omit<RealtimeAlert, 'id' | 'timestamp' | 'isRead'> | null {
  const data = (message.data ?? {}) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  switch (message.type) {
    case 'blood_alert':
      if (data.source === 'ml_prediction') {
        return {
          type: 'prediction',
          title: 'Risque de pénurie',
          message: data.message || `Pénurie prévue — ${data.region_display || data.region || 'région inconnue'}.`,
          data,
        }
      }
      return {
        type: 'blood',
        title: 'Demande de sang',
        message: `${data.blood_group || ''} — ${data.units_remaining ?? data.units_needed ?? 0} poche(s) à ${data.facility?.name || 'un établissement'}.`,
        data,
      }
    case 'bed_alert':
      return {
        type: 'bed',
        title: data.event === 'bed_capacity_saturated' ? 'Service saturé' : 'Lits de nouveau disponibles',
        message: `${data.facility?.name || 'Établissement'} : ${data.available_beds ?? 0} lit(s) disponible(s).`,
        data,
      }
    case 'ambulance_alert':
      return {
        type: 'ambulance',
        title: 'Mission ambulance',
        message: `Priorité ${data.priority || '—'} : ${data.pickup?.address || 'lieu non précisé'}.`,
        data,
      }
    case 'alert_message':
      return { type: 'general', title: 'Message', message: data.message || '', data }
    default:
      return null
  }
}

export const RealtimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, user } = useAuth()
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [interruptedSince, setInterruptedSince] = useState<number | null>(null)
  const [alerts, setAlerts] = useState<RealtimeAlert[]>([])
  const listenersRef = useRef<Map<string, Set<RealtimeListener>>>(new Map())

  const emit = useCallback((event: string, data: Record<string, unknown>) => {
    for (const key of [event, '*']) {
      listenersRef.current.get(key)?.forEach((listener) => {
        try {
          listener(event, data)
        } catch (err) {
          console.error(`Erreur d'un écouteur temps réel [${event}] :`, err)
        }
      })
    }
  }, [])

  const handleMessage = useCallback(
    (message: RealtimeMessage, withAlert: boolean) => {
      if (CONTROL_TYPES.has(message.type)) return
      emit(eventName(message), message.data ?? {})
      if (!withAlert) return
      const alert = toAlert(message)
      if (!alert) return
      setAlerts((prev) =>
        [
          {
            ...alert,
            id: message.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            timestamp: message.sent_at || new Date().toISOString(),
            isRead: false,
          },
          ...prev,
        ].slice(0, MAX_ALERTS)
      )
    },
    [emit]
  )

  // Seules des valeurs primitives en dépendances : un rafraîchissement du
  // profil (nouvel objet `user`) ne doit pas couper les connexions.
  const userId = user?.id
  const facilityId = user?.facility?.id
  // Le flux tableau de bord est réservé aux administrateurs et au personnel hospitalier.
  const userRoles: string[] = user ? [user.role ?? '', ...(user.roles ?? [])] : []
  const canFollowDashboard = userRoles.includes('admin') || userRoles.includes('hospital_staff')

  useEffect(() => {
    if (!isAuthenticated || userId === undefined) return

    const sockets = [
      openRealtimeSocket({
        path: '/ws/alerts/',
        getTicket: fetchTicket,
        onMessage: (message) => handleMessage(message, true),
        onStatusChange: (connected) => {
          setAlertsOpen(connected)
          setInterruptedSince((since) => (connected ? null : (since ?? Date.now())))
        },
      }),
    ]
    if (canFollowDashboard) {
      sockets.push(
        openRealtimeSocket({
          path: '/ws/dashboard/',
          params: { hospital_id: facilityId },
          getTicket: fetchTicket,
          onMessage: (message) => handleMessage(message, false),
        })
      )
    }

    return () => sockets.forEach((socket) => socket.close())
  }, [isAuthenticated, userId, facilityId, canFollowDashboard, handleMessage])

  const subscribe = useCallback((event: string, callback: RealtimeListener) => {
    let listeners = listenersRef.current.get(event)
    if (!listeners) {
      listeners = new Set()
      listenersRef.current.set(event, listeners)
    }
    listeners.add(callback)
    return () => {
      listenersRef.current.get(event)?.delete(callback)
    }
  }, [])

  const markAsRead = useCallback((id: string) => {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, isRead: true } : a)))
  }, [])
  const markAllAsRead = useCallback(() => {
    setAlerts((prev) => prev.map((a) => ({ ...a, isRead: true })))
  }, [])
  const clearAlerts = useCallback(() => setAlerts([]), [])

  return (
    <RealtimeContext.Provider
      value={{
        // Une connexion fermée volontairement (déconnexion) ne signale rien :
        // l'état d'authentification fait foi.
        isConnected: isAuthenticated && alertsOpen,
        status: !isAuthenticated
          ? 'connecting'
          : alertsOpen
            ? 'open'
            : interruptedSince !== null
              ? 'interrupted'
              : 'connecting',
        interruptedSince: isAuthenticated ? interruptedSince : null,
        alerts,
        unreadCount: alerts.filter((a) => !a.isRead).length,
        markAsRead,
        markAllAsRead,
        clearAlerts,
        subscribe,
      }}
    >
      {children}
    </RealtimeContext.Provider>
  )
}

export function useRealtime() {
  const context = useContext(RealtimeContext)
  if (!context) {
    throw new Error('useRealtime doit être utilisé au sein d’un RealtimeProvider')
  }
  return context
}
