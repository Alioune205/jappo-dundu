import React from 'react'
import { Badge } from '@/components/ui/Badge'
import { Skeleton, EmptyState } from '@/components/ui/Skeleton'
import { AMBULANCE_STATUSES, toneOf } from '@/lib/constants'
import type { Ambulance } from '@/types/api'

/** Flotte : immatriculation, type, base, chauffeur, statut. */
export const FleetTable: React.FC<{ ambulances: Ambulance[]; isLoading: boolean }> = ({ ambulances, isLoading }) => {
  if (isLoading) {
    return (
      <div className="space-y-2 rounded-md border border-line bg-surface p-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    )
  }
  if (ambulances.length === 0) {
    return <EmptyState title="Aucun véhicule" description="Aucune ambulance n'est enregistrée." />
  }

  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface">
      <div className="overflow-x-auto">
        <table className="ops-table">
          <thead>
            <tr>
              <th scope="col">Immatriculation</th>
              <th scope="col">Type</th>
              <th scope="col">Base</th>
              <th scope="col">Chauffeur</th>
              <th scope="col">Statut</th>
            </tr>
          </thead>
          <tbody>
            {ambulances.map((amb) => (
              <tr key={amb.id}>
                <td className="num whitespace-nowrap font-medium text-fg">{amb.plate_number}</td>
                <td className="whitespace-nowrap text-muted">{amb.ambulance_type_display}</td>
                <td className="w-full max-w-0">
                  <div className="truncate text-fg">{amb.facility?.name || '—'}</div>
                </td>
                <td className="whitespace-nowrap text-muted">{amb.driver?.full_name || '—'}</td>
                <td>
                  <Badge tone={toneOf(AMBULANCE_STATUSES, amb.status)} size="sm">
                    {amb.status_display}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
