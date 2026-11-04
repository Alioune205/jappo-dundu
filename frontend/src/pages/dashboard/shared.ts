/**
 * Petits utilitaires partagés par les tableaux de bord : libellés, accords,
 * délais. Aucun calcul métier ici : seulement de la présentation.
 */
import { BED_CATEGORIES } from '@/lib/constants'
import type { BedCategory, BloodGroup } from '@/types/api'

/** « O- » → « O− » (vrai signe moins, aligné avec le « + »). */
export const groupLabel = (group: BloodGroup | string) => group.replace('-', '−')

/** « 1 vitale », « 2 vitales ». */
export const plural = (n: number, word: string, pluralWord = `${word}s`) => `${n} ${n > 1 ? pluralWord : word}`

/** Étape d'une mission active (0 à 3), dans l'ordre de la chaîne de secours. */
export const MISSION_STEP: Record<string, number> = { pending: 0, assigned: 1, on_site: 2, transporting: 3 }

/** Minutes écoulées depuis une date ISO (null sans date). */
export const minutesSince = (iso: string | null | undefined, now: number) =>
  iso ? (now - new Date(iso).getTime()) / 60_000 : null

/** Services vitaux : leur saturation est toujours critique. */
export const VITAL_CATEGORIES: ReadonlySet<BedCategory> = new Set(
  BED_CATEGORIES.filter((c) => c.vital).map((c) => c.value)
)

/** Libellés courts des services, pour les axes et capsules. */
const SHORT_CATEGORY: Partial<Record<BedCategory, string>> = {
  intensive_care: 'Réanimation',
}
export const shortCategory = (category: BedCategory, display: string) => SHORT_CATEGORY[category] ?? display

/** Durée « hh:mm:ss » (chronomètre de régulation). */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return [hh, mm, ss].map((v) => String(v).padStart(2, '0')).join(':')
}

/** Date courte de Dakar : « 12 oct. ». */
const shortDay = new Intl.DateTimeFormat('fr-SN', { day: 'numeric', month: 'short', timeZone: 'Africa/Dakar' })
const longDay = new Intl.DateTimeFormat('fr-SN', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'Africa/Dakar',
})
export const formatDay = (iso: string) => shortDay.format(new Date(`${iso}T12:00:00Z`))
export const formatLongDay = (iso: string) => longDay.format(new Date(`${iso}T12:00:00Z`))
