import React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BedDouble, Clock, Siren } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { useNow } from '@/lib/useNow'
import { Button } from '@/components/ui/Button'
import { QK } from '@/lib/queryKeys'
import type { BedReservation } from '@/types/api'
import { canCancel, canFulfill, remainingLabel } from './reservationAccess'

/** Réservations en cours du périmètre : patient attendu, délai restant, admission ou annulation. */
export const ReservationsPanel: React.FC = () => {
  const queryClient = useQueryClient()
  const { user, roles, isAdmin } = useAuth()
  const viewer = { user, roles, isAdmin }
  const now = useNow(30_000)

  const { data: reservations = [], isLoading } = useQuery<BedReservation[]>({
    queryKey: [...QK.bedReservations, 'active'],
    queryFn: async () =>
      (await api.get<{ results: BedReservation[] }>('/api/lits/reservations/', { status: 'active' })).results || [],
    // Les expirations ne poussent pas d'événement si personne n'agit : relecture régulière.
    refetchInterval: 60_000,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: QK.bedReservations })
    queryClient.invalidateQueries({ queryKey: QK.bedCapacities })
    queryClient.invalidateQueries({ queryKey: QK.bedsSummary })
  }
  const fulfill = useMutation({
    mutationFn: (id: number) => api.post<BedReservation>(`/api/lits/reservations/${id}/fulfill/`),
    onSuccess: refresh,
  })
  const cancel = useMutation({
    mutationFn: (id: number) => api.post<BedReservation>(`/api/lits/reservations/${id}/cancel/`),
    onSuccess: refresh,
  })
  const busyId = (fulfill.isPending && fulfill.variables) || (cancel.isPending && cancel.variables) || null
  const error = fulfill.error ?? cancel.error

  return (
    <section className="panel" aria-labelledby="reservations-title">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 id="reservations-title" className="text-sm font-semibold text-fg">
          Réservations en cours
        </h2>
        <span className="num rounded-md bg-raised px-2 py-0.5 text-xs font-semibold text-fg">{reservations.length}</span>
      </div>

      {error && (
        <p role="alert" className="px-4 pt-3 text-xs text-critical">
          {error instanceof Error ? error.message : 'Action impossible.'}
        </p>
      )}

      {isLoading ? (
        <p className="px-4 py-4 text-xs text-muted">Chargement…</p>
      ) : reservations.length === 0 ? (
        <p className="px-4 py-4 text-xs text-muted">
          Aucune réservation. « Réserver » bloque un lit pour un patient en route ; il se libère tout seul s’il n’arrive pas.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {reservations.map((r) => {
            const remaining = remainingLabel(r.expires_at, now)
            const urgent = remaining === 'expirée' || /^\d+ min$/.test(remaining) && parseInt(remaining, 10) <= 10
            return (
              <li key={r.id} className="space-y-2 px-4 py-3">
                <div className="flex items-start gap-3">
                  <BedDouble className="mt-0.5 h-4 w-4 shrink-0 text-accent-blue" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">
                      {r.capacity.category_display} · {r.facility.name}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {r.mission ? (
                        <span className="inline-flex items-center gap-1">
                          <Siren className="h-3 w-3 text-critical" aria-hidden="true" />
                          Mission #{r.mission.id} · {r.mission.status_display}
                        </span>
                      ) : (
                        r.reference || 'Patient attendu'
                      )}
                      {r.mission && r.reference ? ` · ${r.reference}` : ''}
                    </p>
                  </div>
                  <span
                    className={`num inline-flex shrink-0 items-center gap-1 text-xs font-semibold ${
                      urgent ? 'text-critical' : 'text-muted'
                    }`}
                    title={`Expire le ${new Date(r.expires_at).toLocaleString('fr-FR')}`}
                  >
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    {remaining}
                  </span>
                </div>
                <div className="flex justify-end gap-1.5">
                  {canCancel(viewer, r) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busyId !== null}
                      isLoading={cancel.isPending && cancel.variables === r.id}
                      onClick={() => cancel.mutate(r.id)}
                    >
                      Libérer
                    </Button>
                  )}
                  {canFulfill(viewer, r) && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busyId !== null}
                      isLoading={fulfill.isPending && fulfill.variables === r.id}
                      onClick={() => fulfill.mutate(r.id)}
                      title="Le patient est arrivé : le lit réservé devient occupé"
                    >
                      Patient arrivé
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
