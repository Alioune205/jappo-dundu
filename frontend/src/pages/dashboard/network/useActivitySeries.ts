import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { BloodRequest, Donation, Mission, Paginated } from '@/types/api'

export type ActivityPeriod = 7 | 30 | 90

export interface ActivityDay {
  /** Jour au format AAAA-MM-JJ (Dakar vit à l'heure UTC, sans changement d'heure). */
  day: string
  requests: number
  donations: number
  missions: number
}

export interface ActivitySeries {
  days: ActivityDay[]
  /** Séries réellement chargées (un domaine hors du rôle reste absent, jamais à zéro). */
  available: { requests: boolean; donations: boolean; missions: boolean }
  /** Vrai si le plafond de pages a coupé la période : les premiers jours sont incomplets. */
  partial: boolean
}

/** Pages parcourues au plus par liste (50 éléments chacune). */
const MAX_PAGES = 12

const dayKey = (iso: string) => iso.slice(0, 10)

/**
 * Lit une liste triée du plus récent au plus ancien, page après page, jusqu'à
 * dépasser le début de la période. Aucun filtre de date n'existe côté API :
 * on s'arrête dès que la dernière ligne lue est antérieure à `since`.
 */
async function fetchSince<T>(
  path: string,
  dateOf: (item: T) => string,
  since: string,
  signal?: AbortSignal
): Promise<{ dates: string[]; partial: boolean }> {
  const dates: string[] = []
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const data = await api.get<Paginated<T>>(path, { page }, signal)
    const rows = data?.results ?? []
    for (const row of rows) {
      const day = dayKey(dateOf(row))
      if (day >= since) dates.push(day)
    }
    const last = rows[rows.length - 1]
    if (!data?.next || !last || dayKey(dateOf(last)) < since) return { dates, partial: false }
  }
  return { dates, partial: true }
}

/** Liste des jours de la période, du plus ancien à aujourd'hui. */
export function periodDays(period: ActivityPeriod, now: number): string[] {
  const out: string[] = []
  const today = new Date(now)
  for (let i = period - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i))
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

/**
 * Activité quotidienne du réseau, comptée à partir des enregistrements réels :
 * demandes de sang créées, dons enregistrés, missions SAMU créées.
 */
export function useActivitySeries(
  period: ActivityPeriod,
  now: number,
  scope: { blood: boolean; fleet: boolean }
) {
  const days = periodDays(period, now)
  const since = days[0]

  return useQuery<ActivitySeries>({
    queryKey: ['network-activity', period, since, scope.blood, scope.fleet],
    queryFn: async ({ signal }) => {
      const skip = Promise.resolve(null)
      const settle = <T>(p: Promise<T>) => p.catch(() => null)
      const [requests, donations, missions] = await Promise.all([
        scope.blood
          ? settle(fetchSince<BloodRequest>('/api/sang/requests/', (r) => r.created_at, since, signal))
          : skip,
        scope.blood
          ? settle(fetchSince<Donation>('/api/sang/donations/', (d) => d.donated_on, since, signal))
          : skip,
        scope.fleet
          ? settle(fetchSince<Mission>('/api/ambulances/missions/', (m) => m.created_at, since, signal))
          : skip,
      ])
      const count = (dates: string[] | undefined) => {
        const map = new Map<string, number>()
        for (const d of dates ?? []) map.set(d, (map.get(d) ?? 0) + 1)
        return map
      }
      const r = count(requests?.dates)
      const dn = count(donations?.dates)
      const m = count(missions?.dates)
      return {
        days: days.map((day) => ({
          day,
          requests: r.get(day) ?? 0,
          donations: dn.get(day) ?? 0,
          missions: m.get(day) ?? 0,
        })),
        available: { requests: requests !== null, donations: donations !== null, missions: missions !== null },
        partial: Boolean(requests?.partial || donations?.partial || missions?.partial),
      }
    },
    enabled: scope.blood || scope.fleet,
    staleTime: 60_000,
  })
}
