import React from 'react'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatDateTime } from '@/lib/format'
import type { BloodRequest } from '@/types/api'
import { requestSeverity, statusTone, urgencyTone } from './bloodStats'

interface RequestTableProps {
  requests: BloodRequest[]
  isLoading: boolean
  selectedId: number | null
  onSelect: (id: number) => void
}

/** Liste des demandes ; une ligne se sélectionne à la souris ou au clavier (Entrée, Espace). */
export const RequestTable: React.FC<RequestTableProps> = ({ requests, isLoading, selectedId, onSelect }) => (
  <section className="overflow-hidden rounded-md border border-line bg-surface xl:col-span-2">
    <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
      <h2 className="text-sm font-semibold text-fg">
        Demandes <span className="num ml-1 font-normal text-muted">{requests.length}</span>
      </h2>
    </div>

    {isLoading ? (
      <div className="space-y-2 p-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    ) : requests.length === 0 ? (
      <div className="px-4 py-12 text-center text-xs text-muted">Aucune demande ne correspond à ces critères.</div>
    ) : (
      <div className="overflow-x-auto">
        <table className="ops-table">
          <thead>
            <tr>
              <th scope="col">Groupe</th>
              <th scope="col">Établissement</th>
              <th scope="col">Urgence</th>
              <th scope="col" className="text-right">Collectées</th>
              <th scope="col">Statut</th>
              <th scope="col">Créée</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((req) => {
              const isSelected = selectedId === req.id
              return (
                <tr
                  key={req.id}
                  data-selected={isSelected}
                  data-severity={requestSeverity(req)}
                  aria-selected={isSelected}
                  tabIndex={0}
                  onClick={() => onSelect(req.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelect(req.id)
                    }
                  }}
                  className="cursor-pointer outline-none focus-visible:[&>td]:bg-raised"
                >
                  <td className="num font-medium text-fg">{req.blood_group}</td>
                  <td className="w-full max-w-0">
                    <div className="truncate text-fg">{req.facility?.name || '—'}</div>
                    <div className="truncate text-2xs text-muted">{req.facility?.city}</div>
                  </td>
                  <td>
                    <Badge tone={urgencyTone(req.urgency)} size="sm">
                      {req.urgency_display}
                    </Badge>
                  </td>
                  <td className="num whitespace-nowrap text-right">
                    <span className={req.units_remaining > 0 ? 'text-fg' : 'text-ok'}>{req.units_collected}</span>
                    <span className="text-subtle"> / {req.units_needed}</span>
                  </td>
                  <td>
                    <Badge tone={statusTone(req.status)} size="sm">
                      {req.status_display}
                    </Badge>
                  </td>
                  <td className="num whitespace-nowrap text-xs text-muted">{formatDateTime(req.created_at)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )}
  </section>
)
