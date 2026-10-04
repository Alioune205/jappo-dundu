/**
 * Cache hors ligne (AsyncStorage) des données du donneur.
 *
 * Le réseau est souvent intermittent : à l'ouverture, l'application affiche
 * immédiatement les dernières alertes, l'historique et le profil connus,
 * puis les rafraîchit. Seules les requêtes listées dans PERSISTED sont
 * écrites ; rien de sensible au-delà de ce que l'écran affiche (les jetons
 * restent dans SecureStore). Le cache est effacé à la déconnexion et à tout
 * changement de compte : deux personnes partageant un téléphone ne voient
 * jamais les données l'une de l'autre.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { QueryClient, QueryKey } from '@tanstack/react-query'
import type { Account } from '@/types/api'

export const CACHE_KEY = 'jappo-dundu.cache.v1'
const MAX_AGE_MS = 7 * 24 * 3600 * 1000
const WRITE_DELAY_MS = 600
/** Premier segment des clés de requête conservées hors ligne. */
const PERSISTED = new Set(['donor', 'nearby', 'history'])

interface Entry {
  key: QueryKey
  data: unknown
  updatedAt: number
}

export interface Snapshot {
  savedAt: number
  account: Account
  entries: Entry[]
}

export async function loadSnapshot(): Promise<Snapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const snapshot = JSON.parse(raw) as Snapshot
    if (!snapshot?.account || Date.now() - snapshot.savedAt > MAX_AGE_MS) {
      await AsyncStorage.removeItem(CACHE_KEY)
      return null
    }
    return snapshot
  } catch {
    return null
  }
}

/** Réinjecte le cache sans écraser une donnée plus récente déjà en mémoire. */
export function hydrate(client: QueryClient, snapshot: Snapshot) {
  for (const { key, data, updatedAt } of snapshot.entries) {
    const current = client.getQueryState(key)
    if (!current || current.dataUpdatedAt < updatedAt) client.setQueryData(key, data, { updatedAt })
  }
}

/** Écrit le cache (avec un léger différé) à chaque succès de requête ; retourne le désabonnement. */
export function startPersisting(client: QueryClient, account: Account) {
  let timer: ReturnType<typeof setTimeout> | null = null
  const write = () => {
    timer = null
    const entries: Entry[] = client
      .getQueryCache()
      .getAll()
      .filter((query) => PERSISTED.has(String(query.queryKey[0])) && query.state.status === 'success')
      .map((query) => ({ key: query.queryKey, data: query.state.data, updatedAt: query.state.dataUpdatedAt }))
    const snapshot: Snapshot = { savedAt: Date.now(), account, entries }
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify(snapshot)).catch(() => undefined)
  }
  const schedule = () => {
    if (!timer) timer = setTimeout(write, WRITE_DELAY_MS)
  }
  const unsubscribe = client.getQueryCache().subscribe((event) => {
    if (event.type === 'updated' && event.action.type === 'success' && PERSISTED.has(String(event.query.queryKey[0]))) schedule()
  })
  schedule()
  return () => {
    unsubscribe()
    if (timer) clearTimeout(timer)
  }
}

export async function clearSnapshot() {
  await AsyncStorage.removeItem(CACHE_KEY).catch(() => undefined)
}
