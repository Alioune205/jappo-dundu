/**
 * Client HTTP de l'API Jappo Dundu.
 *
 * - ajoute l'en-tête `Authorization: Bearer <access>` ;
 * - sur un 401, rafraîchit le token une seule fois (requête partagée entre
 *   les appels simultanés) puis rejoue la requête ;
 * - si le rafraîchissement échoue, vide la session et prévient l'application
 *   (événement `session-expired`) ;
 * - transforme toute erreur en `ApiError` avec un message lisible en français
 *   et le détail par champ renvoyé par DRF.
 */
import type { Paginated, TokenPair } from '@/types/api'

import { session } from './session'

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

export type FieldErrors = Record<string, string[]>

export class ApiError extends Error {
  readonly status: number
  readonly data: unknown
  readonly fieldErrors: FieldErrors

  constructor(status: number, message: string, data: unknown = null, fieldErrors: FieldErrors = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
    this.fieldErrors = fieldErrors
  }
}

const STATUS_MESSAGES: Record<number, string> = {
  0: 'Serveur injoignable. Vérifiez votre connexion réseau.',
  400: 'Certaines informations sont invalides.',
  401: 'Votre session a expiré. Veuillez vous reconnecter.',
  403: "Vous n'avez pas les droits nécessaires pour cette action.",
  404: 'Ressource introuvable.',
  409: "Action impossible dans l'état actuel.",
  429: 'Trop de tentatives. Patientez un instant avant de réessayer.',
  500: 'Erreur interne du serveur. Réessayez dans quelques instants.',
  503: 'Service temporairement indisponible.',
}

function asMessages(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(asMessages)
  if (value && typeof value === 'object') return Object.values(value).flatMap(asMessages)
  return []
}

/** Extrait un message principal et les erreurs par champ d'une réponse DRF. */
export function parseErrorBody(status: number, data: unknown): { message: string; fieldErrors: FieldErrors } {
  const fallback = STATUS_MESSAGES[status] ?? `Erreur inattendue (${status}).`
  if (data == null || data === '') return { message: fallback, fieldErrors: {} }
  if (typeof data === 'string' || Array.isArray(data)) {
    return { message: asMessages(data)[0] ?? fallback, fieldErrors: {} }
  }
  if (typeof data !== 'object') return { message: fallback, fieldErrors: {} }

  const record = data as Record<string, unknown>
  const fieldErrors: FieldErrors = {}
  for (const [key, value] of Object.entries(record)) {
    if (['detail', 'message', 'status', 'code', 'non_field_errors'].includes(key)) continue
    const messages = asMessages(value)
    if (messages.length) fieldErrors[key] = messages
  }

  const direct = asMessages(record.detail)[0] ?? asMessages(record.non_field_errors)[0] ?? asMessages(record.message)[0]
  if (direct) return { message: direct, fieldErrors }
  const first = Object.values(fieldErrors)[0]?.[0]
  return { message: first && Object.keys(fieldErrors).length === 1 ? first : fallback, fieldErrors }
}

type QueryValue = string | number | boolean | null | undefined
export type QueryParams = Record<string, QueryValue>

export function buildUrl(path: string, params?: QueryParams): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const query = search.toString()
  return `${API_BASE_URL}${path}${query ? `?${query}` : ''}`
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  params?: QueryParams
  signal?: AbortSignal
  /** false pour les routes publiques (connexion, rafraîchissement). */
  auth?: boolean
  /** Statuts d'erreur dont le corps doit être renvoyé tel quel (ex. 503 de /api/status/). */
  acceptStatuses?: number[]
}

type SessionListener = () => void
const sessionExpiredListeners = new Set<SessionListener>()

export function onSessionExpired(listener: SessionListener): () => void {
  sessionExpiredListeners.add(listener)
  return () => sessionExpiredListeners.delete(listener)
}

let refreshInFlight: Promise<boolean> | null = null

/** Rafraîchit la paire de tokens ; un seul appel réseau pour les requêtes simultanées. */
export function refreshTokens(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight
  const refresh = session.getRefresh()
  if (!refresh) return Promise.resolve(false)

  refreshInFlight = (async () => {
    try {
      const response = await fetch(buildUrl('/api/auth/token/refresh/'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refresh }),
      })
      if (!response.ok) return false
      const tokens = (await response.json()) as TokenPair
      session.setTokens(tokens.access, tokens.refresh ?? refresh)
      return true
    } catch {
      return false
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

function expireSession() {
  session.clear()
  sessionExpiredListeners.forEach((listener) => listener())
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined
  const text = await response.text()
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}, retried = false): Promise<T> {
  const { method = 'GET', body, params, signal, auth = true, acceptStatuses = [] } = options
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const access = session.getAccess()
  if (auth && access) headers.Authorization = `Bearer ${access}`

  let response: Response
  try {
    response = await fetch(buildUrl(path, params), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, STATUS_MESSAGES[0])
  }

  if (response.status === 401 && auth && !retried) {
    if (await refreshTokens()) return apiRequest<T>(path, options, true)
    expireSession()
  }

  const data = await readBody(response)
  if (response.ok || acceptStatuses.includes(response.status)) return data as T

  const { message, fieldErrors } = parseErrorBody(response.status, data)
  throw new ApiError(response.status, message, data, fieldErrors)
}

export const api = {
  get: <T>(path: string, params?: QueryParams, signal?: AbortSignal) => apiRequest<T>(path, { params, signal }),
  post: <T>(path: string, body: unknown = {}) => apiRequest<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body: unknown) => apiRequest<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body: unknown) => apiRequest<T>(path, { method: 'PUT', body }),
}

/**
 * Parcourt toutes les pages d'une liste paginée (cartes, agrégats).
 * Plafonné à `maxPages` pour ne jamais charger une table entière par erreur.
 */
export async function fetchAllPages<T>(
  path: string,
  params: QueryParams = {},
  { maxPages = 20, signal }: { maxPages?: number; signal?: AbortSignal } = {},
): Promise<T[]> {
  const items: T[] = []
  for (let page = 1; page <= maxPages; page += 1) {
    const data = await api.get<Paginated<T>>(path, { ...params, page }, signal)
    items.push(...data.results)
    if (!data.next) break
  }
  return items
}
