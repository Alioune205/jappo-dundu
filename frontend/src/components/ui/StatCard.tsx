import React, { useId } from 'react'
import { ArrowUpRight } from 'lucide-react'

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
  /** Variante « hero » : carte principale en couleur pleine (inspirée des dashboards de référence). */
  variant?: 'default' | 'hero'
  /** Série de valeurs réelles pour afficher une mini-courbe de tendance en fond de carte. */
  sparkline?: number[]
  /** Index de cascade pour l'animation d'entrée (0, 1, 2, 3…). */
  stagger?: number
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

const ACCENT: Record<StatAccent, { border: string; circle: string; value: string; stroke: string; heroClass: string }> =
  {
    blue: {
      border: 'border-l-accent-blue',
      circle: 'bg-accent-blue/12 text-accent-blue',
      value: 'text-fg',
      stroke: 'var(--accent-blue)',
      heroClass: 'stat-hero-blue',
    },
    yellow: {
      border: 'border-l-accent-yellow',
      circle: 'bg-accent-yellow/15 text-warning',
      value: 'text-warning',
      stroke: 'var(--warning)',
      heroClass: 'stat-hero-yellow',
    },
    green: {
      border: 'border-l-accent-green',
      circle: 'bg-accent-green/12 text-accent-green',
      value: 'text-accent-green',
      stroke: 'var(--accent-green)',
      heroClass: 'stat-hero-green',
    },
    red: {
      border: 'border-l-accent-red',
      circle: 'bg-accent-red/12 text-accent-red',
      value: 'text-accent-red',
      stroke: 'var(--accent-red)',
      heroClass: 'stat-hero-red',
    },
  }

/** Construit un chemin SVG lissé (courbe + aire) pour une mini-sparkline. */
function buildSparklinePath(points: number[], width = 180, height = 34): { line: string; area: string } | null {
  if (!points || points.length < 2) return null
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const padY = 4
  const usableH = height - padY * 2

  const coords = points.map((val, idx) => {
    const x = (idx / (points.length - 1)) * width
    const y = padY + usableH - ((val - min) / range) * usableH
    return [Number(x.toFixed(1)), Number(y.toFixed(1))] as const
  })

  const line = coords.map(([x, y], idx) => `${idx === 0 ? 'M' : 'L'}${x},${y}`).join(' ')
  const area = `${line} L${width},${height} L0,${height} Z`
  return { line, area }
}

/**
 * Tuile de métrique : liseré gauche ou surface Hero, icône dédiée,
 * libellé, valeur tabulaire en grand, barre ou sparkline et contexte.
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
  stagger,
  progress,
  onClick,
  className = '',
}) => {
  const gradId = useId()
  const Root = onClick ? 'button' : 'div'
  const pct = progress
    ? Math.min(100, Math.max(0, Math.round((progress.value / (progress.max || 100)) * 100)))
    : 0
  const resolvedAccent: StatAccent = accent ?? (badgeTone === 'danger' ? 'red' : 'blue')
  const style = ACCENT[resolvedAccent]
  const isHero = variant === 'hero'
  const valueColor = isHero ? 'text-white' : badgeTone === 'danger' ? 'text-critical' : style.value
  const spark = sparkline && sparkline.length >= 2 ? buildSparklinePath(sparkline) : null

  return (
    <Root
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      style={stagger !== undefined ? ({ '--stagger': stagger } as React.CSSProperties) : undefined}
      className={`panel card-interactive dash-rise relative flex w-full flex-col overflow-hidden p-5 text-left ${
        isHero ? `${style.heroClass} border` : `border-l-4 ${style.border}`
      } ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {isHero && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl"
        />
      )}

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className={`block text-sm font-medium leading-snug ${isHero ? 'text-white/85' : 'text-muted'}`}>
            {title}
          </span>
          <div className="mt-1.5 flex min-w-0 items-baseline gap-1.5">
            <span
              className={`num min-w-0 truncate text-[1.85rem] font-bold leading-tight tracking-tight ${valueColor}`}
              title={String(value)}
            >
              {value}
            </span>
            {unit && <span className={`text-sm ${isHero ? 'text-white/75' : 'text-muted'}`}>{unit}</span>}
          </div>
        </div>
        {icon && (
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-transform duration-200 group-hover:scale-105 ${
              isHero ? 'bg-white/15 text-white ring-1 ring-white/25' : style.circle
            }`}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
      </div>

      {badge && (
        <span
          className={`mt-2.5 inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-2xs font-semibold ${
            isHero ? 'bg-white/20 text-white ring-1 ring-white/30' : PILL[badgeTone]
          }`}
        >
          {badgeTone !== 'danger' && !isHero && (
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DOT[badgeTone]}`} />
          )}
          {badge}
        </span>
      )}

      {progress && (
        <div
          className={`mt-3 h-1.5 w-full overflow-hidden rounded-full ${isHero ? 'bg-white/20' : 'bg-raised'}`}
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={title}
        >
          <div
            className={`bar-origin-left h-full rounded-full transition-all duration-500 ${
              isHero ? 'bg-white' : BAR[progress.tone || 'neutral']
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {spark && (
        <div className="mt-3 h-8 w-full overflow-hidden" aria-hidden="true">
          <svg viewBox="0 0 180 34" preserveAspectRatio="none" className="h-full w-full overflow-visible">
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={isHero ? '#ffffff' : style.stroke} stopOpacity={isHero ? 0.35 : 0.24} />
                <stop offset="100%" stopColor={isHero ? '#ffffff' : style.stroke} stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d={spark.area} fill={`url(#${gradId})`} />
            <path
              d={spark.line}
              fill="none"
              stroke={isHero ? '#ffffff' : style.stroke}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}

      {(description || trend) && (
        <div
          className={`mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t pt-3 text-xs ${
            isHero ? 'border-white/15' : 'border-line'
          }`}
        >
          {description && <span className={isHero ? 'text-white/75' : 'text-muted'}>{description}</span>}
          {trend && (
            <span
              className={`inline-flex shrink-0 items-center gap-1.5 font-medium ${
                isHero ? 'text-white' : TEXT[trendTone]
              }`}
            >
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 rounded-full ${isHero ? 'bg-white' : DOT[trendTone]}`}
              />
              {trend}
            </span>
          )}
        </div>
      )}

      {isHero && (
        <span
          aria-hidden="true"
          className=" absolute bottom-3.5 right-3.5 hidden h-6 w-6 items-center justify-center rounded-full bg-white/15 text-white/80 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 sm:inline-flex"
        >
          <ArrowUpRight className="h-3.5 w-3.5" />
        </span>
      )}
    </Root>
  )
}
