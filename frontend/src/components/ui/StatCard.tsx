import React from 'react'

type StatTone = 'success' | 'danger' | 'warning' | 'neutral'

/** Couleur d'identité de la carte : liseré gauche, cercle de l'icône, chiffre. */
export type StatAccent = 'blue' | 'yellow' | 'green' | 'red'

export interface StatCardProps {
  title: string
  value: string | number
  unit?: string
  trend?: string
  trendTone?: StatTone
  icon?: React.ReactNode
  description?: string
  badge?: string
  badgeTone?: StatTone
  /** Par défaut : rouge si l'indicateur est critique, sinon bleu. */
  accent?: StatAccent
  progress?: { value: number; max?: number; tone?: StatTone }
  onClick?: () => void
  className?: string
}

const DOT: Record<StatTone, string> = {
  success: 'bg-ok',
  danger: 'bg-critical',
  warning: 'bg-warning',
  neutral: 'bg-subtle',
}

const TEXT: Record<StatTone, string> = {
  success: 'text-ok',
  danger: 'text-critical',
  warning: 'text-warning',
  neutral: 'text-muted',
}

const BAR: Record<StatTone, string> = {
  success: 'bg-ok',
  danger: 'bg-critical',
  warning: 'bg-warning',
  neutral: 'bg-accent-blue',
}

const PILL: Record<StatTone, string> = {
  success: 'bg-ok/10 text-ok',
  danger: 'bg-critical text-white',
  warning: 'bg-warning/15 text-warning',
  neutral: 'bg-raised text-muted',
}

const ACCENT: Record<StatAccent, { border: string; circle: string; value: string }> = {
  blue: { border: 'border-l-accent-blue', circle: 'bg-accent-blue/12 text-accent-blue', value: 'text-fg' },
  yellow: { border: 'border-l-accent-yellow', circle: 'bg-accent-yellow/15 text-warning', value: 'text-warning' },
  green: { border: 'border-l-accent-green', circle: 'bg-accent-green/12 text-accent-green', value: 'text-accent-green' },
  red: { border: 'border-l-accent-red', circle: 'bg-accent-red/12 text-accent-red', value: 'text-accent-red' },
}

/**
 * Tuile de métrique : liseré gauche et icône à la couleur de la carte,
 * libellé, valeur en grand, contexte.
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
  progress,
  onClick,
  className = '',
}) => {
  const Root = onClick ? 'button' : 'div'
  const pct = progress
    ? Math.min(100, Math.max(0, Math.round((progress.value / (progress.max || 100)) * 100)))
    : 0
  const style = ACCENT[accent ?? (badgeTone === 'danger' ? 'red' : 'blue')]
  const valueColor = badgeTone === 'danger' ? 'text-critical' : style.value

  return (
    <Root
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={`panel relative flex w-full flex-col border-l-4 p-5 text-left ${style.border} ${
        onClick ? 'cursor-pointer transition-shadow hover:shadow-[var(--shadow-raised)]' : ''
      } ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="block text-sm font-medium leading-snug text-muted">{title}</span>
          <div className="mt-1.5 flex min-w-0 items-baseline gap-1.5">
            <span
              className={`num min-w-0 truncate text-[1.75rem] font-bold leading-tight ${valueColor}`}
              title={String(value)}
            >
              {value}
            </span>
            {unit && <span className="text-sm text-muted">{unit}</span>}
          </div>
        </div>
        {icon && (
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${style.circle}`}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
      </div>

      {badge && (
        <span
          className={`mt-2.5 inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-2xs font-semibold ${PILL[badgeTone]}`}
        >
          {badgeTone !== 'danger' && (
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DOT[badgeTone]}`} />
          )}
          {badge}
        </span>
      )}

      {progress && (
        <div
          className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-raised"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={title}
        >
          <div className={`h-full rounded-full ${BAR[progress.tone || 'neutral']}`} style={{ width: `${pct}%` }} />
        </div>
      )}

      {(description || trend) && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line pt-3 text-xs">
          {description && <span className="text-muted">{description}</span>}
          {trend && (
            <span className={`inline-flex shrink-0 items-center gap-1.5 font-medium ${TEXT[trendTone]}`}>
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DOT[trendTone]}`} />
              {trend}
            </span>
          )}
        </div>
      )}
    </Root>
  )
}
