/**
 * Présentation des badges du donneur (écran « Mes Badges »).
 *
 * Les badges sont attribués côté serveur (sang/gamification.py) à chaque don
 * enregistré ; ce module ne fait que les ordonner et dire où en est le
 * donneur pour chacun.
 *
 * Responsable du domaine : Pape Alioune Sene (application mobile)
 */
import type { IconName } from '@/components/ui/Icon'
import { fromIsoDate, monthLabel } from '@/lib/dates'
import type { BadgeCategory, GamificationBadge, GamificationProfile, Sex } from '@/types/api'

/** Règles du CNTS (mêmes valeurs que backend/sang/eligibility.py). */
export const CNTS = {
  intervalDays: { M: 90, F: 120 } as Record<Sex, number>,
  perYear: { M: 4, F: 3 } as Record<Sex, number>,
  rule: { M: '3 mois entre deux dons, 4 dons par an au plus', F: '4 mois entre deux dons, 3 dons par an au plus' } as Record<Sex, string>,
}
const DAY_MS = 86_400_000
const YEAR_DAYS = 365
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * DAY_MS)

/**
 * Dates les plus proches des ``count`` prochains dons, en respectant
 * l'espacement et le plafond annuel du CNTS à partir des dons passés.
 */
export function projectDonations(sex: Sex, pastIso: readonly string[], count: number, today = new Date()): Date[] {
  const dates = pastIso
    .map((iso) => fromIsoDate(iso))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime())
  const cap = CNTS.perYear[sex]
  const projected: Date[] = []
  for (let i = 0; i < count; i++) {
    let next = startOfDay(today)
    const last = dates[dates.length - 1]
    if (last) next = new Date(Math.max(next.getTime(), addDays(last, CNTS.intervalDays[sex]).getTime()))
    // Plafond : le don N+cap doit venir au moins 365 jours après le don N.
    const anchor = dates[dates.length - cap]
    if (anchor) next = new Date(Math.max(next.getTime(), addDays(anchor, YEAR_DAYS).getTime()))
    dates.push(next)
    projected.push(next)
  }
  return projected
}

/** Pictogramme du serveur → pictogramme de l'application. */
const ICONS: Record<string, IconName> = {
  heart: 'heart',
  repeat: 'pulse',
  award: 'award',
  star: 'sparkle',
  shield: 'shield',
  globe: 'drop',
  zap: 'alert',
}

/** Teinte de la carte selon la famille du badge. */
export const TINT: Record<BadgeCategory, 'brand' | 'warning' | 'info'> = {
  milestone: 'brand',
  solidarity: 'warning',
  special: 'info',
}

/** Conditions particulières (badges sans palier de dons). */
const SPECIAL_CONDITION: Record<string, string> = {
  universal_savior: 'Groupe O−',
  life_saver: 'Urgence critique',
}

export interface BadgeView {
  badge: GamificationBadge
  icon: IconName
  /** Ce qu'il faut accomplir, en une ligne (« 5 dons », « Groupe O− »). */
  condition: string
  /** Où en est le donneur (« Encore 2 dons », « Obtenu »). */
  status: string
  /** Avancement 0..1 ; `null` : condition sans progression mesurable. */
  progress: number | null
}

const dons = (n: number) => `${n} don${n > 1 ? 's' : ''}`

/** ``eta(n)`` : date au plus tôt du n-ième prochain don (règles CNTS). */
export function badgeView(badge: GamificationBadge, donations: number, eta?: (remaining: number) => Date | null): BadgeView {
  const required = badge.required_donations
  const milestone = badge.category === 'milestone' && required > 0
  const condition = SPECIAL_CONDITION[badge.code] ?? (required > 0 ? dons(required) : badge.name)
  let status: string
  let progress: number | null
  if (badge.unlocked) {
    status = 'Obtenu'
    progress = 1
  } else if (milestone) {
    const remaining = required - Math.min(donations, required)
    const when = eta?.(remaining)
    status = `Encore ${dons(remaining)}${when ? ` · au plus tôt en ${monthLabel(when).toLowerCase()}` : ''}`
    progress = Math.min(1, donations / required)
  } else {
    status = badge.description
    progress = null
  }
  return { badge, icon: ICONS[badge.icon] ?? 'award', condition, status, progress }
}

/**
 * Tous les badges dans l'ordre du parcours : paliers de dons croissants,
 * puis les badges particuliers ; obtenus et verrouillés mêlés, comme une
 * échelle à gravir.
 */
export function orderedBadges(profile: GamificationProfile, eta?: (remaining: number) => Date | null): BadgeView[] {
  const rank = (b: GamificationBadge) => (b.category === 'milestone' ? 0 : 1)
  const required = (b: GamificationBadge) => b.required_donations
  return [...profile.badges, ...profile.locked_badges]
    .sort((a, b) => rank(a) - rank(b) || required(a) - required(b) || a.id - b.id)
    .map((badge) => badgeView(badge, profile.donations_count, eta))
}
