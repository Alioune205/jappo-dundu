/**
 * Sens d'une valeur sur les tableaux de bord. Un même sens a toujours la même
 * couleur, quel que soit le module : rouge = critique, ambre = vigilance,
 * encre = nominal (calme : seules les exceptions sont colorées).
 */
export type Signal = 'critical' | 'warning' | 'ok' | 'info' | 'neutral'

/** Pastille sur fond clair. */
export const SIGNAL_DOT: Record<Signal, string> = {
  critical: 'bg-critical',
  warning: 'bg-viz-warn',
  ok: 'bg-ok',
  info: 'bg-info',
  neutral: 'bg-subtle',
}

/** Étiquette d'état teintée : fond pâle et texte à la couleur du sens. */
export const SIGNAL_SOFT: Record<Signal, string> = {
  critical: 'bg-critical/10 text-critical',
  warning: 'bg-warning/10 text-warning',
  ok: 'bg-ok/10 text-ok',
  info: 'bg-info/10 text-info',
  neutral: 'bg-sunken text-muted',
}

export const SIGNAL_TEXT: Record<Signal, string> = {
  critical: 'text-critical',
  warning: 'text-warning',
  ok: 'text-ok',
  info: 'text-info',
  neutral: 'text-muted',
}

/** Remplissage d'une forme de données (capsule, barre, jauge). */
export const SIGNAL_FILL: Record<Signal, string> = {
  critical: 'bg-viz-crit',
  warning: 'bg-viz-warn',
  ok: 'bg-viz-base',
  info: 'bg-info',
  neutral: 'bg-viz-base-soft',
}

/** Seuils d'occupation hospitalière communs à tous les écrans. */
export const OCCUPANCY_WARNING = 0.7
export const OCCUPANCY_CRITICAL = 0.85

export function occupancySignal(rate: number | null | undefined): Signal {
  if (rate == null) return 'neutral'
  return rate > OCCUPANCY_CRITICAL ? 'critical' : rate > OCCUPANCY_WARNING ? 'warning' : 'ok'
}

/**
 * Teinte d'un pictogramme d'indicateur. Convention : rouge = sang, bleu =
 * lits, vert = SAMU, violet = prévisions, ambre = attente et délais. Elle
 * situe le sujet, elle ne juge pas : l'état reste porté par Signal.
 */
export type Accent = 'red' | 'blue' | 'green' | 'violet' | 'amber' | 'neutral'

/** Pastille de pictogramme : fond pâle et trait à la teinte choisie. */
export const ACCENT_TILE: Record<Accent, string> = {
  red: 'bg-tint-red-soft text-tint-red',
  blue: 'bg-tint-blue-soft text-tint-blue',
  green: 'bg-tint-green-soft text-tint-green',
  violet: 'bg-tint-violet-soft text-tint-violet',
  amber: 'bg-tint-amber-soft text-tint-amber',
  neutral: 'bg-sunken text-muted',
}

/** Variable CSS de la teinte (fond de carte teinté, pictogramme plein, mini-courbe). */
export const ACCENT_VAR: Record<Accent, string> = {
  red: 'var(--tint-red)',
  blue: 'var(--tint-blue)',
  green: 'var(--tint-green)',
  violet: 'var(--tint-violet)',
  amber: 'var(--tint-amber)',
  neutral: 'var(--fg-subtle)',
}
