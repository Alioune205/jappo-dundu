import React from 'react'
import type { BedCapacity } from '@/types/api'
import { occupancyLevel, type OccupancyLevel } from './bedStats'

/** Occupé en plein (couleur de sens seulement en tension), libre en hachures. */
const LEVEL_BAR: Record<OccupancyLevel, string> = {
  saturated: 'bg-viz-crit',
  high: 'bg-viz-warn',
  normal: 'bg-viz-base',
}

const LEVEL_TEXT: Record<OccupancyLevel, string> = {
  saturated: 'text-critical',
  high: 'text-warning',
  normal: 'text-fg',
}

/** Jauge d'occupation d'un service : pourcentage et barre. */
export const OccupancyBar: React.FC<{ cap: BedCapacity }> = ({ cap }) => {
  const level = occupancyLevel(cap)
  const pct = Math.min(100, Math.round(cap.occupancy_rate * 100))
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className={`num font-semibold ${LEVEL_TEXT[level]}`}>{pct} %</span>
        {level === 'saturated' && <span className="text-2xs font-semibold text-critical">Saturé</span>}
      </div>
      <div
        className="mt-1 h-2 w-full overflow-hidden rounded-full bg-track"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="Taux d'occupation"
      >
        <div className={`bar-fill h-full rounded-full ${LEVEL_BAR[level]}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
