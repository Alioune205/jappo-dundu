import React from 'react'

export interface StatCardProps {
  title: string
  value: string | number
  unit?: string
  trend?: string
  trendTone?: 'success' | 'danger' | 'warning' | 'neutral'
  icon?: React.ReactNode
  description?: string
  badge?: string
  badgeTone?: 'success' | 'danger' | 'warning' | 'neutral'
  onClick?: () => void
  className?: string
}

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
  onClick,
  className = '',
}) => {
  const trendColor = {
    success: 'text-emerald-600 dark:text-emerald-400',
    danger: 'text-rose-600 dark:text-rose-400',
    warning: 'text-amber-600 dark:text-amber-400',
    neutral: 'text-[var(--text-muted)]',
  }[trendTone]

  const badgeStyles = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
    danger: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
    warning: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
    neutral: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  }[badgeTone]

  return (
    <div
      onClick={onClick}
      className={`clinical-card p-5 transition-all ${
        onClick ? 'cursor-pointer hover:-translate-y-0.5' : ''
      } ${className}`}
    >
      {/* En-tête : Titre & Icône */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          {title}
        </span>
        {icon && (
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-main)] bg-[var(--bg-subtle)] text-[var(--text-muted)] shrink-0">
            {icon}
          </div>
        )}
      </div>

      {/* Valeur & Unité */}
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-3xl font-bold tracking-tight text-[var(--text-main)] font-mono">
          {value}
        </span>
        {unit && <span className="text-xs font-medium text-[var(--text-muted)]">{unit}</span>}
      </div>

      {/* Détails & Statut sans coupure */}
      {(description || trend || badge) && (
        <div className="mt-4 flex flex-col gap-1.5 border-t border-[var(--border-subtle)] pt-3">
          <div className="flex items-center justify-between gap-2">
            {description && (
              <span className="text-xs text-[var(--text-muted)] leading-tight">
                {description}
              </span>
            )}
            {badge && (
              <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold border ${badgeStyles}`}>
                {badge}
              </span>
            )}
          </div>
          {trend && (
            <div className={`text-xs font-semibold flex items-center gap-1.5 ${trendColor}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {trend}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
