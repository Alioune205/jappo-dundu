import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { session } from '@/lib/session'
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

type RealtimeListener = (event: string, data: unknown) => void

interface RealtimeContextType {
  isConnected: boolean
  alerts: RealtimeAlert[]
  unreadCount: number
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  clearAlerts: () => void
  subscribe: (event: string, callback: RealtimeListener) => () => void
}

const RealtimeContext = createContext<RealtimeContextType | undefined>(undefined)

export const RealtimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, user } = useAuth()
  const [isConnected, setIsConnected] = useState<boolean>(false)
  const [alerts, setAlerts] = useState<RealtimeAlert[]>([])
  const listenersRef = useRef<Map<string, Set<RealtimeListener>>>(new Map())
  const dashboardWsRef = useRef<WebSocket | null>(null)
  const alertsWsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const emitEvent = useCallback((event: string, data: unknown) => {
    const callbacks = listenersRef.current.get(event)
    if (callbacks) {
      callbacks.forEach((cb) => {
        try {
          cb(event, data)
        } catch (e) {
          console.error(`Erreur listener realtime [${event}]:`, e)
        }
      })
    }
    const wildcardCallbacks = listenersRef.current.get('*')
    if (wildcardCallbacks) {
      wildcardCallbacks.forEach((cb) => {
        try {
          cb(event, data)
        } catch (e) {
          console.error(`Erreur listener wildcard:`, e)
        }
      })
    }
  }, [])

  const addAlert = useCallback((alert: Omit<RealtimeAlert, 'id' | 'timestamp' | 'isRead'>) => {
    const newAlert: RealtimeAlert = {
      ...alert,
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      isRead: false,
    }
    setAlerts((prev) => [newAlert, ...prev.slice(0, 49)]) // Limite à 50 alertes
  }, [])

  const connectWebSockets = useCallback(() => {
    const token = session.getAccess()
    if (!token || !isAuthenticated) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host

    // WebSocket 1: Alertes globales / régionales
    const alertsUrl = `${protocol}//${host}/ws/alerts/?token=${token}`
    const alertsWs = new WebSocket(alertsUrl)
    alertsWsRef.current = alertsWs

    alertsWs.onopen = () => {
      setIsConnected(true)
    }

    alertsWs.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        const type = message.type
        const data = message.data || {}
        const evt = data.event || type

        emitEvent(evt, data)

        if (type === 'blood_alert') {
          addAlert({
            type: 'blood',
            title: 'Urgence Don de Sang',
            message: `Demande de sang ${data.blood_group || ''} (${data.units_remaining || data.units_needed || 0} poches requises) à ${data.facility?.name || 'un établissement'}.`,
            data,
          })
        } else if (type === 'bed_alert') {
          addAlert({
            type: 'bed',
            title: evt === 'bed_capacity_saturated' ? 'Saturation de Service' : 'Disponibilité Lit',
            message: `Service ${data.category || ''} à ${data.facility?.name || 'Établissement'}: ${data.available_beds} lits disponibles.`,
            data,
          })
        } else if (type === 'ambulance_alert') {
          addAlert({
            type: 'ambulance',
            title: 'Intervention Ambulance',
            message: `Mission ${data.priority || 'urgente'} : ${data.pickup?.address || 'Lieu d’intervention'}.`,
            data,
          })
        }
      } catch (err) {
        console.error('Erreur décodage WebSocket alerts:', err)
      }
    }

    alertsWs.onclose = (e) => {
      setIsConnected(false)
      // Reconnexion automatique si non fermé volontairement
      if (e.code !== 1000 && isAuthenticated) {
        reconnectTimeoutRef.current = setTimeout(connectWebSockets, 5000)
      }
    }

    // WebSocket 2: Dashboard national / hôpital (pour hospital_staff ou admin)
    if (user && (user.role === 'admin' || user.role === 'hospital_staff' || user.roles?.includes('admin') || user.roles?.includes('hospital_staff'))) {
      const hospitalParam = user.facility?.id ? `&hospital_id=${user.facility.id}` : ''
      const dashboardUrl = `${protocol}//${host}/ws/dashboard/?token=${token}${hospitalParam}`
      const dashWs = new WebSocket(dashboardUrl)
      dashboardWsRef.current = dashWs

      dashWs.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          const evt = message.data?.event || message.type
          emitEvent(evt, message.data || {})
        } catch (err) {
          console.error('Erreur décodage WebSocket dashboard:', err)
        }
      }

      dashWs.onclose = () => {
        // Géré conjointement
      }
    }
  }, [isAuthenticated, user, emitEvent, addAlert])

  useEffect(() => {
    if (isAuthenticated) {
      connectWebSockets()
    } else {
      if (alertsWsRef.current) alertsWsRef.current.close()
      if (dashboardWsRef.current) dashboardWsRef.current.close()
      setIsConnected(false)
    }

    return () => {
      if (alertsWsRef.current) alertsWsRef.current.close()
      if (dashboardWsRef.current) dashboardWsRef.current.close()
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
    }
  }, [isAuthenticated, connectWebSockets])

  const markAsRead = (id: string) => {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, isRead: true } : a)))
  }

  const markAllAsRead = () => {
    setAlerts((prev) => prev.map((a) => ({ ...a, isRead: true })))
  }

  const clearAlerts = () => {
    setAlerts([])
  }

  const subscribe = useCallback((event: string, callback: RealtimeListener) => {
    if (!listenersRef.current.has(event)) {
      listenersRef.current.set(event, new Set())
    }
    listenersRef.current.get(event)!.add(callback)
    return () => {
      listenersRef.current.get(event)?.delete(callback)
    }
  }, [])

  const unreadCount = alerts.filter((a) => !a.isRead).length

  return (
    <RealtimeContext.Provider
      value={{
        isConnected,
        alerts,
        unreadCount,
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
