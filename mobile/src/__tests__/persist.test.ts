import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient } from '@tanstack/react-query'
import { CACHE_KEY, clearSnapshot, hydrate, loadSnapshot, startPersisting } from '@/lib/persist'
import type { Account } from '@/types/api'

const account = { id: 3, username: 'awa', full_name: 'Awa Ndiaye' } as Account

describe('cache hors ligne', () => {
  beforeEach(async () => {
    jest.useFakeTimers()
    await AsyncStorage.clear()
  })
  afterEach(() => jest.useRealTimers())

  it('écrit les données du donneur, jamais les autres requêtes', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } })
    const stop = startPersisting(client, account)
    client.setQueryData(['nearby'], [{ id: 1 }])
    client.setQueryData(['donor'], { id: 9 })
    client.setQueryData(['autre'], 'ignoré')
    jest.advanceTimersByTime(1000)
    stop()
    jest.useRealTimers()

    const snapshot = await loadSnapshot()
    expect(snapshot?.account.id).toBe(3)
    expect(snapshot?.entries.map((e) => e.key[0]).sort()).toEqual(['donor', 'nearby'])
  })

  it('réinjecte le cache sans écraser une donnée plus récente', () => {
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } })
    client.setQueryData(['donor'], { id: 'frais' }, { updatedAt: 2000 })
    hydrate(client, {
      savedAt: Date.now(),
      account,
      entries: [
        { key: ['donor'], data: { id: 'ancien' }, updatedAt: 1000 },
        { key: ['nearby'], data: [{ id: 1 }], updatedAt: 1000 },
      ],
    })
    expect(client.getQueryData(['donor'])).toEqual({ id: 'frais' })
    expect(client.getQueryData(['nearby'])).toEqual([{ id: 1 }])
  })

  it('ignore un cache périmé (plus de 7 jours) et l’efface', async () => {
    jest.useRealTimers()
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now() - 8 * 86_400_000, account, entries: [] }))
    expect(await loadSnapshot()).toBeNull()
    expect(await AsyncStorage.getItem(CACHE_KEY)).toBeNull()
  })

  it('s’efface à la déconnexion', async () => {
    jest.useRealTimers()
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), account, entries: [] }))
    await clearSnapshot()
    expect(await loadSnapshot()).toBeNull()
  })
})
