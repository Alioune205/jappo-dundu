import { CircleCheck, ClipboardList, Droplets, TriangleAlert } from 'lucide-react'
import React from 'react'
import { StatCard } from '@/components/ui/StatCard'
import type { BloodStats } from './bloodStats'

export const BloodStatsGrid: React.FC<{ stats: BloodStats }> = ({ stats }) => (
  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
    <StatCard title="Demandes ouvertes" accent="blue" icon={<ClipboardList className="h-5 w-5" />} value={stats.totalOpen} description="Déclarées par les hôpitaux" />
    <StatCard
      title="Urgences vitales" accent="red" icon={<TriangleAlert className="h-5 w-5" />}
      value={stats.criticalCount}
      badge={stats.criticalCount > 0 ? 'Mobiliser' : undefined}
      badgeTone={stats.criticalCount > 0 ? 'danger' : 'neutral'}
      description={stats.criticalCount > 0 ? 'Menace vitale immédiate' : 'Aucune en cours'}
    />
    <StatCard title="Poches manquantes" accent="yellow" icon={<Droplets className="h-5 w-5" />} value={stats.totalUnitsNeeded} unit="unités" description="Cumul des demandes ouvertes" />
    <StatCard title="Demandes satisfaites" accent="green" icon={<CircleCheck className="h-5 w-5" />} value={stats.fulfilledCount} description="Dans la sélection courante" />
  </div>
)
