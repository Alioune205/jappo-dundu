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
  progress?: { value: number; max?: number; tone?: 'success' | 'warning' | 'danger' | 'neutral' }
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
  progress,
  onClick,
  className = '',
}) => {
  const trendDotColor = {
    success: 'bg-emerald-500',
    danger: 'bg-red-500',
    warning: 'bg-amber-500',
    neutral: 'bg-slate-400 dark:bg-slate-500',
  }[trendTone]

  const trendTextColor = {
    success: 'text-emerald-700 dark:text-emerald-400',
    danger: 'text-red-700 dark:text-red-400',
    warning: 'text-amber-700 dark:text-amber-400',
    neutral: 'text-slate-600 dark:text-slate-400',
  }[trendTone]

  const badgeStyles = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/80',
    danger: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/80',
    warning: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/80',
    neutral: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  }[badgeTone]

  const progressToneColor = {
    success: 'bg-emerald-500',
    danger: 'bg-red-500',
    warning: 'bg-amber-500',
    neutral: 'bg-slate-900 dark:bg-slate-100',
  }[progress?.tone || 'neutral']

  return (
    <div
      onClick={onClick}
      className={`clinical-card p-5 transition-all duration-150 ${
        onClick
          ? 'cursor-pointer hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-sm'
          : ''
      } ${className}`}
    >
      {/* Ligne 1 : Micro-titre sobre + Icône discrète (non encadrée) ou Badge */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold tracking-wider text-slate-500 dark:text-slate-400 uppercase">
          {title}
        </span>
        {badge ? (
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${badgeStyles}`}>
            {badge}
          </span>
        ) : icon ? (
          <div className="text-slate-400 dark:text-slate-500 shrink-0">
            {icon}
          </div>
        ) : null}
      </div>

      {/* Ligne 2 : Métrique haute précision (Tabular Nums) */}
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl lg:text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">
          {value}
        </span>
        {unit && (
          <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
            {unit}
          </span>
        )}
      </div>

      {/* Ligne 3 optionnelle : Jauge de progression ultra-fine */}
      {progress && (
        <div className="mt-3 w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${progressToneColor}`}
            style={{
              width: `${Math.min(
                100,
                Math.max(0, Math.round((progress.value / (progress.max || 100)) * 100))
              )}%`,
            }}
          />
        </div>
      )}

      {/* Ligne 4 : Contexte opérationnel & Tendance sans surcharge */}
      {(description || trend) && (
        <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-2.5 text-xs">
          {description && (
            <span className="text-slate-500 dark:text-slate-400 truncate">
              {description}
            </span>
          )}
          {trend && (
            <div className={`inline-flex items-center gap-1.5 font-medium shrink-0 ${trendTextColor}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${trendDotColor}`} />
              <span>{trend}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
