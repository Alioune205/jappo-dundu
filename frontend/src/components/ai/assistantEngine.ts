/**
 * Moteur de réponses de Jappo IA, sans modèle de langage.
 *
 * Il applique les principes du dossier technique de l'assistant (v1.1) :
 * lecture seule, aucun chiffre sans source, périmètre du rôle respecté,
 * fraîcheur des données affichée. La question est rattachée à un domaine,
 * les données sont lues dans le cache de l'application (ou demandées à
 * l'API si l'écran ne les a pas encore chargées), puis la réponse est
 * calculée : chaque chiffre vient d'une source datée.
 */
import type { QueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { QK } from '@/lib/queryKeys'
import { formatNumber, formatPercent } from '@/lib/format'
import type {
  Ambulance,
  BedCapacity,
  BedSummaryRow,
  BloodRequest,
  FacilitySummary,
  Mission,
  Prediction,
  PredictionSummaryRow,
} from '@/types/api'

export type Intent = 'beds' | 'blood' | 'fleet' | 'general'
export type SourceKey = 'beds' | 'blood' | 'predictions' | 'fleet' | 'missions'

export const SOURCE_LABEL: Record<SourceKey, string> = {
  beds: 'Lits · capacités déclarées',
  blood: 'Sang · demandes ouvertes',
  predictions: 'Prévisions · pénuries à 7 jours',
  fleet: 'SAMU · flotte',
  missions: 'SAMU · missions actives',
}

export interface Access {
  beds: boolean
  blood: boolean
  fleet: boolean
}

export interface Figure {
  label: string
  value: number
  format?: 'number' | 'percent'
  unit?: string
  alert?: boolean
}

export interface AnswerSource {
  key: SourceKey
  label: string
  /** Horodatage des données utilisées (null : indisponibles). */
  updatedAt: number | null
}

export interface AssistantAnswer {
  summary: string
  figures?: Figure[]
  table?: { headers: [string, string, string]; rows: [string, string, string][] }
  bullets?: string[]
  action?: { to: string; label: string }
  sources: AnswerSource[]
  /** Données manquantes ou hors périmètre : dit clairement, sans estimation. */
  notice?: string
}

/** Minuscules sans accents : « Réanimation » et « reanimation » se valent. */
export const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

const PATTERNS: [Exclude<Intent, 'general'>, RegExp][] = [
  ['fleet', /\b(ambulances?|samu|missions?|flotte|vehicules?|regulation|interventions?)\b/],
  ['blood', /\b(sang|sanguins?|penuries?|poches?|donneurs?|dons?|stocks?|cnts|transfusions?)\b/],
  ['beds', /\b(lits?|rea|reanimation|services?|occupation|hospitali\w*|capacites?|hopitaux|hopital)\b/],
]

export function detectIntent(question: string): Intent {
  const q = normalize(question)
  for (const [intent, pattern] of PATTERNS) if (pattern.test(q)) return intent
  return 'general'
}

/** Sources à consulter pour une intention, dans le périmètre du rôle. */
export function sourcesFor(intent: Intent, access: Access): SourceKey[] {
  const wanted: SourceKey[] =
    intent === 'beds'
      ? ['beds']
      : intent === 'blood'
        ? ['blood', 'predictions']
        : intent === 'fleet'
          ? ['fleet', 'missions']
          : ['beds', 'blood', 'predictions', 'fleet', 'missions']
  return wanted.filter((key) =>
    key === 'beds' ? access.beds : key === 'blood' || key === 'predictions' ? access.blood : access.fleet
  )
}

interface Context {
  bedRows: { label: string; total: number; occupied: number; available: number }[]
  bloodRequests: BloodRequest[]
  criticalForecasts: number
  ambulances: Ambulance[]
  missions: Mission[]
  updatedAt: Partial<Record<SourceKey, number | null>>
}

/**
 * Lit chaque source dans le cache, ou la demande à l'API. `onDone` est
 * appelé à chaque source consultée (trace affichée pendant la recherche).
 */
export async function gatherContext(
  keys: SourceKey[],
  client: QueryClient,
  facility: FacilitySummary | null | undefined,
  onDone: (key: SourceKey) => void
): Promise<Context> {
  const ctx: Context = { bedRows: [], bloodRequests: [], criticalForecasts: 0, ambulances: [], missions: [], updatedAt: {} }
  const cached = <T>(key: readonly unknown[]) => {
    const data = client.getQueryData<T>(key)
    return data === undefined ? null : { data, at: client.getQueryState(key)?.dataUpdatedAt || Date.now() }
  }

  const readers: Record<SourceKey, () => Promise<void>> = {
    beds: async () => {
      const mine = facility ? cached<BedCapacity[]>([...QK.bedCapacities, 'facility', facility.id]) : null
      if (mine) {
        ctx.bedRows = mine.data.map((c) => ({
          label: c.category_display,
          total: c.total_beds,
          occupied: c.occupied_beds,
          available: c.available_beds,
        }))
        ctx.updatedAt.beds = mine.at
        return
      }
      const summary =
        cached<BedSummaryRow[]>(QK.bedsSummary) ??
        ({ data: (await api.get<BedSummaryRow[]>('/api/lits/capacities/summary/')) ?? [], at: Date.now() } as const)
      ctx.bedRows = summary.data.map((r) => ({
        label: `${r.category_display}${r.region_display ? ` (${r.region_display})` : ''}`,
        total: r.total_beds,
        occupied: r.occupied_beds,
        available: r.available_beds,
      }))
      ctx.updatedAt.beds = summary.at
    },
    blood: async () => {
      const hit =
        cached<BloodRequest[]>([...QK.bloodRequests, 'open']) ??
        ({
          data: (await api.get<{ results: BloodRequest[] }>('/api/sang/requests/', { status: 'open' }))?.results ?? [],
          at: Date.now(),
        } as const)
      ctx.bloodRequests = hit.data
      ctx.updatedAt.blood = hit.at
    },
    predictions: async () => {
      const regional = facility ? cached<Prediction[]>([...QK.mlPredictionsList, 'outlook', facility.region]) : null
      if (regional) {
        ctx.criticalForecasts = regional.data.filter((p) => p.risk_level === 'CRITICAL').length
        ctx.updatedAt.predictions = regional.at
        return
      }
      const summary =
        cached<PredictionSummaryRow[]>(QK.predictionsSummary) ??
        ({ data: (await api.get<PredictionSummaryRow[]>('/api/ml/predictions/summary/')) ?? [], at: Date.now() } as const)
      ctx.criticalForecasts = summary.data.reduce((s, p) => s + p.critical_count, 0)
      ctx.updatedAt.predictions = summary.at
    },
    fleet: async () => {
      const hit =
        cached<Ambulance[]>(QK.ambulancesList) ??
        ({
          data: (await api.get<{ results: Ambulance[] }>('/api/ambulances/vehicles/'))?.results ?? [],
          at: Date.now(),
        } as const)
      ctx.ambulances = hit.data
      ctx.updatedAt.fleet = hit.at
    },
    missions: async () => {
      const hit =
        cached<Mission[]>(QK.missionsActive) ??
        ({
          data: (await api.get<{ results: Mission[] }>('/api/ambulances/missions/', { active: true }))?.results ?? [],
          at: Date.now(),
        } as const)
      ctx.missions = hit.data
      ctx.updatedAt.missions = hit.at
    },
  }

  await Promise.all(
    keys.map(async (key) => {
      try {
        await readers[key]()
      } catch {
        // Source injoignable : la réponse le dira, sans estimation.
        ctx.updatedAt[key] = null
      }
      onDone(key)
    })
  )
  return ctx
}

const DOMAIN_NAME: Record<Exclude<Intent, 'general'>, string> = {
  beds: 'les lits hospitaliers',
  blood: 'le sang',
  fleet: 'les ambulances',
}

/** Calcule la réponse à partir des seules données consultées. */
export function buildAnswer(intent: Intent, keys: SourceKey[], ctx: Context): AssistantAnswer {
  const sources: AnswerSource[] = keys.map((key) => ({ key, label: SOURCE_LABEL[key], updatedAt: ctx.updatedAt[key] ?? null }))
  const missing = sources.filter((s) => s.updatedAt === null).map((s) => s.label)
  const notice = missing.length ? `Données indisponibles pour le moment : ${missing.join(', ')}.` : undefined

  if (intent !== 'general' && keys.length === 0) {
    return {
      summary: `Les données sur ${DOMAIN_NAME[intent]} ne relèvent pas de votre rôle : je ne peux pas les consulter.`,
      sources: [],
      notice: 'L’assistant n’accorde jamais plus de droits que votre tableau de bord.',
    }
  }

  const totalBeds = ctx.bedRows.reduce((s, r) => s + r.total, 0)
  const availBeds = ctx.bedRows.reduce((s, r) => s + r.available, 0)
  const bedRate = totalBeds > 0 ? (totalBeds - availBeds) / totalBeds : 0
  const rate = (r: { total: number; occupied: number }) => (r.total > 0 ? r.occupied / r.total : 0)
  const tenseBeds = ctx.bedRows.filter((r) => rate(r) >= 0.85 || (r.total > 0 && r.available === 0)).sort((a, b) => rate(b) - rate(a))

  const openReqs = ctx.bloodRequests
  const criticalReqs = openReqs.filter((r) => r.urgency === 'critical')
  const missingUnits = openReqs.reduce((s, r) => s + r.units_remaining, 0)

  const availAmb = ctx.ambulances.filter((a) => a.status === 'available').length
  const pendingMissions = ctx.missions.filter((m) => m.status === 'pending')

  if (intent === 'beds') {
    return {
      summary:
        totalBeds === 0
          ? 'Aucune capacité hospitalière n’est remontée pour le moment.'
          : `Il y a actuellement ${formatNumber(availBeds)} lits libres sur ${formatNumber(totalBeds)} (${formatPercent(bedRate)} d’occupation). ${
              tenseBeds.length > 0
                ? `${tenseBeds.length} service(s) dépassent 85 % d’occupation.`
                : 'Aucun service ne dépasse le seuil de 85 %.'
            }`,
      figures:
        totalBeds === 0
          ? undefined
          : [
              { label: 'Lits libres', value: availBeds, unit: `/ ${formatNumber(totalBeds)}` },
              { label: 'Occupation', value: bedRate, format: 'percent', alert: bedRate > 0.85 },
              { label: 'Services ≥ 85 %', value: tenseBeds.length, alert: tenseBeds.length > 0 },
            ],
      table:
        ctx.bedRows.length === 0
          ? undefined
          : {
              headers: ['Service', 'Disponibilité', 'Occupation'],
              rows: [...ctx.bedRows]
                .sort((a, b) => rate(b) - rate(a))
                .slice(0, 5)
                .map((r) => [r.label, `${r.available} / ${r.total} libres`, formatPercent(rate(r))]),
            },
      bullets: tenseBeds.length
        ? [`Services à surveiller en priorité : ${tenseBeds.slice(0, 2).map((t) => t.label).join(', ')}.`]
        : undefined,
      action: { to: '/beds', label: 'Ouvrir la page Lits' },
      sources,
      notice,
    }
  }

  if (intent === 'blood') {
    return {
      summary: `On compte ${openReqs.length} demande(s) de sang ouverte(s) pour un besoin total de ${formatNumber(missingUnits)} poche(s), dont ${criticalReqs.length} en urgence vitale. Les prévisions à 7 jours indiquent ${ctx.criticalForecasts} alerte(s) critique(s).`,
      figures: [
        { label: 'Demandes ouvertes', value: openReqs.length },
        { label: 'Poches manquantes', value: missingUnits },
        { label: 'Urgences vitales', value: criticalReqs.length, alert: criticalReqs.length > 0 },
      ],
      table: openReqs.length
        ? {
            headers: ['Groupe', 'Établissement', 'Besoin'],
            rows: openReqs
              .slice(0, 5)
              .map((r) => [r.blood_group.replace('-', '−'), r.facility?.name || 'Établissement', `${r.units_remaining} poche(s) · ${r.urgency_display}`]),
          }
        : undefined,
      bullets: criticalReqs.length
        ? [`Urgence vitale en cours pour : ${criticalReqs.map((r) => r.blood_group.replace('-', '−')).join(', ')}.`]
        : undefined,
      action: { to: '/blood', label: 'Ouvrir la Banque de sang' },
      sources,
      notice,
    }
  }

  if (intent === 'fleet') {
    return {
      summary: `${availAmb} ambulance(s) sur ${ctx.ambulances.length} sont disponibles. Il y a ${ctx.missions.length} mission(s) active(s), dont ${pendingMissions.length} en attente d’affectation.`,
      figures: [
        { label: 'Disponibles', value: availAmb, unit: `/ ${ctx.ambulances.length}`, alert: availAmb <= 1 },
        { label: 'Missions actives', value: ctx.missions.length },
        { label: 'En attente', value: pendingMissions.length, alert: pendingMissions.length > 0 },
      ],
      table: ctx.missions.length
        ? {
            headers: ['Mission', 'Lieu', 'Véhicule'],
            rows: ctx.missions
              .slice(0, 5)
              .map((m) => [m.description || `Mission #${m.id}`, m.pickup_address || '—', m.ambulance ? m.ambulance.plate_number : 'En attente']),
          }
        : undefined,
      action: { to: '/ambulances', label: 'Ouvrir la flotte SAMU' },
      sources,
      notice,
    }
  }

  // Point de situation : un chiffre clé par domaine accessible.
  const bullets: string[] = []
  const figures: Figure[] = []
  if (keys.includes('beds')) {
    bullets.push(`Lits : ${formatNumber(availBeds)} libre(s) sur ${formatNumber(totalBeds)} (${formatPercent(bedRate)} d’occupation).`)
    figures.push({ label: 'Lits libres', value: availBeds, unit: `/ ${formatNumber(totalBeds)}`, alert: bedRate > 0.85 })
  }
  if (keys.includes('blood')) {
    bullets.push(
      `Sang : ${openReqs.length} demande(s) ouverte(s) (${criticalReqs.length} vitale(s)) et ${ctx.criticalForecasts} risque(s) de pénurie à 7 jours.`
    )
    figures.push({ label: 'Urgences vitales', value: criticalReqs.length, alert: criticalReqs.length > 0 })
  }
  if (keys.includes('fleet')) {
    bullets.push(`SAMU : ${availAmb}/${ctx.ambulances.length} ambulance(s) disponible(s), ${pendingMissions.length} mission(s) en attente.`)
    figures.push({ label: 'Ambulances libres', value: availAmb, unit: `/ ${ctx.ambulances.length}`, alert: availAmb <= 1 })
  }
  const urgent = criticalReqs.length + pendingMissions.length + tenseBeds.length
  return {
    summary:
      urgent > 0
        ? 'Voici le point de situation actuel sur votre périmètre. Les points en rouge demandent une action.'
        : 'Voici le point de situation actuel sur votre périmètre : aucune situation critique en cours.',
    figures,
    bullets,
    sources,
    notice,
  }
}

/**
 * Consulte les sources puis calcule la réponse. La trace de consultation
 * reste affichée au moins `minDurationMs` : assez pour être lue, jamais assez
 * pour gêner.
 */
export async function consult(
  intent: Intent,
  keys: SourceKey[],
  client: QueryClient,
  facility: FacilitySummary | null | undefined,
  onDone: (key: SourceKey) => void,
  minDurationMs: number
): Promise<{ answer: AssistantAnswer; answeredAt: number }> {
  const started = Date.now()
  const ctx = await gatherContext(keys, client, facility, onDone)
  const answer = buildAnswer(intent, keys, ctx)
  const elapsed = Date.now() - started
  if (elapsed < minDurationMs) await new Promise((resolve) => setTimeout(resolve, minDurationMs - elapsed))
  return { answer, answeredAt: Date.now() }
}
