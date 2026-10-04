import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Phone } from 'lucide-react'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatDistance } from '@/lib/format'
import type { BloodRequest, DonorMatch, DonorResponse } from '@/types/api'
import { responseTone } from './bloodStats'
import { QK } from '@/lib/queryKeys'

interface RequestDetailPanelProps {
  request: BloodRequest
  /** Appelé après une annulation réussie. */
  onCancelled: () => void
}

/**
 * Détail d'une demande : donneurs compatibles à proximité, réponses reçues,
 * confirmation des dons et annulation (en deux temps).
 */
export const RequestDetailPanel: React.FC<RequestDetailPanelProps> = ({ request, onCancelled }) => {
  const queryClient = useQueryClient()
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  const { data: matches = [], isLoading: isLoadingMatches } = useQuery<DonorMatch[]>({
    queryKey: [...QK.requestMatches, request.id],
    queryFn: async () => (await api.get<DonorMatch[]>(`/api/sang/requests/${request.id}/matches/`, { limit: 15 })) || [],
    enabled: request.status === 'open',
  })

  const { data: responses = [], isLoading: isLoadingResponses } = useQuery<DonorResponse[]>({
    queryKey: [...QK.requestResponses, request.id],
    queryFn: async () =>
      (await api.get<{ results: DonorResponse[] }>(`/api/sang/requests/${request.id}/responses/`)).results || [],
  })

  const confirmDonation = useMutation({
    mutationFn: (responseId: number) => api.post(`/api/sang/requests/${request.id}/responses/${responseId}/confirm/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.bloodRequests })
      queryClient.invalidateQueries({ queryKey: [...QK.requestResponses, request.id] })
      queryClient.invalidateQueries({ queryKey: [...QK.requestMatches, request.id] })
    },
  })

  const cancel = useMutation({
    mutationFn: () => api.post(`/api/sang/requests/${request.id}/cancel/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.bloodRequests })
      onCancelled()
    },
  })

  const actionError = confirmDonation.error ?? cancel.error

  return (
    <section className="rounded-md border border-line bg-surface" aria-label={`Demande ${request.id}`}>
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h3 className="flex items-baseline gap-2 text-sm font-semibold text-fg">
            <span className="num">#{request.id}</span>
            <span className="num text-critical">{request.blood_group}</span>
          </h3>
          <p className="mt-0.5 truncate text-xs text-muted">
            {request.facility?.name} · {request.facility?.city}
          </p>
        </div>
        {request.status === 'open' &&
          (confirmingCancel ? (
            <div className="flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => setConfirmingCancel(false)}>
                Garder
              </Button>
              <Button variant="danger" size="sm" onClick={() => cancel.mutate()} isLoading={cancel.isPending}>
                Confirmer l'annulation
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setConfirmingCancel(true)}>
              Annuler la demande
            </Button>
          ))}
      </div>

      {actionError && (
        <p role="alert" className="border-b border-line px-4 py-2 text-xs text-critical">
          {actionError instanceof Error ? actionError.message : 'Action impossible.'}
        </p>
      )}

      <dl className="grid grid-cols-2 gap-px border-b border-line bg-line">
        <div className="bg-surface px-4 py-2.5">
          <dt className="eyebrow">Poches collectées</dt>
          <dd className="num mt-0.5 text-base text-fg">
            {request.units_collected}
            <span className="text-subtle"> / {request.units_needed}</span>
          </dd>
        </div>
        <div className="bg-surface px-4 py-2.5">
          <dt className="eyebrow">Rayon de recherche</dt>
          <dd className="num mt-0.5 text-base text-fg">{request.search_radius_km} km</dd>
        </div>
      </dl>

      {request.notes && <p className="border-b border-line px-4 py-2.5 text-xs text-muted">{request.notes}</p>}

      {request.status === 'open' && (
        <div className="border-b border-line px-4 py-3">
          <h4 className="eyebrow mb-2">
            Donneurs à proximité <span className="num ml-1 text-fg">{matches.length}</span>
          </h4>
          {isLoadingMatches ? (
            <Skeleton className="h-16 w-full" />
          ) : matches.length === 0 ? (
            <p className="text-xs text-muted">Aucun donneur disponible dans ce rayon.</p>
          ) : (
            <ul className="max-h-48 divide-y divide-line overflow-y-auto text-xs">
              {matches.map((m) => (
                <li key={m.donor_id} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="flex items-center gap-2">
                    <span className="num w-7 font-medium text-fg">{m.blood_group}</span>
                    <span className="text-muted">Donneur #{m.donor_id}</span>
                  </span>
                  <span className="num text-muted">{formatDistance(m.distance_km)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="px-4 py-3">
        <h4 className="eyebrow mb-2">
          Réponses <span className="num ml-1 text-fg">{responses.length}</span>
        </h4>
        {isLoadingResponses ? (
          <Skeleton className="h-16 w-full" />
        ) : responses.length === 0 ? (
          <p className="text-xs text-muted">Aucune réponse pour le moment.</p>
        ) : (
          <ul className="max-h-56 divide-y divide-line overflow-y-auto text-xs">
            {responses.map((resp) => {
              const isConfirming = confirmDonation.isPending && confirmDonation.variables === resp.id
              return (
                <li key={resp.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-fg">{resp.donor.full_name || `Donneur #${resp.donor.id}`}</div>
                    {resp.donor.phone_number && (
                      <a
                        href={`tel:${resp.donor.phone_number}`}
                        className="num mt-0.5 inline-flex items-center gap-1 text-muted hover:text-fg"
                      >
                        <Phone className="h-3 w-3" aria-hidden="true" />
                        {resp.donor.phone_number}
                      </a>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={responseTone(resp.status)} size="sm">
                      {resp.status_display}
                    </Badge>
                    {resp.status === 'accepted' && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => confirmDonation.mutate(resp.id)}
                        isLoading={isConfirming}
                        disabled={confirmDonation.isPending && !isConfirming}
                      >
                        Confirmer le don
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
