import React, { useState } from 'react'
import { SIGNAL_FILL, type Signal } from './tones'

export interface CapsuleDatum {
  key: string
  /** Libellé court sous la capsule (groupe, service, jour). */
  label: string
  /** null : aucune donnée (contour pointillé, jamais une capsule vide). */
  value: number | null
  /** Mode « fill » : capacité de la capsule (le reste reste sur la piste). */
  capacity?: number
  signal: Signal
  /** Valeur lisible sous le libellé. */
  valueText: string
  /** Lignes de l'infobulle. */
  details?: string[]
  /** Repère de comparaison, entre 0 et 1 (ex. taux régional). */
  marker?: number
  /** Mode « fill » : hauteur relative de la capsule (volume), entre 0 et 1. */
  heightRatio?: number
}

interface CapsuleChartProps {
  data: CapsuleDatum[]
  /**
   * « fill » : chaque capsule est un contenant (lits d'un service) rempli à
   * hauteur de son occupation, le reste sur la piste pâle.
   * « scale » : la hauteur de chaque capsule est proportionnelle à sa valeur.
   */
  mode: 'fill' | 'scale'
  /** Ligne de seuil (mode fill), entre 0 et 1. */
  threshold?: { at: number; label: string }
  markerLabel?: string
  height?: number
  selectedKey?: string | null
  onSelect?: (key: string) => void
  /** Description du graphique pour les lecteurs d'écran. */
  ariaLabel: string
  className?: string
}

/**
 * Graphique en capsules : la forme signature des tableaux de bord. Lisible
 * sans survol (libellé et valeur sous chaque capsule), infobulle au survol ou
 * au clavier, sélection possible pour filtrer le reste de l'écran.
 */
export const CapsuleChart: React.FC<CapsuleChartProps> = ({
  data,
  mode,
  threshold,
  markerLabel,
  height = 200,
  selectedKey = null,
  onSelect,
  ariaLabel,
  className = '',
}) => {
  const [hovered, setHovered] = useState<string | null>(null)
  const max = Math.max(1, ...data.map((d) => d.value ?? 0))
  const dense = data.length > 12

  return (
    <div className={`relative ${className}`} role="group" aria-label={ariaLabel}>
      <div
        className={`relative flex items-end ${threshold && mode === 'fill' ? 'pr-16' : ''}`}
        style={{ height, gap: dense ? 4 : 'clamp(6px, 2%, 18px)' }}
      >
        {threshold && mode === 'fill' && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-critical/35"
            style={{ bottom: `${threshold.at * 100}%` }}
          >
            <span className="absolute -top-2 right-0 text-[0.6875rem] font-medium leading-none text-critical/80">
              {threshold.label}
            </span>
          </div>
        )}

        {data.map((d, index) => {
          const selected = selectedKey === d.key
          const dimmed = selectedKey !== null && !selected
          const isHover = hovered === d.key
          const ratio =
            d.value === null
              ? 0
              : mode === 'fill'
                ? d.capacity && d.capacity > 0
                  ? Math.min(1, d.value / d.capacity)
                  : 0
                : d.value / max
          const containerRatio = mode === 'fill' ? (d.heightRatio ?? 1) : 1
          const Wrapper = onSelect ? 'button' : 'div'

          return (
            <Wrapper
              key={d.key}
              {...(onSelect
                ? {
                    type: 'button' as const,
                    onClick: () => onSelect(d.key),
                    'aria-pressed': selected,
                  }
                : { role: 'img' })}
              aria-label={`${d.label} : ${d.valueText}${d.details?.length ? `. ${d.details.join('. ')}` : ''}`}
              onMouseEnter={() => setHovered(d.key)}
              onMouseLeave={() => setHovered((cur) => (cur === d.key ? null : cur))}
              onFocus={() => setHovered(d.key)}
              onBlur={() => setHovered((cur) => (cur === d.key ? null : cur))}
              className={`group/capsule relative flex h-full min-w-0 flex-1 flex-col items-center justify-end rounded-2xl outline-offset-4 transition-opacity duration-300 ${
                onSelect ? 'cursor-pointer' : ''
              } ${dimmed ? 'opacity-45 hover:opacity-80' : ''}`}
            >
              {/* Contenant : capacité (piste pâle) ou simple barre. */}
              <span
                className={`capsule-fill relative block w-full overflow-hidden rounded-full ${
                  d.value === null ? 'border border-dashed border-line-strong' : mode === 'fill' ? 'bg-track' : ''
                } ${selected ? 'ring-2 ring-fg ring-offset-2 ring-offset-surface' : ''}`}
                style={{
                  height: `${(d.value === null ? 0.35 : mode === 'fill' ? containerRatio : Math.max(ratio, 0.04)) * 100}%`,
                  maxWidth: dense ? 22 : 48,
                }}
              >
                {d.value !== null && (
                  <span
                    className={`capsule-fill capsule-grow absolute inset-x-0 bottom-0 block rounded-full ${SIGNAL_FILL[d.signal]}`}
                    style={{ height: mode === 'fill' ? `${ratio * 100}%` : '100%', '--i': index } as React.CSSProperties}
                  />
                )}
                {d.marker != null && mode === 'fill' && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-1.5 z-10 h-[3px] rounded-full bg-surface shadow-[0_0_0_1px_rgb(16_24_40/0.18)]"
                    style={{ bottom: `${Math.min(1, Math.max(0, d.marker)) * 100}%` }}
                  />
                )}
              </span>

              {/* Infobulle : au survol ou au focus clavier. */}
              <span
                aria-hidden="true"
                className={`chart-tip pointer-events-none absolute bottom-full z-20 mb-2 w-max max-w-56 rounded-xl ${
                  // Aux bords, l'infobulle s'aligne vers l'intérieur pour ne pas sortir du panneau.
                  index === 0 ? 'left-0' : index === data.length - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2'
                } bg-surface px-3 py-2 text-left text-2xs text-fg shadow-[var(--shadow-raised)] ${
                  isHover ? 'opacity-100' : 'translate-y-1 opacity-0'
                }`}
              >
                <span className="block text-xs font-medium text-muted">{d.label}</span>
                <span className="num block text-sm font-semibold">{d.valueText}</span>
                {d.details?.map((line) => (
                  <span key={line} className="block text-muted">
                    {line}
                  </span>
                ))}
              </span>
            </Wrapper>
          )
        })}
      </div>

      {/* Libellés et valeurs, toujours visibles. */}
      <div
        className={`mt-3 flex ${threshold && mode === 'fill' ? 'pr-16' : ''}`}
        style={{ gap: dense ? 4 : 'clamp(6px, 2%, 18px)' }}
        aria-hidden="true"
      >
        {data.map((d) => (
          <div key={d.key} className="min-w-0 flex-1 text-center">
            <div
              className={`truncate ${dense ? 'text-[0.6875rem]' : 'text-xs'} font-medium ${
                selectedKey === d.key ? 'text-fg' : 'text-fg/80'
              }`}
              title={d.label}
            >
              {d.label}
            </div>
            {!dense && <div className="num truncate text-2xs text-subtle">{d.valueText}</div>}
          </div>
        ))}
      </div>

      {markerLabel && data.some((d) => d.marker != null) && (
        <p className="mt-2 text-2xs text-subtle">{markerLabel}</p>
      )}
    </div>
  )
}
