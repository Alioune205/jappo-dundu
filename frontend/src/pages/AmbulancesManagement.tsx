import React, { useCallback, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { canEditFleet } from '@/lib/access'
import { api } from '@/lib/api'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import { MISSION_EVENTS, RealtimeEvent } from '@/lib/realtimeEvents'
import { useAmbulancePositions } from '@/lib/useAmbulancePositions'
import { Button } from '@/components/ui/Button'
import { MapView } from '@/components/map/MapView'
import { PageHeader } from '@/components/ui/PageHeader'
import { Alert } from '@/components/ui/Alert'
import { Tabs } from '@/components/ui/Tabs'
import type { Ambulance, Mission, MissionStats, MissionStatus } from '@/types/api'
import { isActiveMission } from './ambulances/missionUtils'
import { FleetStatsGrid } from './ambulances/FleetStatsGrid'
import { MissionTable } from './ambulances/MissionTable'
import { FleetTable } from './ambulances/FleetTable'
import { NewMissionModal } from './ambulances/NewMissionModal'
import { useHotkey } from '@/lib/useHotkey'
import { VehicleModal } from './ambulances/VehicleModal'
import { DispatchModal } from './ambulances/DispatchModal'
import { SosAlerts } from './ambulances/SosAlerts'
import { QK } from '@/lib/queryKeys'

/** Page « Flotte SAMU » : missions, affectation, cycle de vie, carte et administration de la flotte. */
export const AmbulancesManagement: React.FC = () => {
  const queryClient = useQueryClient()
  const { user, roles, isAdmin } = useAuth()
  const editsFleet = canEditFleet(roles)
  // Administrateur des ambulances : véhicules rattachés d'office à son service.
  const service = isAdmin ? null : (user?.facility ?? null)

  // Mises à jour poussées par le serveur (regroupées, voir useRealtimeRefresh).
  useRealtimeRefresh([
    { events: MISSION_EVENTS, queryKeys: [QK.missionsAll, QK.ambulancesFleet, QK.missionStats] },
    { events: [RealtimeEvent.ambulanceStatus], queryKeys: [QK.ambulancesFleet] },
  ])
  useAmbulancePositions(QK.ambulancesFleet)

  const [activeTab, setActiveTab] = useState<'missions' | 'fleet'>('missions')
  const [actionError, setActionError] = useState<string | null>(null)
  const [isNewMissionOpen, setIsNewMissionOpen] = useState(false)
  // « N » : nouvelle mission, sans quitter le clavier pendant l'appel.
  const openNewMission = useCallback(() => setIsNewMissionOpen(true), [])
  useHotkey('n', openNewMission, !isNewMissionOpen)
  const [editingVehicle, setEditingVehicle] = useState<Ambulance | 'new' | null>(null)
  const [dispatching, setDispatching] = useState<Mission | null>(null)

  const {
    data: missions = [],
    isLoading: isLoadingMissions,
    isRefetching,
    refetch,
  } = useQuery<Mission[]>({
    queryKey: QK.missionsAll,
    queryFn: async () => (await api.get<{ results: Mission[] }>('/api/ambulances/missions/')).results || [],
  })

  const { data: ambulances = [], isLoading: isLoadingFleet } = useQuery<Ambulance[]>({
    queryKey: QK.ambulancesFleet,
    queryFn: async () => (await api.get<{ results: Ambulance[] }>('/api/ambulances/vehicles/')).results || [],
  })

  const { data: stats } = useQuery<MissionStats>({
    queryKey: QK.missionStats,
    queryFn: () => api.get<MissionStats>('/api/ambulances/missions/stats/', { days: 30 }),
  })

  const refreshFleet = () => {
    queryClient.invalidateQueries({ queryKey: QK.missionsAll })
    queryClient.invalidateQueries({ queryKey: QK.ambulancesFleet })
  }

  // Affectation de l'ambulance disponible la plus proche (PostGIS).
  const assignNearest = useMutation({
    mutationFn: (missionId: number) => api.post(`/api/ambulances/missions/${missionId}/assign/`, { radius_km: 60 }),
    onSuccess: refreshFleet,
    onError: (err: unknown) =>
      setActionError(err instanceof Error ? err.message : 'Aucune ambulance disponible à proximité.'),
  })

  const advanceStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: MissionStatus }) =>
      api.post(`/api/ambulances/missions/${id}/status/`, { status }),
    onSuccess: refreshFleet,
    onError: (err: unknown) => setActionError(err instanceof Error ? err.message : 'Changement de statut impossible.'),
  })

  const toggleService = useMutation({
    mutationFn: (ambulance: Ambulance) =>
      api.post<Ambulance>(`/api/ambulances/vehicles/${ambulance.id}/availability/`, {
        status: ambulance.status === 'available' ? 'out_of_service' : 'available',
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QK.ambulancesFleet }),
    onError: (err: unknown) => setActionError(err instanceof Error ? err.message : 'Changement de disponibilité impossible.'),
  })

  const activeMissions = missions.filter(isActiveMission)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Flotte SAMU"
        description="Missions d'urgence, affectation de l'ambulance la plus proche et suivi de la flotte."
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
            {editsFleet && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setActiveTab('fleet')
                  setEditingVehicle('new')
                }}
                icon={<Plus className="h-3.5 w-3.5" />}
              >
                Véhicule
              </Button>
            )}
            <Button variant="danger" size="sm" onClick={() => setIsNewMissionOpen(true)} icon={<Plus className="h-3.5 w-3.5" />} title="Raccourci : N">
              Nouvelle mission
            </Button>
          </>
        }
      />

      {actionError && (
        <Alert tone="danger" title="Action impossible" onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

      <SosAlerts missions={missions} onDispatch={setDispatching} />

      <FleetStatsGrid ambulances={ambulances} missions={missions} stats={stats} />

      <section className="panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="text-sm font-semibold text-fg">Carte des véhicules et interventions</h2>
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted" aria-label="Légende">
            <li className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-ok" /> Libre
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-warning" /> En mission
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-subtle" /> Hors service
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-critical" /> Intervention
            </li>
          </ul>
        </div>
        <div className="p-2">
          <MapView ambulances={ambulances} missions={activeMissions} height="360px" />
        </div>
      </section>

      <div className="space-y-3">
        <Tabs
          tabs={[
            { id: 'missions', label: 'Missions', count: missions.length },
            { id: 'fleet', label: 'Véhicules', count: ambulances.length },
          ]}
          activeTab={activeTab}
          onChange={setActiveTab}
        />

        {activeTab === 'missions' ? (
          <MissionTable
            missions={missions}
            isLoading={isLoadingMissions}
            onAssign={(id) => assignNearest.mutate(id)}
            onAdvance={(id, status) => advanceStatus.mutate({ id, status })}
            onDispatch={setDispatching}
            isAssigning={(id) => assignNearest.isPending && assignNearest.variables === id}
            isAdvancing={(id) => advanceStatus.isPending && advanceStatus.variables?.id === id}
          />
        ) : (
          <FleetTable
            ambulances={ambulances}
            isLoading={isLoadingFleet}
            canEdit={editsFleet}
            onEdit={setEditingVehicle}
            onToggleService={(ambulance) => toggleService.mutate(ambulance)}
            isToggling={(id) => toggleService.isPending && toggleService.variables?.id === id}
          />
        )}
      </div>

      <DispatchModal mission={dispatching} onClose={() => setDispatching(null)} />

      <VehicleModal vehicle={editingVehicle} service={service} onClose={() => setEditingVehicle(null)} />

      <NewMissionModal
        isOpen={isNewMissionOpen}
        onClose={() => setIsNewMissionOpen(false)}
        onCreated={(mission) => assignNearest.mutate(mission.id)}
      />
    </div>
  )
}
