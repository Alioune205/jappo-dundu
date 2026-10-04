import React from 'react'
import { StatCard } from '@/components/ui/StatCard'
import { formatMinutes } from '@/lib/format'
import type { Ambulance, Mission, MissionStats } from '@/types/api'
import { RESPONSE_TARGET_MINUTES, isActiveMission, responseTrend } from './missionUtils'

interface FleetStatsGridProps {
  ambulances: Ambulance[]
  missions: Mission[]
  stats: MissionStats | undefined
}

export const FleetStatsGrid: React.FC<FleetStatsGridProps> = ({ ambulances, missions, stats }) => {
  const availableCount = ambulances.filter((a) => a.status === 'available').length
  const onMissionCount = ambulances.filter((a) => a.status === 'on_mission').length
  const pendingCount = missions.filter((m) => m.status === 'pending').length
  const activeCount = missions.filter(isActiveMission).length
  const averageResponse = stats?.response_time_minutes?.average ?? null

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        title="Ambulances disponibles"
        value={availableCount}
        unit={`/ ${ambulances.length}`}
        progress={{ value: availableCount, max: ambulances.length || 1, tone: availableCount <= 2 ? 'warning' : 'success' }}
        badge={availableCount <= 2 ? 'Tension' : undefined}
        badgeTone="warning"
        description="Prêtes au départ"
      />
      <StatCard title="En intervention" value={onMissionCount} unit="véhicules" description="En route ou sur place" />
      <StatCard
        title="Missions actives"
        value={activeCount}
        badge={pendingCount > 0 ? `${pendingCount} sans véhicule` : undefined}
        badgeTone="danger"
        description="Non terminées"
      />
      <StatCard
        title="Délai moyen d'arrivée"
        value={formatMinutes(averageResponse)}
        trend={responseTrend(averageResponse)}
        trendTone={averageResponse != null && averageResponse > RESPONSE_TARGET_MINUTES ? 'warning' : 'success'}
        description={averageResponse == null ? 'Pas encore de données' : `${stats?.period_days ?? 30} derniers jours`}
      />
    </div>
  )
}
