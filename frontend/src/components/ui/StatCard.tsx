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
    success: 'text-emerald-400',
    danger: 'text-rose-400',
    warning: 'text-amber-400',
    neutral: 'text-slate-400',
  }[trendTone]

  const badgeStyles = {
    success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    danger: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    neutral: 'bg-slate-800 text-slate-300 border-slate-700',
  }[badgeTone]

  return (
    <div
      onClick={onClick}
      className={`rounded-xl border border-slate-800/90 bg-slate-900/80 p-5 shadow-sm transition-all duration-200 hover:border-slate-700 hover:bg-slate-900 ${
        onClick ? 'cursor-pointer hover:-translate-y-0.5' : ''
      } ${className}`}
    >
      {/* En-tête : Titre & Icône */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {title}
        </span>
        {icon && (
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-800/70 text-slate-300 shadow-inner">
            {icon}
          </div>
        )}
      </div>

      {/* Valeur & Unité */}
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-3xl font-bold tracking-tight text-white font-mono">
          {value}
        </span>
        {unit && <span className="text-xs font-medium text-slate-400">{unit}</span>}
      </div>

      {/* Détails & Statut sans troncature */}
      {(description || trend || badge) && (
        <div className="mt-4 flex flex-col gap-1.5 border-t border-slate-800/80 pt-3">
          <div className="flex items-center justify-between gap-2">
            {description && (
              <span className="text-xs text-slate-400 leading-tight">
                {description}
              </span>
            )}
            {badge && (
              <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium border ${badgeStyles}`}>
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
