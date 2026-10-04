import React from 'react'
import { StatCard } from '@/components/ui/StatCard'
import type { BedStats } from './bedStats'

/** Quatre indicateurs : réanimation, urgences, occupation réseau, services saturés. */
export const BedStatsGrid: React.FC<{ stats: BedStats; serviceCount: number }> = ({ stats, serviceCount }) => {
  const occupancyTone = stats.globalRate > 85 ? 'danger' : stats.globalRate > 75 ? 'warning' : 'success'

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        title="Réanimation"
        value={stats.reaBeds}
        unit="lits libres"
        badge={stats.reaBeds === 0 ? 'Aucun lit' : stats.reaBeds <= 2 ? 'Tension' : undefined}
        badgeTone={stats.reaBeds === 0 ? 'danger' : 'warning'}
        description="Soins intensifs"
      />
      <StatCard title="Urgences" value={stats.urgBeds} unit="lits libres" description="Accueil des urgences" />
      <StatCard
        title="Occupation réseau"
        value={`${stats.globalRate.toFixed(1)} %`}
        unit={`${stats.occupiedBeds} / ${stats.totalBeds}`}
        progress={{ value: stats.occupiedBeds, max: stats.totalBeds || 1, tone: occupancyTone }}
        description={`${stats.availableBeds} lits libres`}
      />
      <StatCard
        title="Services saturés"
        value={stats.saturatedCount}
        unit={`/ ${serviceCount}`}
        badge={stats.saturatedCount > 0 ? 'Délestage' : undefined}
        badgeTone="warning"
        description="Aucun lit disponible"
      />
    </div>
  )
}
