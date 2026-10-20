import React from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Skeleton, EmptyState } from '@/components/ui/Skeleton'
import { AMBULANCE_STATUSES, toneOf } from '@/lib/constants'
import { formatRelative } from '@/lib/format'
import { useNow } from '@/lib/useNow'
import type { Ambulance } from '@/types/api'

/** Position plus ancienne : l'application de l'ambulancier n'est probablement pas ouverte. */
const STALE_POSITION_MS = 10 * 60_000

interface FleetTableProps {
  ambulances: Ambulance[]
  isLoading: boolean
  /** Administration de la flotte (admin, administrateur des ambulances) : actions affichées. */
  canEdit?: boolean
  onEdit?: (ambulance: Ambulance) => void
  onToggleService?: (ambulance: Ambulance) => void
  isToggling?: (id: number) => boolean
}

/** Flotte : immatriculation, type, base, chauffeur, dernière position, statut. */
export const FleetTable: React.FC<FleetTableProps> = ({
  ambulances,
  isLoading,
  canEdit = false,
  onEdit,
  onToggleService,
  isToggling = () => false,
}) => {
  const now = useNow(30_000)

  if (isLoading) {
    return (
      <div className="space-y-2 panel p-4">
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
    <div className="overflow-hidden panel">
      <div className="overflow-x-auto">
        <table className="ops-table">
          <thead>
            <tr>
              <th scope="col">Immatriculation</th>
              <th scope="col">Type</th>
              <th scope="col">Base</th>
              <th scope="col">Chauffeur</th>
              <th scope="col">Position</th>
              <th scope="col">Statut</th>
              {canEdit && (
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {ambulances.map((amb) => {
              const seen = amb.location_updated_at ? new Date(amb.location_updated_at).getTime() : null
              const stale = seen === null || now - seen > STALE_POSITION_MS
              return (
                <tr key={amb.id}>
                  <td className="num whitespace-nowrap font-medium text-fg">{amb.plate_number}</td>
                  <td className="whitespace-nowrap text-muted">{amb.ambulance_type_display}</td>
                  <td className="w-full max-w-0">
                    <div className="truncate text-fg">{amb.facility?.name || '—'}</div>
                  </td>
                  <td className="whitespace-nowrap text-muted">
                    {amb.driver?.full_name || <span className="text-subtle">Sans chauffeur</span>}
                  </td>
                  <td
                    className={`whitespace-nowrap ${stale ? 'text-subtle' : 'text-muted'}`}
                    title={stale ? "Position ancienne : l'application de l'ambulancier est fermée ou sans réseau." : undefined}
                  >
                    {seen === null ? 'Jamais reçue' : formatRelative(amb.location_updated_at, now)}
                  </td>
                  <td>
                    <Badge tone={toneOf(AMBULANCE_STATUSES, amb.status)} size="sm">
                      {amb.status_display}
                    </Badge>
                  </td>
                  {canEdit && (
                    <td className="whitespace-nowrap text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => onEdit?.(amb)} aria-label={`Modifier ${amb.plate_number}`}>
                          Modifier
                        </Button>
                        {amb.status !== 'on_mission' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onToggleService?.(amb)}
                            isLoading={isToggling(amb.id)}
                          >
                            {amb.status === 'available' ? 'Mettre hors service' : 'Remettre en service'}
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
