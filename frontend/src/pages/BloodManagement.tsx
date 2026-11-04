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
import { StockInventoryPanel } from './blood/StockInventoryPanel'
import { SupplyOrdersPanel } from './blood/SupplyOrdersPanel'
import { DrivesPanel } from './blood/DrivesPanel'
import { QK } from '@/lib/queryKeys'
import { FULL_FEATURES } from '@/lib/features'
import { useAuth } from '@/context/AuthContext'
import { canManage } from '@/lib/access'
import { SupervisionBadge } from '@/components/ui/SupervisionBadge'

/**
 * Page « Banque de sang » : liste des demandes, sélection, filtres.
 * L'administrateur général la consulte en lecture seule (aucune action).
 */
export const BloodManagement: React.FC = () => {
  const { roles } = useAuth()
  const operates = canManage(roles, 'blood')

  // Mises à jour poussées par le serveur (regroupées, voir useRealtimeRefresh).
  useRealtimeRefresh([
    { events: BLOOD_REQUEST_EVENTS, queryKeys: [QK.bloodRequests] },
    {
      events: [RealtimeEvent.bloodResponseUpdated],
      queryKeys: [QK.bloodRequests, QK.requestResponses, QK.requestMatches],
    },
    { events: [RealtimeEvent.bloodStockUpdated], queryKeys: [QK.bloodInventory, QK.stockNearby] },
    {
      events: [RealtimeEvent.bloodOrderCreated, RealtimeEvent.bloodOrderUpdated],
      queryKeys: [QK.bloodOrders, QK.bloodRequests],
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
    <div className="space-y-6">
      <PageHeader
        eyebrow="Jappo Sang · demandes, stocks et dons"
        title="Banque de sang"
        description={
          <>
            Demandes, poches en stock à proximité, commandes entre établissements, donneurs et dons.
            <SupervisionBadge className="ml-2 align-middle" />
          </>
        }
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
            {operates && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsCreateOpen(true)}
                icon={<Plus className="h-3.5 w-3.5" />}
              >
                Nouvelle demande
              </Button>
            )}
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
            <div className="flex flex-col items-center justify-center rounded-[1.25rem] border border-dashed border-line-strong px-6 py-10 text-center">
              <span aria-hidden="true" className="mb-3 flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-line-strong">
                <span className="h-2 w-2 rounded-full bg-line-strong" />
              </span>
              <p className="text-sm font-medium text-fg">Aucune demande sélectionnée</p>
              <p className="mt-1 max-w-xs text-xs text-muted">
                Sélectionnez une demande pour voir les donneurs proches et les réponses.
              </p>
            </div>
          )}
          {/* Recherche d'un donneur : réservée à qui enregistre le don (pas l'administrateur général). */}
          {operates && <DonationLookupPanel />}
        </div>
      </div>

      {/* Stock et commandes : l'urgence immédiate se traite avec les poches déjà qualifiées. */}
      {FULL_FEATURES && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <SupplyOrdersPanel />
          <StockInventoryPanel />
          <DrivesPanel />
        </div>
      )}

      {operates && <CreateRequestModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />}
    </div>
  )
}
