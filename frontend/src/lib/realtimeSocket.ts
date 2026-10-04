/**
 * Connexion WebSocket résiliente vers le backend temps réel (Django Channels).
 *
 * - chaque tentative obtient un ticket neuf à usage unique (POST
 *   /api/realtime/ticket/, voir backend/realtime/tickets.py) : le JWT ne
 *   figure jamais dans l'URL, donc jamais dans les journaux de proxy ;
 * - reconnexion avec attente exponentielle plafonnée, remise à zéro dès
 *   qu'une connexion aboutit ;
 * - une fermeture demandée (`close()`) ne déclenche jamais de reconnexion ;
 * - un refus d'autorisation (4403) ou une requête invalide (4400) est
 *   définitif : réessayer ne changerait rien.
 */

export const CLOSE_BAD_REQUEST = 4400
export const CLOSE_UNAUTHENTICATED = 4401
export const CLOSE_FORBIDDEN = 4403

const FATAL_CLOSE_CODES = new Set([CLOSE_BAD_REQUEST, CLOSE_FORBIDDEN])

export interface RealtimeMessage {
  type: string
  id?: string
  sent_at?: string
  data?: Record<string, unknown>
}

export interface RealtimeSocketOptions {
  /** Chemin du flux, ex. `/ws/alerts/`. */
  path: string
  /** Paramètres de périmètre (region, hospital_id…), hors jeton. */
  params?: Record<string, string | number | undefined>
  /** Ticket de connexion à usage unique, ou null si indisponible (session expirée, réseau). */
  getTicket: () => Promise<string | null>
  onMessage: (message: RealtimeMessage) => void
  onStatusChange?: (connected: boolean) => void
  /** Délai initial et plafond de reconnexion (ms). */
  minDelay?: number
  maxDelay?: number
  /** Injectables pour les tests. */
  createSocket?: (url: string) => WebSocket
  location?: Pick<Location, 'protocol' | 'host'>
}

export interface RealtimeSocket {
  close: () => void
}

export function openRealtimeSocket(options: RealtimeSocketOptions): RealtimeSocket {
  const {
    path,
    params = {},
    getTicket,
    onMessage,
    onStatusChange,
    minDelay = 1000,
    maxDelay = 30_000,
    createSocket = (url) => new WebSocket(url),
    location = window.location,
  } = options

  let socket: WebSocket | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let attempts = 0
  let stopped = false

  const buildUrl = (ticket: string) => {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') query.set(key, String(value))
    }
    query.set('ticket', ticket)
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${location.host}${path}?${query.toString()}`
  }

  const scheduleRetry = () => {
    if (stopped || retryTimer) return
    const delay = Math.min(maxDelay, minDelay * 2 ** attempts)
    attempts += 1
    retryTimer = setTimeout(() => {
      retryTimer = null
      void connect()
    }, delay)
  }

  const connect = async () => {
    if (stopped) return
    const ticket = await getTicket().catch(() => null)
    // Fermé pendant l'obtention du ticket : on n'ouvre rien.
    if (stopped) return
    if (!ticket) {
      // Réseau ou session indisponible : on réessaie plus tard.
      scheduleRetry()
      return
    }

    const ws = createSocket(buildUrl(ticket))
    socket = ws

    ws.onopen = () => {
      attempts = 0
      onStatusChange?.(true)
    }

    ws.onmessage = (event) => {
      let message: RealtimeMessage
      try {
        message = JSON.parse(String(event.data))
      } catch {
        console.warn(`Message temps réel illisible sur ${path}`)
        return
      }
      if (message && typeof message.type === 'string') onMessage(message)
    }

    ws.onclose = (event) => {
      if (socket === ws) socket = null
      // Fermeture demandée : silence total, une connexion plus récente a
      // peut-être déjà pris le relais.
      if (stopped) return
      onStatusChange?.(false)
      if (FATAL_CLOSE_CODES.has(event.code)) return
      scheduleRetry()
    }
  }

  void connect()

  return {
    close() {
      stopped = true
      if (retryTimer) clearTimeout(retryTimer)
      retryTimer = null
      if (socket) {
        socket.close(1000)
        socket = null
      }
    },
  }
}
