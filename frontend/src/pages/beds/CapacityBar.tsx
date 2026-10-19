import React from 'react'
import type { BedCapacity } from '@/types/api'

type Counts = Pick<BedCapacity, 'total_beds' | 'occupied_beds' | 'reserved_beds' | 'available_beds'>

const pct = (value: number, total: number) => (total > 0 ? (value / total) * 100 : 0)

/**
 * Une seule lecture de l'état d'un service : lits occupés, réservés pour un
 * patient attendu, et libres. Remplace le pourcentage, la colonne « Libres »
 * et la colonne « Occupés » qui disaient la même chose de trois façons.
 */
export const CapacityBar: React.FC<{ cap: Counts; legend?: boolean; className?: string }> = ({
  cap,
  legend = true,
  className = '',
}) => {
  const full = cap.available_beds === 0
  return (
    <div className={className}>
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-raised"
        role="img"
        aria-label={`${cap.occupied_beds} occupés, ${cap.reserved_beds} réservés, ${cap.available_beds} libres sur ${cap.total_beds}`}
      >
        <span className="h-full bg-fg/70" style={{ width: `${pct(cap.occupied_beds, cap.total_beds)}%` }} />
        <span className="h-full bg-info" style={{ width: `${pct(cap.reserved_beds, cap.total_beds)}%` }} />
        <span className={`h-full ${full ? '' : 'bg-ok'}`} style={{ width: `${pct(cap.available_beds, cap.total_beds)}%` }} />
      </div>
      {legend && (
        <p className="num mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-2xs text-muted" aria-hidden="true">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-fg/70" /> {cap.occupied_beds} occupé{cap.occupied_beds > 1 ? 's' : ''}
          </span>
          {cap.reserved_beds > 0 && (
            <span className="inline-flex items-center gap-1 font-medium text-info">
              <span className="h-2 w-2 rounded-full bg-info" /> {cap.reserved_beds} réservé{cap.reserved_beds > 1 ? 's' : ''}
            </span>
          )}
          <span className={`inline-flex items-center gap-1 ${full ? 'font-semibold text-critical' : ''}`}>
            <span className={`h-2 w-2 rounded-full ${full ? 'bg-critical' : 'bg-ok'}`} />
            {full ? 'complet' : `${cap.available_beds} libre${cap.available_beds > 1 ? 's' : ''}`}
          </span>
        </p>
      )}
    </div>
  )
}
