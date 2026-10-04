import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import { BLOOD_REQUEST_EVENTS, RealtimeEvent } from '@/lib/realtimeEvents'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import type { BloodRequest } from '@/types/api'
import { computeBloodStats, DEFAULT_BLOOD_FILTERS, type BloodFilterValues } from './blood/bloodStats'
import { BloodStatsGrid } from './blood/BloodStatsGrid'
import { BloodFilters } from './blood/BloodFilters'
import { RequestTable } from './blood/RequestTable'
import { RequestDetailPanel } from './blood/RequestDetailPanel'
import { DonationLookupPanel } from './blood/DonationLookupPanel'
import { CreateRequestModal } from './blood/CreateRequestModal'
import { QK } from '@/lib/queryKeys'

/** Page « Banque de sang » : liste des demandes, sélection, filtres. */
export const BloodManagement: React.FC = () => {
  // Mises à jour poussées par le serveur (regroupées, voir useRealtimeRefresh).
  useRealtimeRefresh([
    { events: BLOOD_REQUEST_EVENTS, queryKeys: [QK.bloodRequests] },
    {
      events: [RealtimeEvent.bloodResponseUpdated],
      queryKeys: [QK.bloodRequests, QK.requestResponses, QK.requestMatches],
    },
  ])

  const [filters, setFilters] = useState<BloodFilterValues>(DEFAULT_BLOOD_FILTERS)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  // On garde l'identifiant et on relit la ligne dans la liste : le détail
  // suit les rafraîchissements (poches collectées, statut…).
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const {
    data: requests = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<BloodRequest[]>({
    queryKey: [...QK.bloodRequests, filters.status, filters.bloodGroup, filters.urgency, filters.region],
    queryFn: async () => {
      const res = await api.get<{ results: BloodRequest[] }>('/api/sang/requests/', {
        status: filters.status || undefined,
        blood_group: filters.bloodGroup || undefined,
        urgency: filters.urgency || undefined,
        region: filters.region || undefined,
      })
      return res.results || []
    },
  })

  const selected = requests.find((r) => r.id === selectedId) ?? null
  const stats = useMemo(() => computeBloodStats(requests), [requests])

  return (
    <div className="space-y-5">
      <PageHeader
        title="Banque de sang"
        description="Demandes de poches, donneurs compatibles à proximité et enregistrement des dons."
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              isLoading={isRefetching}
              icon={<RefreshCw className="h-3.5 w-3.5" />}
            >
              Actualiser
            </Button>
            <Button variant="primary" size="sm" onClick={() => setIsCreateOpen(true)} icon={<Plus className="h-3.5 w-3.5" />}>
              Nouvelle demande
            </Button>
          </>
        }
      />

      <BloodStatsGrid stats={stats} />
      <BloodFilters value={filters} onChange={setFilters} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <RequestTable requests={requests} isLoading={isLoading} selectedId={selectedId} onSelect={setSelectedId} />

        <div className="space-y-5">
          {selected ? (
            // Clé = demande : l'état local (confirmation d'annulation) repart de zéro.
            <RequestDetailPanel key={selected.id} request={selected} onCancelled={() => setSelectedId(null)} />
          ) : (
            <div className="rounded-md border border-dashed border-line px-4 py-8 text-center text-xs text-muted">
              Sélectionnez une demande pour voir les donneurs proches et les réponses.
            </div>
          )}
          <DonationLookupPanel />
        </div>
      </div>

      <CreateRequestModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </div>
  )
}
