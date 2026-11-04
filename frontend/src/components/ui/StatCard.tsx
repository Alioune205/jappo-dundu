import React from 'react'
import { ArrowUpRight } from 'lucide-react'
import { CountUp } from '@/components/dash/CountUp'
import { ACCENT_TILE, SIGNAL_DOT, SIGNAL_FILL, SIGNAL_SOFT, type Accent, type Signal } from '@/components/dash/tones'

type StatTone = 'success' | 'danger' | 'warning' | 'neutral'

/** Teinte du pictogramme (sujet de la carte, jamais son état). */
export type StatAccent = 'blue' | 'yellow' | 'green' | 'red'

const STAT_ACCENT: Record<StatAccent, Accent> = { blue: 'blue', yellow: 'amber', green: 'green', red: 'red' }

export interface StatCardProps {
  title: string
  value: string | number
  unit?: string
  trend?: string
  trendTone?: StatTone
  /** Pictogramme en tête de carte, teinté selon accent. */
  icon?: React.ReactNode
  description?: string
  badge?: string
  badgeTone?: StatTone
  accent?: StatAccent
  /** « hero » : la carte mise en avant (liseré d'encre en tête). */
  variant?: 'default' | 'hero'
  /** Série de valeurs réelles (au moins deux) : mini-courbe sous le chiffre. */
  sparkline?: number[]
  /** Rang dans la cascade d'apparition. */
  stagger?: number
  /** Jauge : la part remplie est pleine, le reste sur la piste pâle. */
  progress?: { value: number; max?: number; tone?: StatTone }
  onClick?: () => void
  className?: string
}

const TONE_SIGNAL: Record<StatTone, Signal> = {
  success: 'ok',
  danger: 'critical',
  warning: 'warning',
  neutral: 'neutral',
}

/** Construit le tracé d'une mini-courbe (série réelle uniquement). */
function sparklinePath(points: number[], width = 180, height = 32): string | null {
  if (points.length < 2) return null
  const min = Math.min(...points)
  const range = Math.max(...points) - min || 1
  return points
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / (points.length - 1)) * width).toFixed(1)},${(3 + (height - 6) * (1 - (v - min) / range)).toFixed(1)}`)
    .join(' ')
}

/**
 * Tuile d'indicateur des pages modules : même grammaire que les tableaux de
 * bord (pictogramme teinté, libellé, chiffre, jauge, état). Le pictogramme
 * situe le sujet ; seul l'état (critique, vigilance) porte un jugement.
 */
export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  unit,
  trend,
  trendTone = 'neutral',
  icon,
  description,
  badge,
  badgeTone = 'neutral',
  accent,
  variant = 'default',
  sparkline,
  stagger = 0,
  progress,
  onClick,
  className = '',
}) => {
  const Root = onClick ? 'button' : 'div'
  const featured = variant === 'hero'
  const pct = progress ? Math.min(100, Math.max(0, (progress.value / (progress.max || 100)) * 100)) : 0
  const progressSignal = TONE_SIGNAL[progress?.tone ?? 'neutral']
  const valueIsAlert = badgeTone === 'danger' && typeof value === 'number' && value > 0
  const spark = sparkline ? sparklinePath(sparkline) : null

  return (
    <Root
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      style={{ '--i': stagger } as React.CSSProperties}
      className={`reveal relative flex w-full min-h-[10.5rem] flex-col p-5 text-left ${featured ? 'panel-featured' : 'panel'} ${
        onClick ? 'lift group cursor-pointer' : ''
      } ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        {icon ? (
          <span
            aria-hidden="true"
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.625rem] [&_svg]:h-5 [&_svg]:w-5 ${
              ACCENT_TILE[accent ? STAT_ACCENT[accent] : 'neutral']
            }`}
          >
            {icon}
          </span>
        ) : (
          <span />
        )}
        <span className="flex items-center gap-2">
          {badge && (
            <span
              className={`inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-2xs font-semibold ${SIGNAL_SOFT[TONE_SIGNAL[badgeTone]]}`}
            >
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${SIGNAL_DOT[TONE_SIGNAL[badgeTone]]}`} />
              {badge}
            </span>
          )}
          {onClick && (
            <ArrowUpRight
              aria-hidden="true"
              className="lift-arrow -mr-0.5 h-4 w-4 shrink-0 text-subtle transition-colors group-hover:text-fg"
            />
          )}
        </span>
      </div>

      <span className="mt-4 block text-xs font-semibold leading-snug text-muted">{title}</span>

      <div className="mt-1.5 flex min-h-9 flex-wrap items-baseline gap-x-2 gap-y-1">
        {typeof value === 'number' ? (
          <CountUp
            value={value}
            className={`text-[2rem] font-bold leading-none tracking-[-0.03em] ${valueIsAlert ? 'text-critical' : 'text-fg'}`}
          />
        ) : (
          <span
            className="num min-w-0 truncate text-[2rem] font-bold leading-none tracking-[-0.03em] text-fg"
            title={value}
          >
            {value}
          </span>
        )}
        {unit && <span className="text-sm font-medium text-subtle">{unit}</span>}
      </div>

      {progress && (
        <div
          className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-track"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          aria-label={title}
        >
          <div
            className={`bar-fill bar-grow h-full rounded-full ${
              progressSignal === 'neutral' ? SIGNAL_FILL.ok : SIGNAL_FILL[progressSignal]
            }`}
            style={{ width: `${pct}%`, '--i': stagger } as React.CSSProperties}
          />
        </div>
      )}

      {spark && (
        <svg viewBox="0 0 180 32" preserveAspectRatio="none" className="mt-3 h-8 w-full overflow-visible" aria-hidden="true">
          <path d={spark} fill="none" stroke="var(--viz-base)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}

      {(description || trend) && (
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-4 text-xs">
          {trend && (
            <span
              className={`inline-flex h-6 max-w-full items-center gap-1.5 rounded-full px-2.5 font-medium ${
                SIGNAL_SOFT[TONE_SIGNAL[trendTone]]
              }`}
            >
              <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${SIGNAL_DOT[TONE_SIGNAL[trendTone]]}`} />
              <span className="truncate">{trend}</span>
            </span>
          )}
          {description && <span className="text-subtle">{description}</span>}
        </div>
      )}
    </Root>
  )
}
