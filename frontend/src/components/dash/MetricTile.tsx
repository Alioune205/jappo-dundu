import React, { useId } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router'
import { formatNumber } from '@/lib/format'
import { CountUp } from './CountUp'
import { ACCENT_VAR, SIGNAL_DOT, SIGNAL_FILL, SIGNAL_SOFT, SIGNAL_TEXT, type Accent, type Signal } from './tones'

export interface MetricTileProps {
  label: string
  /** Pictogramme du domaine. */
  icon?: React.ElementType
  /** Teinte de la carte et du pictogramme selon le sujet (jamais selon l'état). */
  accent?: Accent
  /** null : la donnée n'existe pas (affiche « — », jamais 0). */
  value: number | null
  /** Pendant le chargement, un squelette remplace le chiffre. */
  loading?: boolean
  format?: (value: number) => string
  /** Complément du chiffre (« / 20 », « ouvertes »). */
  unit?: string
  /** « featured » : la carte mise en avant de l'écran, une seule par rangée. */
  variant?: 'featured' | 'plain'
  /** Lien vers le module : la carte devient cliquable (flèche, survol). */
  to?: string
  /** Pastille à côté du libellé (« 1 vitale »). */
  badge?: { label: string; signal: Signal }
  /** Jauge : la part remplie est pleine, le reste sur la piste pâle. */
  meter?: { value: number; max: number; signal?: Signal; label: string }
  /**
   * Mini-courbe : série réelle (au moins deux points). Absente si la série
   * n'existe pas ou ne contient aucun enregistrement.
   */
  spark?: { values: number[]; label: string }
  /** Étiquette d'état, teintée selon le sens. */
  status?: { text: string; signal: Signal }
  /** Contexte discret (source, périmètre). */
  hint?: string
  /**
   * « row » : carte compacte en ligne (pictogramme, chiffre, visuel à droite :
   * mini-courbe si une série existe, sinon anneau de la jauge). Le contexte
   * (hint) n'y est pas affiché.
   */
  layout?: 'stack' | 'row'
  /** Rang dans la cascade d'apparition. */
  i?: number
  className?: string
}

/** Couleur d'un remplissage selon le sens (anneau de la carte compacte). */
const RING_COLOR: Record<Signal, string> = {
  critical: 'var(--viz-crit)',
  warning: 'var(--viz-warn)',
  ok: 'var(--tile)',
  info: 'var(--info)',
  neutral: 'var(--tile)',
}

/** Tracé d'une mini-courbe dans un cadre 120 × 40. */
function sparkPaths(values: number[]): { line: string; area: string } {
  const w = 120
  const h = 40
  const max = Math.max(...values, 1)
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 4 - (v / max) * (h - 10)] as const)
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  return { line, area: `${line} L${w},${h} L0,${h} Z` }
}

/**
 * Tuile d'indicateur : carte légèrement teintée du sujet, grand pictogramme
 * rond, libellé, chiffre, puis jauge et état. Seule une tuile qui mène
 * quelque part porte une flèche et réagit au survol.
 */
export const MetricTile: React.FC<MetricTileProps> = ({
  label,
  icon: Icon,
  accent = 'neutral',
  value,
  loading = false,
  format = formatNumber,
  unit,
  to,
  badge,
  meter,
  spark,
  status,
  hint,
  layout = 'stack',
  i = 0,
  className = '',
}) => {
  const gradientId = useId().replace(/:/g, '')
  const pct = meter && meter.max > 0 ? Math.min(100, Math.max(0, (meter.value / meter.max) * 100)) : 0
  const showSpark = spark && spark.values.length >= 2 && spark.values.some((v) => v > 0)
  const paths = showSpark ? sparkPaths(spark.values) : null

  const valueNode = loading ? (
    <span className="skeleton block h-8 w-20" aria-label="Chargement" />
  ) : value === null ? (
    <span className="text-[1.875rem] font-extrabold leading-none text-subtle">—</span>
  ) : (
    <CountUp value={value} format={format} className="text-[1.875rem] font-extrabold leading-none tracking-[-0.03em] text-fg" />
  )

  if (layout === 'row') {
    const ringPct = meter && meter.max > 0 ? Math.min(1, Math.max(0, meter.value / meter.max)) : null
    const circumference = 2 * Math.PI * 22
    const rowBody = (
      <div className="flex h-full items-center gap-4">
        {Icon && (
          <span aria-hidden="true" className="metric-icon flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white">
            <Icon className="h-6 w-6" strokeWidth={2} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold leading-snug text-fg">
            {label}
            {badge && !loading && (
              <span className={`inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[0.6875rem] font-semibold ${SIGNAL_SOFT[badge.signal]}`}>
                <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${SIGNAL_DOT[badge.signal]}`} />
                {badge.label}
              </span>
            )}
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
            {valueNode}
            {unit && !loading && <span className="text-sm font-semibold text-muted">{unit}</span>}
          </div>
          {status && !loading && (
            <p className={`mt-1.5 flex items-center gap-1.5 text-xs font-semibold ${SIGNAL_TEXT[status.signal]}`}>
              <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${SIGNAL_DOT[status.signal]}`} />
              <span>{status.text}</span>
            </p>
          )}
        </div>
        {paths && spark ? (
          <svg viewBox="0 0 120 40" preserveAspectRatio="none" className="hidden h-14 w-24 shrink-0 min-[420px]:block xl:w-28" role="img" aria-label={spark.label}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--tile)" stopOpacity="0.3" />
                <stop offset="100%" stopColor="var(--tile)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={paths.area} fill={`url(#${gradientId})`} />
            <path d={paths.line} fill="none" stroke="var(--tile)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
        ) : meter && ringPct !== null && !loading ? (
          <svg viewBox="0 0 56 56" className="hidden h-14 w-14 shrink-0 -rotate-90 min-[420px]:block" role="meter" aria-label={meter.label} aria-valuemin={0} aria-valuemax={meter.max} aria-valuenow={meter.value}>
            <circle cx="28" cy="28" r="22" fill="none" stroke="var(--track)" strokeWidth="6" />
            <circle
              cx="28"
              cy="28"
              r="22"
              fill="none"
              stroke={RING_COLOR[meter.signal ?? 'ok']}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${(ringPct * circumference).toFixed(1)} ${circumference.toFixed(1)}`}
            />
          </svg>
        ) : null}
      </div>
    )
    const rowShell = `metric-tile panel reveal relative block min-h-[7.5rem] p-5 ${className}`
    const rowStyle = { '--i': i, '--tile': ACCENT_VAR[accent] } as React.CSSProperties
    return to ? (
      <Link to={to} className={`${rowShell} lift group`} style={rowStyle} title={hint}>
        {rowBody}
        <ArrowUpRight aria-hidden="true" className="lift-arrow absolute right-3.5 top-3.5 h-4 w-4 text-subtle transition-colors group-hover:text-fg" />
      </Link>
    ) : (
      <div className={rowShell} style={rowStyle} title={hint}>
        {rowBody}
      </div>
    )
  }

  const body = (
    <>
      <div className="flex items-start gap-4">
        {Icon && (
          <span aria-hidden="true" className="metric-icon flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white">
            <Icon className="h-6 w-6" strokeWidth={2} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className="pt-0.5 text-sm font-semibold leading-snug text-fg">{label}</span>
            <span className="flex shrink-0 items-center gap-1.5">
              {badge && !loading && (
                <span className={`inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-2xs font-semibold ${SIGNAL_SOFT[badge.signal]}`}>
                  <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${SIGNAL_DOT[badge.signal]}`} />
                  {badge.label}
                </span>
              )}
              {to && (
                <ArrowUpRight
                  aria-hidden="true"
                  className="lift-arrow h-4 w-4 shrink-0 text-subtle transition-colors group-hover:text-fg"
                />
              )}
            </span>
          </div>

          <div className="mt-1.5 flex min-h-9 flex-wrap items-baseline gap-x-1.5 gap-y-1">
            {loading ? (
              <span className="skeleton block h-8 w-20" aria-label="Chargement" />
            ) : value === null ? (
              <span className="text-[1.875rem] font-extrabold leading-none text-subtle">—</span>
            ) : (
              <CountUp
                value={value}
                format={format}
                className="text-[1.875rem] font-extrabold leading-none tracking-[-0.03em] text-fg"
              />
            )}
            {unit && !loading && <span className="text-sm font-semibold text-muted">{unit}</span>}
          </div>
        </div>
      </div>

      {paths && spark && (
        <figure className="mt-3">
        <svg viewBox="0 0 120 40" preserveAspectRatio="none" className="h-10 w-full" aria-hidden="true">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--tile)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--tile)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={paths.area} fill={`url(#${gradientId})`} />
          <path d={paths.line} fill="none" stroke="var(--tile)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {/* La légende dit ce que trace la courbe : elle peut différer du chiffre de la tuile. */}
        <figcaption className="mt-0.5 text-2xs text-subtle">{spark.label}</figcaption>
        </figure>
      )}

      {meter && (
        <div
          className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-track"
          role="meter"
          aria-label={meter.label}
          aria-valuemin={0}
          aria-valuemax={meter.max}
          aria-valuenow={meter.value}
        >
          <div
            className={`bar-fill bar-grow h-full rounded-full ${SIGNAL_FILL[meter.signal ?? 'ok']}`}
            style={{ width: `${pct}%`, '--i': i } as React.CSSProperties}
          />
        </div>
      )}

      {(status || hint) && (
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 pt-4 text-xs">
          {status && (
            <span className={`inline-flex h-6 max-w-full items-center gap-1.5 rounded-full px-2.5 font-medium ${SIGNAL_SOFT[status.signal]}`}>
              <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${SIGNAL_DOT[status.signal]}`} />
              <span className="truncate">{status.text}</span>
            </span>
          )}
          {hint && <span className="text-subtle">{hint}</span>}
        </div>
      )}
    </>
  )

  const shell = `metric-tile panel reveal flex h-full min-h-[10.5rem] flex-col p-5 ${className}`
  const style = { '--i': i, '--tile': ACCENT_VAR[accent] } as React.CSSProperties

  return to ? (
    <Link to={to} className={`${shell} lift group`} style={style}>
      {body}
    </Link>
  ) : (
    <div className={shell} style={style}>
      {body}
    </div>
  )
}
