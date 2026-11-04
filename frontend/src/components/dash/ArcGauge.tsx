import React, { useEffect, useState } from 'react'
import { formatNumber } from '@/lib/format'
import { useReducedMotion } from './useReducedMotion'

export interface ArcSegment {
  label: string
  value: number
  /** Couleur CSS (variable du thème) ; ignorée pour le reste. */
  color?: string
  /** Ce qui reste (lits libres, reliquat) : laissé sur la piste pâle. */
  rest?: boolean
  unit?: string
}

interface ArcGaugeProps {
  segments: ArcSegment[]
  centerValue: React.ReactNode
  centerLabel: string
  /** Largeur du dessin, en pixels (la hauteur en découle). */
  size?: number
  /** Légende sous la jauge (valeur et part de chaque segment). */
  legend?: boolean
  className?: string
}

const STROKE = 16
const GAP = 5

/**
 * Jauge en demi-cercle : segments pleins pour ce qui est consommé, piste pâle
 * pour ce qui reste. Les segments se tracent depuis la gauche à l'arrivée.
 */
export const ArcGauge: React.FC<ArcGaugeProps> = ({
  segments,
  centerValue,
  centerLabel,
  size = 260,
  legend = true,
  className = '',
}) => {
  const reduced = useReducedMotion()
  const [drawn, setDrawn] = useState(false)

  useEffect(() => {
    if (reduced) return
    const frame = requestAnimationFrame(() => setDrawn(true))
    return () => cancelAnimationFrame(frame)
  }, [reduced])
  const visible = reduced || drawn

  const r = (size - STROKE) / 2
  const cx = size / 2
  const cy = r + STROKE / 2
  const height = cy + STROKE / 2 + 2
  const arc = Math.PI * r
  const path = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`
  const total = segments.reduce((acc, s) => acc + Math.max(0, s.value), 0)

  let start = 0
  const drawnSegments = segments.map((seg) => {
    const len = total > 0 ? (Math.max(0, seg.value) / total) * arc : 0
    const from = start
    start += len
    // Extrémités arrondies : on retire leur débord pour garder un vrai écart.
    const inner = Math.max(0.01, len - STROKE - GAP)
    return { seg, len, inner, offset: -(from + (STROKE + GAP) / 2) }
  })

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div className="relative w-full" style={{ maxWidth: size }}>
        <svg viewBox={`0 0 ${size} ${height}`} className="block w-full overflow-visible" aria-hidden="true">
          <path d={path} fill="none" stroke="var(--track)" strokeWidth={STROKE} strokeLinecap="round" />
          {total > 0 &&
            drawnSegments.map(({ seg, len, inner, offset }) =>
              len <= 0 || seg.rest ? null : (
                <path
                  key={seg.label}
                  d={path}
                  fill="none"
                  className="arc-seg"
                  stroke={seg.color}
                  strokeWidth={STROKE}
                  strokeLinecap="round"
                  strokeDasharray={`${visible ? inner : 0.01} ${arc * 2}`}
                  strokeDashoffset={visible ? offset : -(STROKE + GAP) / 2}
                />
              )
            )}
        </svg>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center">
          <span className="num text-[2.25rem] font-semibold leading-none tracking-[-0.035em] text-fg">{centerValue}</span>
          <span className="mt-1.5 text-2xs text-subtle">{centerLabel}</span>
        </div>
      </div>

      {legend && (
        <ul className="mt-6 grid w-full gap-2.5 text-xs">
          {segments.map((seg) => {
            const pct = total > 0 ? Math.round((Math.max(0, seg.value) / total) * 100) : 0
            return (
              <li key={seg.label} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 text-muted">
                  <span
                    aria-hidden="true"
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${seg.rest ? 'bg-track ring-1 ring-inset ring-line-strong' : ''}`}
                    style={seg.rest ? undefined : { backgroundColor: seg.color }}
                  />
                  <span className="truncate">{seg.label}</span>
                </span>
                <span className="num shrink-0 text-fg">
                  <span className="font-semibold">{formatNumber(seg.value)}</span>
                  {seg.unit ? ` ${seg.unit}` : ''}
                  <span className="ml-2 inline-block w-10 text-right text-subtle">{pct} %</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
