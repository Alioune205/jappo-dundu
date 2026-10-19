import React, { useMemo, useState } from 'react'
import { EmptyState } from '@/components/ui/Skeleton'
import type { BedCapacity } from '@/types/api'
import { BedFilters } from './BedFilters'
import { BedStatsGrid } from './BedStatsGrid'
import { BedTable } from './BedTable'
import { NearestBedsPanel } from './NearestBedsPanel'
import { ReservationsPanel } from './ReservationsPanel'
import { computeBedStats, filterCapacities } from './bedStats'

interface NetworkBedsViewProps {
  capacities: BedCapacity[]
  canReserve: (cap: BedCapacity) => boolean
  onReserve: (cap: BedCapacity) => void
  /** Afficher le suivi des réservations (régulation, administrateur général). */
  showReservations: boolean
}

/**
 * « Trouver un lit » : où y a-t-il de la place dans le réseau ? Lecture et
 * réservation ; les indicateurs portent sur les services affichés.
 */
export const NetworkBedsView: React.FC<NetworkBedsViewProps> = ({ capacities, canReserve, onReserve, showReservations }) => {
  const [category, setCategory] = useState('')
  const [region, setRegion] = useState('')
  const [search, setSearch] = useState('')

  const filtered = useMemo(
    () =>
      filterCapacities(
        capacities.filter((c) => (!category || c.category === category) && (!region || c.facility?.region === region)),
        search
      ).sort((a, b) => b.available_beds - a.available_beds),
    [capacities, category, region, search]
  )
  const stats = useMemo(() => computeBedStats(filtered), [filtered])

  return (
    <div className="space-y-5">
      <BedStatsGrid stats={stats} serviceCount={filtered.length} />
      <BedFilters
        search={search}
        onSearchChange={setSearch}
        category={category}
        onCategoryChange={setCategory}
        region={region}
        onRegionChange={setRegion}
      />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-3 xl:col-span-2">
          <h2 className="text-sm font-semibold text-fg">
            Services <span className="num ml-1 font-normal text-muted">{filtered.length}</span>
            <span className="ml-2 text-xs font-normal text-muted">les plus disponibles d’abord</span>
          </h2>
          {filtered.length === 0 ? (
            <EmptyState title="Aucun service" description="Aucun service ne correspond aux critères sélectionnés." />
          ) : (
            <BedTable capacities={filtered} canReserve={canReserve} onReserve={onReserve} />
          )}
        </div>
        <div className="space-y-5">
          {showReservations && <ReservationsPanel />}
          <NearestBedsPanel />
        </div>
      </div>
    </div>
  )
}
