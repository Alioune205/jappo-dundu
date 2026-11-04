/**
 * Réponses rapides de l'assistant pour la vue nationale (administrateur général) :
 * situation d'un établissement, lits libres d'un service, demandes d'un groupe
 * sanguin, classement des hôpitaux. Calculées sur les données en direct, sans
 * modèle de langage : aucune donnée ne quitte la plateforme.
 */
import { BED_CATEGORIES, BLOOD_GROUPS } from '@/lib/constants'
import { formatPercent } from '@/lib/format'
import { facilityRows, type FacilityRow, type NetworkLevel } from '@/pages/dashboard/facilityRows'
import type { Ambulance, BedCapacity, BedCategory, BloodGroup, BloodRequest, FacilitySummary } from '@/types/api'

export interface AssistantMetric {
  label: string
  value: string
  tone?: 'danger' | 'warning' | 'success' | 'info'
}

export interface AssistantTableRow {
  col1: string
  col2: string
  col3: string
  badge?: { text: string; tone: 'danger' | 'warning' | 'success' | 'info' | 'neutral' }
}

export interface AssistantResponseBlock {
  summary: string
  metrics?: AssistantMetric[]
  tableHeaders?: [string, string, string]
  tableRows?: AssistantTableRow[]
  recommendations?: string[]
  actionLink?: { to: string; label: string }
  /** Auteur de la réponse : modèle de langage (Gemini, Grok) ou calcul local. */
  source?: string
}

export interface NetworkContext {
  facilities: FacilitySummary[]
  capacities: BedCapacity[]
  bloodRequests: BloodRequest[]
  ambulances: Ambulance[]
}

/** Minuscules, sans accents, signe moins typographique ramené à « - ». */
export const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[−–]/g, '-')
    .toLowerCase()

const words = (text: string) => normalize(text).split(/[^a-z0-9]+/).filter(Boolean)

/** Mots trop courants pour désigner un établissement. */
const GENERIC = new Set([
  'hopital', 'centre', 'hospitalier', 'national', 'nationale', 'universitaire', 'chu', 'general', 'generale',
  'regional', 'regionale', 'dakar', 'transfusion', 'sanguine', 'service', 'ambulances',
  // « SAMU » désigne la flotte entière (question générale), pas l'établissement.
  'samu',
])

/** Mots qui désignent un établissement : « fann », « pikine », « cnts », « idrissa »… */
const facilityKeywords = (facility: FacilitySummary) =>
  words(facility.name).filter((w) => w.length >= 3 && !GENERIC.has(w) && !/^\d+$/.test(w))

export function findFacility(query: string, facilities: FacilitySummary[]) {
  const asked = new Set(words(query))
  return facilities.find((f) => facilityKeywords(f).some((k) => asked.has(k)))
}

/** Mots qui désignent un service ; « urgences » et « médecine » exigent de parler de lits. */
const CATEGORY_WORDS: { category: BedCategory; pattern: RegExp; needsBeds?: boolean }[] = [
  { category: 'intensive_care', pattern: /\b(rea|reanimation|soins intensifs)\b/ },
  { category: 'neonatology', pattern: /\bneonat/ },
  { category: 'maternity', pattern: /\bmaternite/ },
  { category: 'pediatrics', pattern: /\bpediatri/ },
  { category: 'surgery', pattern: /\bchirurgi/ },
  { category: 'emergency', pattern: /\burgences?\b/, needsBeds: true },
  { category: 'internal_medicine', pattern: /\bmedecine\b/, needsBeds: true },
]

export function findCategory(query: string): BedCategory | undefined {
  const q = normalize(query)
  const aboutBeds = /\b(lits?|places?)\b/.test(q)
  return CATEGORY_WORDS.find((c) => c.pattern.test(q) && (!c.needsBeds || aboutBeds))?.category
}

/** « O- », « o+ », « AB négatif », « b pos »… */
export function findBloodGroup(query: string): BloodGroup | undefined {
  const match = normalize(query).match(/\b(ab|a|b|o)\s?(\+|-|positif|negatif|pos|neg)(?![a-z])/)
  if (!match) return undefined
  const sign = match[2].startsWith('-') || match[2].startsWith('neg') ? '-' : '+'
  const group = `${match[1].toUpperCase()}${sign}` as BloodGroup
  return BLOOD_GROUPS.includes(group) ? group : undefined
}

const RANKING = /(sature|plus tendu|classement|quels? hopita|hopitaux|etablissements)/

const LEVEL_BADGE: Record<NetworkLevel, AssistantTableRow['badge']> = {
  alert: { text: 'Alerte', tone: 'danger' },
  vigilance: { text: 'Vigilance', tone: 'warning' },
  normal: { text: 'Normal', tone: 'success' },
}

const rateBadge = (available: number, rate: number): AssistantTableRow['badge'] =>
  available === 0
    ? { text: 'Complet', tone: 'danger' }
    : rate >= 0.85
      ? { text: 'Tension', tone: 'warning' }
      : { text: 'Disponible', tone: 'success' }

const s = (n: number) => (n > 1 ? 's' : '')

function facilityAnswer(row: FacilityRow, ctx: NetworkContext): AssistantResponseBlock {
  const services = ctx.capacities.filter((c) => c.facility?.id === row.facility.id)
  const parts = [
    row.totalBeds > 0
      ? `${row.availableBeds} lit${s(row.availableBeds)} libre${s(row.availableBeds)} sur ${row.totalBeds} (${formatPercent(row.occupancy ?? 0)} d’occupation)`
      : null,
    `${row.openRequests} demande${s(row.openRequests)} de sang ouverte${s(row.openRequests)}${row.criticalRequests > 0 ? `, dont ${row.criticalRequests} vitale${s(row.criticalRequests)}` : ''}`,
    row.ambulances > 0 ? `${row.availableAmbulances} ambulance${s(row.availableAmbulances)} libre${s(row.availableAmbulances)} sur ${row.ambulances}` : null,
  ].filter(Boolean)
  return {
    summary: `${row.facility.name} (${row.facility.city}) : ${parts.join(' · ')}.`,
    metrics: [
      { label: 'Lits libres', value: row.totalBeds > 0 ? `${row.availableBeds} / ${row.totalBeds}` : '—', tone: 'info' },
      { label: 'Services saturés', value: `${row.saturatedServices}`, tone: row.saturatedServices > 0 ? 'danger' : 'success' },
      { label: 'État', value: LEVEL_BADGE[row.level]!.text, tone: row.level === 'alert' ? 'danger' : row.level === 'vigilance' ? 'warning' : 'success' },
    ],
    ...(services.length > 0 && {
      tableHeaders: ['Service', 'Lits libres', 'Occupation'] as [string, string, string],
      tableRows: [...services]
        .sort((a, b) => b.occupied_beds / (b.total_beds || 1) - a.occupied_beds / (a.total_beds || 1))
        .map((c) => {
          const rate = c.total_beds > 0 ? (c.total_beds - c.available_beds) / c.total_beds : 0
          return { col1: c.category_display, col2: `${c.available_beds} / ${c.total_beds}`, col3: formatPercent(rate), badge: rateBadge(c.available_beds, rate) }
        }),
    }),
    recommendations:
      row.level === 'alert'
        ? [`Établissement en tension : suivre son évolution et, si besoin, contacter sa direction ou la régulation SAMU.`]
        : row.level === 'vigilance'
          ? ['Situation à surveiller : vérifier que les chiffres sont confirmés régulièrement.']
          : ['Situation normale.'],
    actionLink: row.totalBeds > 0 ? { to: '/beds', label: 'Voir le détail des lits' } : undefined,
  }
}

function categoryAnswer(category: BedCategory, ctx: NetworkContext): AssistantResponseBlock {
  const label = BED_CATEGORIES.find((c) => c.value === category)?.label ?? category
  const services = ctx.capacities
    .filter((c) => c.category === category)
    .sort((a, b) => b.available_beds - a.available_beds)
  const free = services.reduce((acc, c) => acc + c.available_beds, 0)
  const total = services.reduce((acc, c) => acc + c.total_beds, 0)
  return {
    summary:
      services.length === 0
        ? `Aucun établissement ne déclare de lits en ${label.toLowerCase()}.`
        : `${free} lit${s(free)} libre${s(free)} en ${label.toLowerCase()} sur ${total}, dans ${services.length} établissement${s(services.length)}.${
            services[0].available_beds > 0 ? ` Le plus de places : ${services[0].facility.name}.` : ' Tous les services sont complets.'
          }`,
    ...(services.length > 0 && {
      tableHeaders: ['Établissement', 'Lits libres', 'Occupation'] as [string, string, string],
      tableRows: services.map((c) => {
        const rate = c.total_beds > 0 ? (c.total_beds - c.available_beds) / c.total_beds : 0
        return { col1: c.facility.name, col2: `${c.available_beds} / ${c.total_beds}`, col3: formatPercent(rate), badge: rateBadge(c.available_beds, rate) }
      }),
    }),
    recommendations: free === 0 && services.length > 0 ? [`Aucune place libre en ${label.toLowerCase()} : situation en tension sur tout le réseau.`] : undefined,
    actionLink: { to: '/beds', label: 'Voir les lits' },
  }
}

function bloodGroupAnswer(group: BloodGroup, ctx: NetworkContext): AssistantResponseBlock {
  const requests = ctx.bloodRequests.filter((r) => r.blood_group === group)
  const critical = requests.filter((r) => r.urgency === 'critical')
  const missing = requests.reduce((acc, r) => acc + r.units_remaining, 0)
  return {
    summary:
      requests.length === 0
        ? `Aucune demande de sang ${group} ouverte en ce moment.`
        : `${requests.length} demande${s(requests.length)} ${group} ouverte${s(requests.length)}, ${missing} poche${s(missing)} manquante${s(missing)}${
            critical.length > 0 ? `, dont ${critical.length} en urgence vitale` : ''
          }.`,
    ...(requests.length > 0 && {
      tableHeaders: ['Établissement', 'Poches manquantes', 'Urgence'] as [string, string, string],
      tableRows: requests.map((r) => ({
        col1: r.facility?.name ?? '—',
        col2: `${r.units_remaining} / ${r.units_needed}`,
        col3: r.urgency_display,
        badge: { text: r.urgency_display, tone: r.urgency === 'critical' ? 'danger' : r.urgency === 'urgent' ? 'warning' : 'info' },
      })),
    }),
    recommendations: [
      ...(critical.length > 0 ? [`Urgence vitale en ${group} : suivre la mobilisation des donneurs avec le CNTS.`] : []),
      ...(group === 'O-' ? ['Le O− est donneur universel : sa pénurie touche tous les groupes.'] : []),
    ],
    actionLink: { to: '/blood', label: 'Voir les demandes de sang' },
  }
}

function rankingAnswer(rows: FacilityRow[]): AssistantResponseBlock {
  const hospitals = rows.filter((r) => r.totalBeds > 0)
  const alerts = hospitals.filter((r) => r.level === 'alert')
  return {
    summary:
      hospitals.length === 0
        ? 'Aucun établissement ne déclare de lits.'
        : `${alerts.length} établissement${s(alerts.length)} en alerte sur ${hospitals.length}. Le plus tendu : ${hospitals[0].facility.name} (${formatPercent(hospitals[0].occupancy ?? 0)} d’occupation).`,
    tableHeaders: ['Établissement', 'Lits libres', 'Occupation'],
    tableRows: hospitals.map((r) => ({
      col1: r.facility.name,
      col2: `${r.availableBeds} / ${r.totalBeds}`,
      col3: formatPercent(r.occupancy ?? 0),
      badge: LEVEL_BADGE[r.level],
    })),
    actionLink: { to: '/', label: 'Voir le tableau de bord' },
  }
}

/** Réponse à une question précise sur le réseau, ou undefined si la question est générale. */
export function answerNetworkQuestion(query: string, ctx: NetworkContext): AssistantResponseBlock | undefined {
  const rows = facilityRows(ctx.facilities, ctx.capacities, ctx.bloodRequests, ctx.ambulances)
  const facility = findFacility(query, ctx.facilities)
  if (facility) {
    const row = rows.find((r) => r.facility.id === facility.id)
    if (row) return facilityAnswer(row, ctx)
  }
  const group = findBloodGroup(query)
  if (group) return bloodGroupAnswer(group, ctx)
  const category = findCategory(query)
  if (category) return categoryAnswer(category, ctx)
  if (RANKING.test(normalize(query))) return rankingAnswer(rows)
  return undefined
}
