import React from 'react'
import { Edit2, Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { formatDateTime } from '@/lib/format'
import type { BedCapacity } from '@/types/api'
import { OccupancyBar } from './OccupancyBar'
import { occupancyLevel, type CapacityActions } from './bedStats'

/** Vue cartes : un encart par service, liseré coloré si tension ou saturation. */
export const BedCards: React.FC<{ capacities: BedCapacity[] } & CapacityActions> = ({
  capacities,
  onAdmit,
  onDischarge,
  onEdit,
  isAdmitting,
  isDischarging,
  admitBusy,
  dischargeBusy,
}) => (
  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
    {capacities.map((cap) => {
      const level = occupancyLevel(cap)
      return (
        <article
          key={cap.id}
          className={`relative overflow-hidden rounded-md border border-line bg-surface ${
            level === 'saturated' ? 'border-l-2 border-l-critical' : level === 'high' ? 'border-l-2 border-l-warning' : ''
          }`}
        >
          <div className="flex items-start justify-between gap-2 px-4 pt-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-medium text-fg">{cap.category_display}</h3>
              <p className="truncate text-xs text-muted">
                {cap.facility?.name} · {cap.facility?.city}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="-mr-1.5 w-7 px-0"
              onClick={() => onEdit(cap)}
              aria-label={`Ajuster la capacité — ${cap.category_display}, ${cap.facility?.name ?? ''}`}
              title="Ajuster la capacité"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="flex items-end justify-between gap-4 px-4 py-3">
            <div>
              <div className="eyebrow">Libres</div>
              <div className={`num text-2xl leading-tight ${cap.available_beds > 0 ? 'text-fg' : 'text-critical'}`}>
                {cap.available_beds}
              </div>
            </div>
            <div className="w-32">
              <OccupancyBar cap={cap} />
              <div className="num mt-1 text-right text-2xs text-muted">
                {cap.occupied_beds} / {cap.total_beds} occupés
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 border-t border-line px-4 py-2">
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              disabled={cap.available_beds === 0 || (admitBusy && !isAdmitting(cap.id))}
              isLoading={isAdmitting(cap.id)}
              onClick={() => onAdmit(cap.id)}
              icon={<Plus className="h-3 w-3" />}
            >
              Entrée
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              disabled={cap.occupied_beds === 0 || (dischargeBusy && !isDischarging(cap.id))}
              isLoading={isDischarging(cap.id)}
              onClick={() => onDischarge(cap.id)}
              icon={<Minus className="h-3 w-3" />}
            >
              Sortie
            </Button>
            <span className="num shrink-0 text-2xs text-subtle" title="Dernière mise à jour">
              {formatDateTime(cap.updated_at)}
            </span>
          </div>
        </article>
      )
    })}
  </div>
)
