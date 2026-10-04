/**
 * Flux temps réel des alertes (/ws/alerts/).
 *
 * Connexion par ticket à usage unique (POST /api/realtime/ticket/), comme le
 * web : le jeton JWT ne transite jamais dans l'URL. Reconnexion avec
 * temporisation croissante (1 s → 30 s), connexion fermée quand
 * l'application passe en arrière-plan (les push prennent le relais), et
 * battement de cœur pour détecter une connexion morte derrière un NAT.
 *
 * Responsable du domaine : Pape Alioune Sene (application mobile)
 */
import { useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import type { BloodAlertEvent } from '@/types/api'
import { api } from './api'
import { WS_URL } from './config'

export type StreamStatus = 'connecting' | 'live' | 'offline'

const MAX_DELAY_MS = 30_000
const PING_MS = 25_000
/** Codes de refus définitifs (consumers.py) : inutile de réessayer en boucle. */
const FATAL_CODES = new Set([4400, 4403])

export function useAlertStream(onAlert: (event: BloodAlertEvent) => void, enabled = true): StreamStatus {
  const [status, setStatus] = useState<StreamStatus>('connecting')
  const [active, setActive] = useState(AppState.currentState !== 'background')
  const onAlertRef = useRef(onAlert)

  useEffect(() => {
    onAlertRef.current = onAlert
  }, [onAlert])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setActive(state !== 'background'))
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    if (!enabled || !active) return
    let socket: WebSocket | null = null
    let retry: ReturnType<typeof setTimeout> | null = null
    let ping: ReturnType<typeof setInterval> | null = null
    let attempts = 0
    let stopped = false

    const schedule = () => {
      if (stopped) return
      const delay = Math.min(MAX_DELAY_MS, 1000 * 2 ** attempts) * (0.8 + Math.random() * 0.4)
      attempts += 1
      retry = setTimeout(connect, delay)
    }

    async function connect() {
      setStatus('connecting')
      let ticket: string
      try {
        ticket = (await api.post<{ ticket: string }>('/api/realtime/ticket/')).ticket
      } catch {
        if (!stopped) {
          setStatus('offline')
          schedule()
        }
        return
      }
      if (stopped) return
      socket = new WebSocket(`${WS_URL}/ws/alerts/?ticket=${encodeURIComponent(ticket)}`)
      socket.onmessage = (message) => {
        let payload: { type?: string }
        try {
          payload = JSON.parse(String(message.data))
        } catch {
          return
        }
        if (payload.type === 'connection_established') {
          attempts = 0
          setStatus('live')
        } else if (payload.type === 'blood_alert') {
          onAlertRef.current(payload as BloodAlertEvent)
        }
      }
      socket.onopen = () => {
        ping = setInterval(() => socket?.readyState === WebSocket.OPEN && socket.send('{"type":"ping"}'), PING_MS)
      }
      socket.onclose = (event) => {
        if (ping) clearInterval(ping)
        socket = null
        if (stopped) return
        setStatus('offline')
        if (!FATAL_CODES.has(event.code)) schedule()
      }
    }

    connect()
    return () => {
      stopped = true
      if (retry) clearTimeout(retry)
      if (ping) clearInterval(ping)
      socket?.close()
    }
  }, [enabled, active])

  return enabled && active ? status : 'offline'
}
