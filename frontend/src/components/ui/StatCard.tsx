import React from 'react'

type StatTone = 'success' | 'danger' | 'warning' | 'neutral'

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
  neutral: 'bg-brand',
}

const PILL: Record<StatTone, string> = {
  success: 'bg-ok/10 text-ok',
  danger: 'bg-critical/10 text-critical',
  warning: 'bg-warning/12 text-warning',
  neutral: 'bg-raised text-muted',
}

/**
 * Tuile de métrique : libellé, valeur mono tabulaire, contexte. La valeur
 * passe en rouge seulement quand l'indicateur est critique.
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
  progress,
  onClick,
  className = '',
}) => {
  const Root = onClick ? 'button' : 'div'
  const pct = progress
    ? Math.min(100, Math.max(0, Math.round((progress.value / (progress.max || 100)) * 100)))
    : 0
  const valueColor = badgeTone === 'danger' ? 'text-critical' : 'text-fg'

  return (
    <Root
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={`panel relative flex w-full flex-col p-5 text-left ${
        onClick ? 'cursor-pointer transition-colors hover:border-line-strong' : ''
      } ${className}`}
    >

      <div className="flex items-start justify-between gap-3">
        <span className="eyebrow truncate pt-0.5">{title}</span>
        {icon && (
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line text-muted"
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
      </div>

      <div className="mt-1 flex min-w-0 items-baseline gap-1.5">
        <span className={`num min-w-0 truncate text-[1.75rem] font-semibold leading-tight tracking-tight ${valueColor}`} title={String(value)}>
          {value}
        </span>
        {unit && <span className="text-sm text-muted">{unit}</span>}
      </div>

      {badge && (
        <span
          className={`mt-2 inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-2xs font-semibold ${PILL[badgeTone]}`}
        >
          <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DOT[badgeTone]}`} />
          {badge}
        </span>
      )}

      {progress && (
        <div
          className="mt-3 h-1 w-full overflow-hidden rounded-full bg-raised"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={title}
        >
          <div className={`h-full ${BAR[progress.tone || 'neutral']}`} style={{ width: `${pct}%` }} />
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
