import React, { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import { BED_EVENTS } from '@/lib/realtimeEvents'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton, EmptyState } from '@/components/ui/Skeleton'
import type { BedCapacity } from '@/types/api'
import { computeBedStats, filterCapacities, type CapacityActions } from './beds/bedStats'
import { BedStatsGrid } from './beds/BedStatsGrid'
import { BedFilters, type BedViewMode } from './beds/BedFilters'
import { BedTable } from './beds/BedTable'
import { BedCards } from './beds/BedCards'
import { NearestBedsPanel } from './beds/NearestBedsPanel'
import { CapacityEditModal } from './beds/CapacityEditModal'
import { QK } from '@/lib/queryKeys'

/** Page « Capacité en lits » : chargement, filtres, admissions et sorties. */
export const BedsManagement: React.FC = () => {
  const queryClient = useQueryClient()

  // Mises à jour poussées par le serveur (regroupées, voir useRealtimeRefresh).
  useRealtimeRefresh([{ events: BED_EVENTS, queryKeys: [QK.bedCapacities, QK.bedsSummary] }])

  const [viewMode, setViewMode] = useState<BedViewMode>('table')
  const [category, setCategory] = useState('')
  const [region, setRegion] = useState('')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<BedCapacity | null>(null)

  const {
    data: capacities = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<BedCapacity[]>({
    queryKey: [...QK.bedCapacities, category, region],
    queryFn: async () => {
      const res = await api.get<{ results: BedCapacity[] }>('/api/lits/capacities/', {
        category: category || undefined,
        region: region || undefined,
      })
      return res.results || []
    },
  })

  const refreshBeds = () => {
    queryClient.invalidateQueries({ queryKey: QK.bedCapacities })
    queryClient.invalidateQueries({ queryKey: QK.bedsSummary })
  }
  const admitMutation = useMutation({
    mutationFn: (id: number) => api.post<BedCapacity>(`/api/lits/capacities/${id}/admit/`),
    onSuccess: refreshBeds,
  })
  const dischargeMutation = useMutation({
    mutationFn: (id: number) => api.post<BedCapacity>(`/api/lits/capacities/${id}/discharge/`),
    onSuccess: refreshBeds,
  })

  const filtered = useMemo(() => filterCapacities(capacities, search), [capacities, search])
  const stats = useMemo(() => computeBedStats(capacities), [capacities])
  const vacantCount = filtered.filter((c) => c.available_beds > 0).length

  const actions: CapacityActions = {
    onAdmit: (id) => admitMutation.mutate(id),
    onDischarge: (id) => dischargeMutation.mutate(id),
    onEdit: setEditing,
    isAdmitting: (id) => admitMutation.isPending && admitMutation.variables === id,
    isDischarging: (id) => dischargeMutation.isPending && dischargeMutation.variables === id,
    admitBusy: admitMutation.isPending,
    dischargeBusy: dischargeMutation.isPending,
  }
  const actionError = admitMutation.error ?? dischargeMutation.error

  return (
    <div className="space-y-5">
      <PageHeader
        title="Capacité en lits"
        description="Occupation des services, admissions et sorties, orientation vers les lits libres les plus proches."
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            isLoading={isRefetching}
            icon={<RefreshCw className="h-3.5 w-3.5" />}
          >
            Actualiser
          </Button>
        }
      />

      <BedStatsGrid stats={stats} serviceCount={capacities.length} />

      <BedFilters
        search={search}
        onSearchChange={setSearch}
        category={category}
        onCategoryChange={setCategory}
        region={region}
        onRegionChange={setRegion}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-3 xl:col-span-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-fg">
              Services <span className="num ml-1 font-normal text-muted">{filtered.length}</span>
            </h2>
            <span className="text-xs text-muted">
              <span className="num text-fg">{vacantCount}</span> avec lits vacants
            </span>
          </div>

          {actionError && (
            <p role="alert" className="text-xs text-critical">
              {actionError instanceof Error ? actionError.message : 'Action impossible.'}
            </p>
          )}

          {isLoading ? (
            <div className="space-y-2 rounded-md border border-line bg-surface p-4">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState title="Aucun service" description="Aucun service ne correspond aux critères sélectionnés." />
          ) : viewMode === 'table' ? (
            <BedTable capacities={filtered} {...actions} />
          ) : (
            <BedCards capacities={filtered} {...actions} />
          )}
        </div>

        <NearestBedsPanel />
      </div>

      <CapacityEditModal capacity={editing} onClose={() => setEditing(null)} />
    </div>
  )
}
