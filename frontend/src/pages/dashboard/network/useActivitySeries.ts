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
  /** Même nombre de jours, juste avant la période : base de comparaison. */
  previous: ActivityDay[]
  /** Séries réellement chargées (un domaine hors du rôle reste absent, jamais à zéro). */
  available: { requests: boolean; donations: boolean; missions: boolean }
  /** Vrai si le plafond de pages a coupé la période : les premiers jours sont incomplets. */
  partial: boolean
  /** Vrai si la période précédente n'a pas pu être lue en entier (comparaison masquée). */
  previousPartial: boolean
}

/** Pages parcourues au plus par liste (50 éléments chacune), selon la profondeur lue. */
const maxPages = (days: number) => (days <= 60 ? 12 : 30)

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
  pages: number,
  signal?: AbortSignal
): Promise<{ dates: string[]; partial: boolean; oldest: string | null }> {
  const dates: string[] = []
  let oldest: string | null = null
  for (let page = 1; page <= pages; page += 1) {
    const data = await api.get<Paginated<T>>(path, { page }, signal)
    const rows = data?.results ?? []
    for (const row of rows) {
      const day = dayKey(dateOf(row))
      if (day >= since) dates.push(day)
      if (!oldest || day < oldest) oldest = day
    }
    const last = rows[rows.length - 1]
    if (!data?.next || !last || dayKey(dateOf(last)) < since) return { dates, partial: false, oldest }
  }
  return { dates, partial: true, oldest }
}

/** Liste des jours de la période, du plus ancien à aujourd'hui. */
export function periodDays(period: number, now: number): string[] {
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
  // Deux périodes d'affilée : la période affichée et celle qui la précède.
  const span = periodDays(period * 2, now)
  const previousDays = span.slice(0, period)
  const days = span.slice(period)
  const since = previousDays[0]
  const pages = maxPages(period * 2)

  return useQuery<ActivitySeries>({
    queryKey: ['network-activity', period, since, scope.blood, scope.fleet],
    queryFn: async ({ signal }) => {
      const skip = Promise.resolve(null)
      const settle = <T>(p: Promise<T>) => p.catch(() => null)
      const [requests, donations, missions] = await Promise.all([
        scope.blood
          ? settle(fetchSince<BloodRequest>('/api/sang/requests/', (r) => r.created_at, since, pages, signal))
          : skip,
        scope.blood
          ? settle(fetchSince<Donation>('/api/sang/donations/', (d) => d.donated_on, since, pages, signal))
          : skip,
        scope.fleet
          ? settle(fetchSince<Mission>('/api/ambulances/missions/', (m) => m.created_at, since, pages, signal))
          : skip,
      ])
      const loaded = [requests, donations, missions].filter((s) => s !== null)
      // Une liste coupée par le plafond n'est complète qu'à partir du plus ancien jour lu.
      const cutAt = (s: { partial: boolean; oldest: string | null }) => (s.partial ? (s.oldest ?? '9999') : '')
      const firstComplete = loaded.reduce((acc, s) => (cutAt(s) > acc ? cutAt(s) : acc), '')
      const count = (dates: string[] | undefined) => {
        const map = new Map<string, number>()
        for (const d of dates ?? []) map.set(d, (map.get(d) ?? 0) + 1)
        return map
      }
      const r = count(requests?.dates)
      const dn = count(donations?.dates)
      const m = count(missions?.dates)
      const toDays = (list: string[]) =>
        list.map((day) => ({
          day,
          requests: r.get(day) ?? 0,
          donations: dn.get(day) ?? 0,
          missions: m.get(day) ?? 0,
        }))
      return {
        days: toDays(days),
        previous: toDays(previousDays),
        available: { requests: requests !== null, donations: donations !== null, missions: missions !== null },
        partial: firstComplete > days[0],
        previousPartial: firstComplete > previousDays[0],
      }
    },
    enabled: scope.blood || scope.fleet,
    staleTime: 60_000,
  })
}
