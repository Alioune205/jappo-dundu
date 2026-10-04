import React from 'react'
import type { Tone } from '@/lib/constants'

interface StatCardProps {
  title: string
  value: string | number
  unit?: string
  trend?: string
  trendTone?: 'success' | 'danger' | 'warning' | 'neutral'
  icon?: React.ReactNode
  tone?: Tone
  description?: string
  onClick?: () => void
}

const TONE_BORDER_CLASSES: Record<Tone, string> = {
  neutral: 'border-white/10 hover:border-white/20',
  brand: 'border-brand-500/30 hover:border-brand-500/50 bg-brand-500/[0.03]',
  danger: 'border-rose-500/30 hover:border-rose-500/50 bg-rose-500/[0.03]',
  warning: 'border-amber-500/30 hover:border-amber-500/50 bg-amber-500/[0.03]',
  success: 'border-emerald-500/30 hover:border-emerald-500/50 bg-emerald-500/[0.03]',
  info: 'border-sky-500/30 hover:border-sky-500/50 bg-sky-500/[0.03]',
  violet: 'border-violet-500/30 hover:border-violet-500/50 bg-violet-500/[0.03]',
}

const TONE_ICON_CLASSES: Record<Tone, string> = {
  neutral: 'bg-ink-800 text-ink-300',
  brand: 'bg-brand-500/20 text-brand-300',
  danger: 'bg-rose-500/20 text-rose-300',
  warning: 'bg-amber-500/20 text-amber-300',
  success: 'bg-emerald-500/20 text-emerald-300',
  info: 'bg-sky-500/20 text-sky-300',
  violet: 'bg-violet-500/20 text-violet-300',
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  unit,
  trend,
  trendTone = 'neutral',
  icon,
  tone = 'neutral',
  description,
  onClick,
}) => {
  const trendColor = {
    success: 'text-emerald-400',
    danger: 'text-rose-400',
    warning: 'text-amber-400',
    neutral: 'text-ink-400',
  }[trendTone]

  return (
    <div
      onClick={onClick}
      className={`surface p-5 border transition-all duration-200 ${
        onClick ? 'cursor-pointer hover:-translate-y-1' : ''
      } ${TONE_BORDER_CLASSES[tone]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-medium text-ink-400 tracking-wide uppercase">
          {title}
        </span>
        {icon && (
          <div className={`p-2.5 rounded-xl shrink-0 ${TONE_ICON_CLASSES[tone]}`}>
            {icon}
          </div>
        )}
      </div>

      <div className="mt-2.5 flex items-baseline gap-2">
        <span className="text-2xl font-bold font-display text-ink-100 tracking-tight">
          {value}
        </span>
        {unit && <span className="text-xs font-medium text-ink-400">{unit}</span>}
      </div>

      {(trend || description) && (
        <div className="mt-3 flex items-center justify-between text-xs border-t border-white/[0.04] pt-2.5">
          {description && <span className="text-ink-400 truncate">{description}</span>}
          {trend && <span className={`font-semibold shrink-0 ml-auto ${trendColor}`}>{trend}</span>}
        </div>
      )}
    </div>
  )
}
