import React from 'react'
import { BookmarkPlus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { BedCapacity } from '@/types/api'
import { CapacityBar } from './CapacityBar'
import { occupancyLevel } from './bedStats'

interface BedTableProps {
  capacities: BedCapacity[]
  /** Le compte peut-il réserver un lit de ce service ? (sinon : consultation seule) */
  canReserve: (capacity: BedCapacity) => boolean
  onReserve: (capacity: BedCapacity) => void
}

/**
 * « Trouver un lit » : services du réseau, en lecture. Une seule action,
 * réserver ; les admissions et sorties se font dans « Mes lits ».
 */
export const BedTable: React.FC<BedTableProps> = ({ capacities, canReserve, onReserve }) => (
  <div className="overflow-hidden panel">
    <div className="overflow-x-auto">
      <table className="ops-table">
        <thead>
          <tr>
            <th scope="col">Service</th>
            <th scope="col">Établissement</th>
            <th scope="col" className="w-64">
              Disponibilité
            </th>
            <th scope="col" className="text-right">
              Libres
            </th>
            <th scope="col" className="text-right">
              <span className="sr-only">Action</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {capacities.map((cap) => {
            const level = occupancyLevel(cap)
            return (
              <tr key={cap.id} data-severity={level === 'saturated' ? 'critical' : level === 'high' ? 'warning' : undefined}>
                <td className="font-medium text-fg">{cap.category_display}</td>
                <td>
                  <span className="block text-fg">{cap.facility?.name}</span>
                  <span className="block text-2xs text-muted">{cap.facility?.city}</span>
                </td>
                <td>
                  <CapacityBar cap={cap} />
                </td>
                <td className={`num text-right text-base font-semibold ${cap.available_beds > 0 ? 'text-fg' : 'text-critical'}`}>
                  {cap.available_beds}
                  <span className="block text-2xs font-normal text-muted">sur {cap.total_beds}</span>
                </td>
                <td className="text-right">
                  {canReserve(cap) ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={cap.available_beds === 0}
                      onClick={() => onReserve(cap)}
                      icon={<BookmarkPlus className="h-3 w-3" />}
                      title="Bloquer un lit pour un patient en route"
                    >
                      Réserver
                    </Button>
                  ) : (
                    <span className="text-2xs text-subtle">Consultation</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  </div>
)
