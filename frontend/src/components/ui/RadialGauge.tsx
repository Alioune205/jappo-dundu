import React from 'react'

export interface GaugeSegment {
  label: string
  value: number
  color: string
  unit?: string
}

export interface RadialGaugeProps {
  /** Mode « semi » (arc 180° type jauge de tension) ou « donut » (anneau 360°). */
  mode?: 'semi' | 'donut'
  /** Valeur principale affichée au centre (ex: "72 %"). */
  centerValue: string
  /** Sous-titre affiché sous la valeur centrale. */
  centerLabel: string
  /** Segments constituant la jauge. */
  segments: GaugeSegment[]
  /** Taille en pixels du SVG. */
  size?: number
  className?: string
}

/**
 * Jauge semi-circulaire ou anneau segmenté (SVG pur, fluide et accessible).
 * Inspiré des visualisations de progression et de répartition des vidéos de référence.
 */
export const RadialGauge: React.FC<RadialGaugeProps> = ({
  mode = 'semi',
  centerValue,
  centerLabel,
  segments,
  size = 188,
  className = '',
}) => {
  const total = segments.reduce((acc, s) => acc + Math.max(0, s.value), 0)
  const strokeWidth = mode === 'semi' ? 18 : 16
  const radius = (size - strokeWidth * 2) / 2
  const cx = size / 2
  const cy = mode === 'semi' ? size / 2 + 12 : size / 2

  if (mode === 'semi') {
    const arcLength = Math.PI * radius
    let accumulated = 0

    return (
      <div className={`flex flex-col items-center ${className}`}>
        <div className="relative" style={{ width: size, height: Math.round(size * 0.62) }}>
          <svg
            width={size}
            height={Math.round(size * 0.62)}
            viewBox={`0 0 ${size} ${Math.round(size * 0.62)}`}
            aria-hidden="true"
            className="overflow-visible"
          >
            {/* Piste de fond */}
            <path
              d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
              fill="none"
              stroke="var(--raised)"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
            {total > 0 &&
              segments.map((seg) => {
                if (seg.value <= 0) return null
                const fraction = seg.value / total
                const segLen = fraction * arcLength
                const dashArray = `${Math.max(0, segLen - 2)} ${arcLength * 2}`
                const dashOffset = -accumulated
                accumulated += segLen
                return (
                  <path
                    key={seg.label}
                    d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={dashArray}
                    strokeDashoffset={dashOffset}
                    className="transition-all duration-700"
                  />
                )
              })}
          </svg>
          <div className="pointer-events-none absolute inset-x-0 bottom-1 flex flex-col items-center text-center">
            <span className="num text-2xl font-bold tracking-tight text-fg">{centerValue}</span>
            <span className="text-2xs font-medium text-muted">{centerLabel}</span>
          </div>
        </div>

        <ul className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs">
          {segments.map((seg) => (
            <li key={seg.label} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: seg.color }} />
              <span className="text-muted">{seg.label} :</span>
              <span className="num font-semibold text-fg">
                { `${seg.value}${seg.unit ? ` ${seg.unit}` : ''}` }
              </span>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  // Mode Donut (360°)
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className={`flex flex-col items-center gap-4 sm:flex-row ${className}`}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="-rotate-90">
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="var(--raised)" strokeWidth={strokeWidth} />
          {total > 0 &&
            segments.map((seg) => {
              if (seg.value <= 0) return null
              const segLen = (seg.value / total) * circumference
              const dashArray = `${Math.max(0, segLen - 3)} ${circumference}`
              const dashOffset = -offset
              offset += segLen
              return (
                <circle
                  key={seg.label}
                  cx={cx}
                  cy={cy}
                  r={radius}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={dashArray}
                  strokeDashoffset={dashOffset}
                  className="transition-all duration-700"
                />
              )
            })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="num text-xl font-bold tracking-tight text-fg">{centerValue}</span>
          <span className="text-2xs font-medium text-muted">{centerLabel}</span>
        </div>
      </div>

      <ul className="w-full flex-1 space-y-2 text-xs">
        {segments.map((seg) => {
          const pct = total > 0 ? Math.round((seg.value / total) * 100) : 0
          return (
            <li key={seg.label} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 truncate text-muted">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: seg.color }} />
                <span className="truncate font-medium text-fg">{seg.label}</span>
              </span>
              <span className="num shrink-0 font-semibold text-fg">
                {`${seg.value}${seg.unit ? ` ${seg.unit}` : ''} (${pct} %)`}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

