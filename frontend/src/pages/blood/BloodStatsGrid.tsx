import React from 'react'
import { StatCard } from '@/components/ui/StatCard'
import type { BloodStats } from './bloodStats'

export const BloodStatsGrid: React.FC<{ stats: BloodStats }> = ({ stats }) => (
  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
    <StatCard title="Demandes ouvertes" value={stats.totalOpen} description="Déclarées par les hôpitaux" />
    <StatCard
      title="Urgences vitales"
      value={stats.criticalCount}
      badge={stats.criticalCount > 0 ? 'Mobiliser' : undefined}
      badgeTone={stats.criticalCount > 0 ? 'danger' : 'neutral'}
      description={stats.criticalCount > 0 ? 'Menace vitale immédiate' : 'Aucune en cours'}
    />
    <StatCard title="Poches manquantes" value={stats.totalUnitsNeeded} unit="unités" description="Cumul des demandes ouvertes" />
    <StatCard title="Demandes satisfaites" value={stats.fulfilledCount} description="Dans la sélection courante" />
  </div>
)
