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
  neutral: 'bg-fg',
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
      className={`flex w-full flex-col rounded-md border border-line bg-surface p-4 text-left ${
        onClick ? 'cursor-pointer transition-colors hover:border-line-strong' : ''
      } ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow truncate">{title}</span>
        {badge ? (
          <span className={`inline-flex items-center gap-1.5 text-2xs font-medium ${TEXT[badgeTone]}`}>
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DOT[badgeTone]}`} />
            {badge}
          </span>
        ) : icon ? (
          <span className="shrink-0 text-subtle" aria-hidden="true">
            {icon}
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={`num text-2xl font-medium leading-none ${valueColor}`}>{value}</span>
        {unit && <span className="text-xs text-muted">{unit}</span>}
      </div>

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
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2 text-xs">
          {description && <span className="truncate text-muted">{description}</span>}
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
