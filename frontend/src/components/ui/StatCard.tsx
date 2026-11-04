import React from 'react'
import { ArrowUpRight } from 'lucide-react'
import { CountUp } from '@/components/dash/CountUp'
import { SIGNAL_DOT, SIGNAL_FILL, SIGNAL_SOFT, type Signal } from '@/components/dash/tones'

type StatTone = 'success' | 'danger' | 'warning' | 'neutral'

/** Ancienne couleur d'identité de la carte : elle ne sert plus qu'à donner un sens à la jauge. */
export type StatAccent = 'blue' | 'yellow' | 'green' | 'red'

export interface StatCardProps {
  title: string
  value: string | number
  unit?: string
  trend?: string
  trendTone?: StatTone
  /** Pictogramme discret en haut à droite (remplacé par une flèche si la carte est cliquable). */
  icon?: React.ReactNode
  description?: string
  badge?: string
  badgeTone?: StatTone
  accent?: StatAccent
  /** « hero » : la carte mise en avant (voile bleu pâle). */
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
 * bord (libellé, chiffre, jauge, état teinté). Seul le sens (critique,
 * vigilance) prend une couleur.
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
        <span className="text-sm font-medium text-muted">{title}</span>
        {(onClick || icon) && (
          <span
            aria-hidden="true"
            className={`lift-arrow -mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-subtle [&_svg]:h-4 [&_svg]:w-4 ${
              featured ? 'bg-surface/80' : 'bg-sunken'
            }`}
          >
            {onClick ? <ArrowUpRight /> : icon}
          </span>
        )}
      </div>

      <div className="mt-3 flex min-h-11 flex-wrap items-baseline gap-x-2 gap-y-1">
        {typeof value === 'number' ? (
          <CountUp
            value={value}
            className={`text-[2.25rem] font-semibold leading-none tracking-[-0.035em] ${valueIsAlert ? 'text-critical' : 'text-fg'}`}
          />
        ) : (
          <span
            className="num min-w-0 truncate text-[2.25rem] font-semibold leading-none tracking-[-0.035em] text-fg"
            title={value}
          >
            {value}
          </span>
        )}
        {unit && <span className="text-sm text-subtle">{unit}</span>}
        {badge && (
          <span
            className={`ml-auto inline-flex h-6 items-center gap-1.5 self-center rounded-full px-2.5 text-2xs font-medium ${SIGNAL_SOFT[TONE_SIGNAL[badgeTone]]}`}
          >
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${SIGNAL_DOT[TONE_SIGNAL[badgeTone]]}`} />
            {badge}
          </span>
        )}
      </div>

      {progress && (
        <div
          className={`mt-4 h-1.5 w-full overflow-hidden rounded-full ${featured ? 'bg-surface/80' : 'bg-track'}`}
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
                featured && trendTone === 'neutral' ? 'bg-surface/80 text-muted' : SIGNAL_SOFT[TONE_SIGNAL[trendTone]]
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
