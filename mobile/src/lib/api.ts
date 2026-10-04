/**
 * Client HTTP de l'API Jappo Dundu.
 *
 * - en-tête Authorization avec le jeton d'accès ;
 * - sur 401 : un seul rafraîchissement partagé par toutes les requêtes en
 *   cours (le backend fait tourner le refresh token et révoque l'ancien :
 *   deux rafraîchissements parallèles déconnecteraient l'utilisateur) ;
 * - erreurs au format DRF ({"detail"} ou erreurs par champ) converties en
 *   ApiError lisible.
 */
import { API_URL } from './config'
import { session } from './session'

export type FieldErrors = Record<string, string[]>

export class ApiError extends Error {
  readonly status: number
  readonly fieldErrors: FieldErrors

  constructor(status: number, message: string, fieldErrors: FieldErrors = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

const STATUS_MESSAGES: Record<number, string> = {
  0: 'Connexion impossible. Vérifiez votre accès à Internet.',
  400: 'Vérifiez votre saisie.',
  401: 'Votre session a expiré. Reconnectez-vous.',
  403: 'Action non autorisée.',
  404: 'Élément introuvable.',
  409: 'Action impossible dans l’état actuel.',
  429: 'Trop de tentatives. Patientez un instant.',
  500: 'Le serveur rencontre un problème. Réessayez dans quelques minutes.',
}

function toMessages(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(toMessages)
  return []
}

export function parseError(status: number, data: unknown): ApiError {
  const fallback = STATUS_MESSAGES[status] ?? STATUS_MESSAGES[Math.floor(status / 100) * 100] ?? `Erreur (${status}).`
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return new ApiError(status, toMessages(data)[0] ?? fallback)
  }
  const record = data as Record<string, unknown>
  const fieldErrors: FieldErrors = {}
  for (const [key, value] of Object.entries(record)) {
    // « code » est à la fois le code technique de DRF (chaîne, à ignorer) et un
    // vrai champ de formulaire (liste de messages, ex. code de réinitialisation).
    if (key === 'detail' || key === 'non_field_errors' || (key === 'code' && typeof value === 'string')) continue
    const messages = toMessages(value)
    if (messages.length) fieldErrors[key] = messages
  }
  const direct = toMessages(record.detail)[0] ?? toMessages(record.non_field_errors)[0]
  return new ApiError(status, direct ?? (Object.keys(fieldErrors).length ? 'Vérifiez les champs signalés.' : fallback), fieldErrors)
}

export type RefreshOutcome = 'ok' | 'rejected' | 'offline'

let refreshInFlight: Promise<RefreshOutcome> | null = null

/**
 * Rafraîchit la paire de jetons ; un seul appel réseau pour les demandes
 * simultanées. Distingue un refus du serveur (session terminée) d'une
 * coupure réseau (session intacte, à reprendre plus tard).
 */
export function refreshSession(): Promise<RefreshOutcome> {
  if (refreshInFlight) return refreshInFlight
  const refresh = session.getRefresh()
  if (!refresh) return Promise.resolve('rejected')
  refreshInFlight = (async (): Promise<RefreshOutcome> => {
    try {
      const response = await fetch(`${API_URL}/api/auth/token/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refresh }),
      })
      if (response.status === 401 || response.status === 400) return 'rejected'
      if (!response.ok) return 'offline'
      const tokens = (await response.json()) as { access: string; refresh?: string }
      await session.setTokens(tokens.access, tokens.refresh ?? refresh)
      return 'ok'
    } catch {
      return 'offline'
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

export async function refreshTokens(): Promise<boolean> {
  return (await refreshSession()) === 'ok'
}

type Query = Record<string, string | number | boolean | null | undefined>

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Query
  auth?: boolean
}

function buildUrl(path: string, query?: Query) {
  const params = Object.entries(query ?? {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
  return `${API_URL}${path}${params.length ? `?${params.join('&')}` : ''}`
}

export async function request<T>(path: string, options: RequestOptions = {}, retried = false): Promise<T> {
  const { method = 'GET', body, query, auth = true } = options
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const access = session.getAccess()
  if (auth && access) headers.Authorization = `Bearer ${access}`

  let response: Response
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, STATUS_MESSAGES[0])
  }

  if (response.status === 401 && auth && !retried && (await refreshTokens())) {
    return request<T>(path, options, true)
  }

  const text = response.status === 204 ? '' : await response.text()
  let data: unknown = undefined
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  if (!response.ok) throw parseError(response.status, data)
  return data as T
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>(path, { query }),
  post: <T>(path: string, body: unknown = {}, auth = true) => request<T>(path, { method: 'POST', body, auth }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body }),
}
