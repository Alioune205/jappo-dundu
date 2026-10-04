import React from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Skeleton, EmptyState } from '@/components/ui/Skeleton'
import { MISSION_STATUSES, URGENCIES, toneOf } from '@/lib/constants'
import { formatDateTime } from '@/lib/format'
import type { Mission, MissionStatus } from '@/types/api'
import { NEXT_STEP, isActiveMission, missionSeverity } from './missionUtils'

interface MissionTableProps {
  missions: Mission[]
  isLoading: boolean
  onAssign: (missionId: number) => void
  onAdvance: (missionId: number, status: MissionStatus) => void
  isAssigning: (missionId: number) => boolean
  isAdvancing: (missionId: number) => boolean
}

/** Missions : priorité, lieu, véhicule, statut et action suivante du cycle de vie. */
export const MissionTable: React.FC<MissionTableProps> = ({
  missions,
  isLoading,
  onAssign,
  onAdvance,
  isAssigning,
  isAdvancing,
}) => {
  if (isLoading) {
    return (
      <div className="space-y-2 rounded-md border border-line bg-surface p-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }
  if (missions.length === 0) {
    return <EmptyState title="Aucune mission" description="Aucune mission d'urgence enregistrée." />
  }

  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface">
      <div className="overflow-x-auto">
        <table className="ops-table">
          <thead>
            <tr>
              <th scope="col">Mission</th>
              <th scope="col">Priorité</th>
              <th scope="col">Lieu</th>
              <th scope="col">Véhicule</th>
              <th scope="col">Statut</th>
              <th scope="col">Déclenchée</th>
              <th scope="col" className="text-right">
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {missions.map((mission) => {
              const next = NEXT_STEP[mission.status]
              const isActive = isActiveMission(mission)
              return (
                <tr key={mission.id} data-severity={missionSeverity(mission)}>
                  <td className="num whitespace-nowrap font-medium text-fg">#{mission.id}</td>
                  <td>
                    <Badge tone={toneOf(URGENCIES, mission.priority)} size="sm">
                      {mission.priority_display}
                    </Badge>
                  </td>
                  <td className="w-full max-w-0">
                    <div className="truncate text-fg" title={mission.pickup_address}>
                      {mission.pickup_address}
                    </div>
                    <div className="truncate text-2xs text-muted" title={mission.description || undefined}>
                      {mission.region_display}
                      {mission.description && ` · ${mission.description}`}
                    </div>
                  </td>
                  <td className="whitespace-nowrap">
                    {mission.ambulance ? (
                      <span className="num text-fg">{mission.ambulance.plate_number}</span>
                    ) : (
                      <span className={isActive ? 'text-critical' : 'text-subtle'}>Aucun</span>
                    )}
                    {mission.destination && (
                      <div className="max-w-40 truncate text-2xs text-muted">→ {mission.destination.name}</div>
                    )}
                  </td>
                  <td>
                    <Badge tone={toneOf(MISSION_STATUSES, mission.status)} size="sm">
                      {mission.status_display}
                    </Badge>
                  </td>
                  <td className="num whitespace-nowrap text-xs text-muted">{formatDateTime(mission.created_at)}</td>
                  <td className="text-right">
                    {mission.status === 'pending' ? (
                      <Button variant="primary" size="sm" onClick={() => onAssign(mission.id)} isLoading={isAssigning(mission.id)}>
                        Affecter
                      </Button>
                    ) : next ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onAdvance(mission.id, next.status)}
                        isLoading={isAdvancing(mission.id)}
                      >
                        {next.label}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
