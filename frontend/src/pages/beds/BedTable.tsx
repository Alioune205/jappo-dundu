import React from 'react'
import { Edit2, Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { BedCapacity } from '@/types/api'
import { OccupancyBar } from './OccupancyBar'
import { occupancyLevel, type CapacityActions } from './bedStats'

/** Vue tableau haute densité : une ligne par service. */
export const BedTable: React.FC<{ capacities: BedCapacity[] } & CapacityActions> = ({
  capacities,
  onAdmit,
  onDischarge,
  onEdit,
  isAdmitting,
  isDischarging,
  admitBusy,
  dischargeBusy,
}) => (
  <div className="overflow-hidden rounded-md border border-line bg-surface">
    <div className="overflow-x-auto">
      <table className="ops-table">
        <thead>
          <tr>
            <th scope="col">Service</th>
            <th scope="col">Ville</th>
            <th scope="col">Occupation</th>
            <th scope="col" className="text-right">Libres</th>
            <th scope="col" className="text-right">Occupés</th>
            <th scope="col" className="text-right">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {capacities.map((cap) => {
            const level = occupancyLevel(cap)
            return (
              <tr key={cap.id} data-severity={level === 'saturated' ? 'critical' : level === 'high' ? 'warning' : undefined}>
                <td className="w-full max-w-0">
                  <div className="truncate font-medium text-fg">{cap.category_display}</div>
                  <div className="truncate text-2xs text-muted">{cap.facility?.name}</div>
                </td>
                <td className="whitespace-nowrap text-muted">{cap.facility?.city}</td>
                <td className="w-32">
                  <OccupancyBar cap={cap} />
                </td>
                <td className={`num text-right text-base ${cap.available_beds > 0 ? 'text-fg' : 'text-critical'}`}>
                  {cap.available_beds}
                </td>
                <td className="num whitespace-nowrap text-right text-muted">
                  <span className="text-fg">{cap.occupied_beds}</span> / {cap.total_beds}
                </td>
                <td>
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={cap.available_beds === 0 || (admitBusy && !isAdmitting(cap.id))}
                      isLoading={isAdmitting(cap.id)}
                      onClick={() => onAdmit(cap.id)}
                      icon={<Plus className="h-3 w-3" />}
                      title="Admission (+1 lit occupé)"
                    >
                      Entrée
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={cap.occupied_beds === 0 || (dischargeBusy && !isDischarging(cap.id))}
                      isLoading={isDischarging(cap.id)}
                      onClick={() => onDischarge(cap.id)}
                      icon={<Minus className="h-3 w-3" />}
                      title="Sortie (−1 lit occupé)"
                    >
                      Sortie
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-7 px-0"
                      onClick={() => onEdit(cap)}
                      aria-label={`Ajuster la capacité — ${cap.category_display}, ${cap.facility?.name ?? ''}`}
                      title="Ajuster la capacité"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  </div>
)
