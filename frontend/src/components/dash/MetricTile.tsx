import React from 'react'
import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router'
import { formatNumber } from '@/lib/format'
import { CountUp } from './CountUp'
import { SIGNAL_DOT, SIGNAL_FILL, SIGNAL_SOFT, type Signal } from './tones'

export interface MetricTileProps {
  label: string
  /** Pictogramme du domaine, neutre (la couleur reste réservée au sens). */
  icon?: React.ElementType
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
  /** Pastille à côté du chiffre (« 1 vitale »). */
  badge?: { label: string; signal: Signal }
  /** Jauge : la part remplie est pleine, le reste sur la piste pâle. */
  meter?: { value: number; max: number; signal?: Signal; label: string }
  /** Étiquette d'état, teintée selon le sens. */
  status?: { text: string; signal: Signal }
  /** Contexte discret (source, périmètre). */
  hint?: string
  /** Rang dans la cascade d'apparition. */
  i?: number
  className?: string
}

/**
 * Tuile d'indicateur. Une hiérarchie fixe : pictogramme et libellé, chiffre,
 * jauge, état. Seule une tuile qui mène quelque part porte une flèche et
 * réagit au survol.
 */
export const MetricTile: React.FC<MetricTileProps> = ({
  label,
  icon: Icon,
  value,
  loading = false,
  format = formatNumber,
  unit,
  variant = 'plain',
  to,
  badge,
  meter,
  status,
  hint,
  i = 0,
  className = '',
}) => {
  const featured = variant === 'featured'
  const pct = meter && meter.max > 0 ? Math.min(100, Math.max(0, (meter.value / meter.max) * 100)) : 0

  const body = (
    <>
      <div className="flex items-center gap-3">
        {Icon && (
          <span
            aria-hidden="true"
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
              featured ? 'bg-surface text-fg shadow-[0_1px_2px_rgb(16_24_40/0.06)]' : 'bg-sunken text-muted'
            }`}
          >
            <Icon className="h-[1.125rem] w-[1.125rem]" strokeWidth={1.8} />
          </span>
        )}
        <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-muted">{label}</span>
        {to && (
          <ArrowUpRight
            aria-hidden="true"
            className="lift-arrow -mr-0.5 h-4 w-4 shrink-0 text-subtle transition-colors group-hover:text-fg"
          />
        )}
      </div>

      <div className="mt-5 flex min-h-10 flex-wrap items-baseline gap-x-1.5 gap-y-1">
        {loading ? (
          <span className="skeleton block h-9 w-20" aria-label="Chargement" />
        ) : value === null ? (
          <span className="text-[2.25rem] font-semibold leading-none text-subtle">—</span>
        ) : (
          <CountUp
            value={value}
            format={format}
            className="text-[2.25rem] font-semibold leading-none tracking-[-0.035em] text-fg"
          />
        )}
        {unit && !loading && <span className="text-sm text-subtle">{unit}</span>}
        {badge && !loading && (
          <span
            className={`ml-auto inline-flex h-6 items-center gap-1.5 self-center rounded-full px-2.5 text-2xs font-medium ${SIGNAL_SOFT[badge.signal]}`}
          >
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${SIGNAL_DOT[badge.signal]}`} />
            {badge.label}
          </span>
        )}
      </div>

      {meter && (
        <div
          className={`mt-4 h-1.5 w-full overflow-hidden rounded-full ${featured ? 'bg-surface/80' : 'bg-track'}`}
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
            <span
              className={`inline-flex h-6 max-w-full items-center gap-1.5 rounded-full px-2.5 font-medium ${
                featured && status.signal === 'neutral' ? 'bg-surface/80 text-muted' : SIGNAL_SOFT[status.signal]
              }`}
            >
              <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${SIGNAL_DOT[status.signal]}`} />
              <span className="truncate">{status.text}</span>
            </span>
          )}
          {hint && <span className="text-subtle">{hint}</span>}
        </div>
      )}
    </>
  )

  const shell = `reveal flex h-full min-h-[11rem] flex-col p-5 ${featured ? 'panel-featured' : 'panel'} ${className}`
  const style = { '--i': i } as React.CSSProperties

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
