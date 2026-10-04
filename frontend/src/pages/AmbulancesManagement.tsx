import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { MapView } from '@/components/map/MapView'
import { REGIONS, URGENCIES } from '@/lib/constants'
import { formatDateTime, formatMinutes } from '@/lib/format'
import type {
  Ambulance,
  Mission,
  MissionInput,
  MissionStatus,
  MissionStats,
  Urgency,
  RegionCode,
  FacilitySummary,
} from '@/types/api'

export const AmbulancesManagement: React.FC = () => {
  const queryClient = useQueryClient()

  // Onglet sélectionné
  const [activeTab, setActiveTab] = useState<'missions' | 'fleet'>('missions')

  // Modale de création de mission d'urgence
  const [isNewMissionOpen, setIsNewMissionOpen] = useState(false)
  const [newMissionForm, setNewMissionForm] = useState<MissionInput>({
    priority: 'urgent',
    description: '',
    pickup_address: '',
    pickup_latitude: 14.6928,
    pickup_longitude: -17.4467,
    region: 'dakar',
    caller_phone: '',
    destination_id: null,
  })

  // 1. Liste des missions
  const { data: missions = [], isLoading: isLoadingMissions } = useQuery<Mission[]>({
    queryKey: ['missions-all'],
    queryFn: async () => {
      const res = await api.get<{ results: Mission[] }>('/api/ambulances/missions/')
      return res.results || []
    },
  })

  // 2. Liste de la flotte d'ambulances
  const { data: ambulances = [], isLoading: isLoadingFleet } = useQuery<Ambulance[]>({
    queryKey: ['ambulances-fleet'],
    queryFn: async () => {
      const res = await api.get<{ results: Ambulance[] }>('/api/ambulances/vehicles/')
      return res.results || []
    },
  })

  // 3. Statistiques des missions
  const { data: stats } = useQuery<MissionStats>({
    queryKey: ['mission-stats'],
    queryFn: () => api.get<MissionStats>('/api/ambulances/missions/stats/', { days: 30 }),
  })

  // 4. Liste des établissements de santé pour les destinations
  const { data: facilities = [] } = useQuery<FacilitySummary[]>({
    queryKey: ['facilities-hospitals'],
    queryFn: async () => {
      const res = await api.get<{ results: FacilitySummary[] }>('/api/facilities/', {
        facility_type: 'hospital',
      })
      return res.results || []
    },
  })

  // Mutation : Créer une mission
  const createMissionMutation = useMutation({
    mutationFn: (data: MissionInput) => api.post<Mission>('/api/ambulances/missions/', data),
    onSuccess: (newMission) => {
      queryClient.invalidateQueries({ queryKey: ['missions-all'] })
      queryClient.invalidateQueries({ queryKey: ['missions-active'] })
      setIsNewMissionOpen(false)
      // Affecter automatiquement l'ambulance disponible la plus proche
      assignNearestMutation.mutate(newMission.id)
    },
  })

  // Mutation : Affecter l'ambulance la plus proche
  const assignNearestMutation = useMutation({
    mutationFn: (missionId: number) =>
      api.post(`/api/ambulances/missions/${missionId}/assign/`, { radius_km: 60 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['missions-all'] })
      queryClient.invalidateQueries({ queryKey: ['ambulances-fleet'] })
    },
    onError: (err: unknown) => {
      alert(err instanceof Error ? err.message : 'Aucune ambulance disponible trouvée.')
    },
  })

  // Mutation : Changer le statut d'une mission
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: MissionStatus }) =>
      api.post(`/api/ambulances/missions/${id}/status/`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['missions-all'] })
      queryClient.invalidateQueries({ queryKey: ['ambulances-fleet'] })
    },
  })

  return (
    <div className="space-y-8 animate-fade-in">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-white tracking-tight">
            Ambulances & Régulation SAMU
          </h1>
          <p className="text-xs text-ink-400 mt-1">
            Déploiement d'urgence, affectation automatique par proximité PostGIS et suivi GPS de la flotte
          </p>
        </div>

        <Button
          variant="primary"
          onClick={() => setIsNewMissionOpen(true)}
          icon={<span className="text-base">🚨</span>}
        >
          Déclencher une Mission d'Urgence
        </Button>
      </div>

      {/* Cartes métriques */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card className="p-4">
          <span className="text-[11px] font-bold text-ink-400 uppercase tracking-wider block">
            Délai Moyen d'Arrivée sur Place
          </span>
          <div className="text-2xl font-bold text-emerald-400 mt-1">
            {formatMinutes(stats?.response_time_minutes?.average)}
          </div>
          <span className="text-[11px] text-ink-500 mt-1 block">
            Médiane : {formatMinutes(stats?.response_time_minutes?.median)}
          </span>
        </Card>

        <Card className="p-4">
          <span className="text-[11px] font-bold text-ink-400 uppercase tracking-wider block">
            Missions sur 30 jours
          </span>
          <div className="text-2xl font-bold text-ink-100 mt-1">
            {stats?.missions?.total || missions.length}
          </div>
          <span className="text-[11px] text-ink-500 mt-1 block">
            {missions.filter((m) => m.status !== 'completed' && m.status !== 'cancelled').length}{' '}
            actives
          </span>
        </Card>

        <Card className="p-4">
          <span className="text-[11px] font-bold text-ink-400 uppercase tracking-wider block">
            Disponibilité de la Flotte
          </span>
          <div className="text-2xl font-bold text-sky-400 mt-1">
            {ambulances.filter((a) => a.status === 'available').length} / {ambulances.length}
          </div>
          <span className="text-[11px] text-ink-500 mt-1 block">
            {ambulances.filter((a) => a.status === 'on_mission').length} en cours d’intervention
          </span>
        </Card>
      </div>

      {/* Carte des opérations */}
      <Card>
        <CardHeader>
          <CardTitle>Carte Temps Réel des Ambulances</CardTitle>
          <CardDescription>
            Positionnement GPS et affectation des ambulances vers les lieux d'urgence
          </CardDescription>
        </CardHeader>
        <MapView
          ambulances={ambulances}
          missions={missions.filter((m) => m.status !== 'completed' && m.status !== 'cancelled')}
          height="400px"
        />
      </Card>

      {/* Liste des missions & Flotte */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 border-b border-white/[0.08] pb-3">
          <button
            onClick={() => setActiveTab('missions')}
            className={`px-4 py-2 text-xs font-semibold rounded-xl transition-colors cursor-pointer ${
              activeTab === 'missions'
                ? 'bg-brand-600 text-white'
                : 'text-ink-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            Missions d'Urgence ({missions.length})
          </button>
          <button
            onClick={() => setActiveTab('fleet')}
            className={`px-4 py-2 text-xs font-semibold rounded-xl transition-colors cursor-pointer ${
              activeTab === 'fleet'
                ? 'bg-brand-600 text-white'
                : 'text-ink-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            Flotte de Véhicules ({ambulances.length})
          </button>
        </div>

        {activeTab === 'missions' ? (
          <div className="space-y-3">
            {isLoadingMissions ? (
              <div className="surface p-12 text-center text-xs text-ink-500">
                Chargement des missions...
              </div>
            ) : missions.length === 0 ? (
              <div className="surface p-12 text-center text-xs text-ink-500">
                Aucune mission d'urgence enregistrée.
              </div>
            ) : (
              missions.map((mission) => {
                return (
                  <div
                    key={mission.id}
                    className="surface p-4 border border-white/10 hover:border-white/20 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
                  >
                    <div className="flex items-start gap-3.5 min-w-0">
                      <span className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-300 flex items-center justify-center font-bold text-base shrink-0">
                        🚨
                      </span>

                      <div className="space-y-1 truncate">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-ink-100">
                            Mission #{mission.id}
                          </span>
                          <Badge
                            tone={
                              mission.priority === 'critical'
                                ? 'danger'
                                : mission.priority === 'urgent'
                                ? 'warning'
                                : 'info'
                            }
                            size="sm"
                          >
                            {mission.priority_display}
                          </Badge>
                          <Badge
                            tone={
                              mission.status === 'completed'
                                ? 'success'
                                : mission.status === 'cancelled'
                                ? 'neutral'
                                : 'warning'
                            }
                            size="sm"
                          >
                            {mission.status_display}
                          </Badge>
                        </div>

                        <div className="text-ink-300 font-medium truncate">
                          📍 {mission.pickup_address} ({mission.region_display})
                        </div>

                        {mission.description && (
                          <div className="text-ink-400 italic">« {mission.description} »</div>
                        )}

                        <div className="flex items-center gap-4 text-ink-500 text-[11px] pt-1">
                          {mission.ambulance && (
                            <span className="text-emerald-400 font-medium">
                              Ambulance : {mission.ambulance.plate_number} (
                              {mission.ambulance.ambulance_type_display})
                            </span>
                          )}
                          {mission.destination && (
                            <span>Destination : {mission.destination.name}</span>
                          )}
                          <span>Déclenchée : {formatDateTime(mission.created_at)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Cycle de vie de la mission */}
                    <div className="flex items-center gap-2 shrink-0">
                      {mission.status === 'pending' && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => assignNearestMutation.mutate(mission.id)}
                          isLoading={assignNearestMutation.isPending}
                        >
                          Affecter Ambulance
                        </Button>
                      )}

                      {mission.status === 'assigned' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            updateStatusMutation.mutate({ id: mission.id, status: 'on_site' })
                          }
                        >
                          Ambulance sur Place
                        </Button>
                      )}

                      {mission.status === 'on_site' && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() =>
                            updateStatusMutation.mutate({ id: mission.id, status: 'transporting' })
                          }
                        >
                          Débuter Transport
                        </Button>
                      )}

                      {mission.status === 'transporting' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="bg-emerald-600/20 text-emerald-300 border-emerald-500/30 hover:bg-emerald-600/30"
                          onClick={() =>
                            updateStatusMutation.mutate({ id: mission.id, status: 'completed' })
                          }
                        >
                          Terminer Mission
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        ) : (
          /* Liste de la flotte */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {isLoadingFleet ? (
              <div className="surface p-12 text-center text-xs text-ink-500 col-span-3">
                Chargement de la flotte...
              </div>
            ) : (
              ambulances.map((amb) => (
                <Card key={amb.id} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-base text-ink-100">{amb.plate_number}</span>
                    <Badge
                      tone={
                        amb.status === 'available'
                          ? 'success'
                          : amb.status === 'on_mission'
                          ? 'warning'
                          : 'neutral'
                      }
                      size="sm"
                    >
                      {amb.status_display}
                    </Badge>
                  </div>

                  <div className="text-xs space-y-1 text-ink-400">
                    <div>Type : <span className="text-ink-200">{amb.ambulance_type_display}</span></div>
                    <div>Hôpital : <span className="text-ink-200">{amb.facility?.name}</span></div>
                    {amb.driver && (
                      <div>Conducteur : <span className="text-ink-200">{amb.driver.full_name}</span></div>
                    )}
                  </div>
                </Card>
              ))
            )}
          </div>
        )}
      </div>

      {/* Modale de création d'une mission d'urgence */}
      <Modal
        isOpen={isNewMissionOpen}
        onClose={() => setIsNewMissionOpen(false)}
        title="Déclencher une Mission d'Urgence (SAMU)"
        description="L'ambulance disponible la plus proche du lieu d'intervention sera automatiquement affectée"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsNewMissionOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={() => createMissionMutation.mutate(newMissionForm)}
              isLoading={createMissionMutation.isPending}
            >
              Lancer l'Intervention
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Priorité de l'intervention"
              value={newMissionForm.priority}
              onChange={(e) =>
                setNewMissionForm({ ...newMissionForm, priority: e.target.value as Urgency })
              }
            >
              {URGENCIES.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </Select>

            <Select
              label="Région"
              value={newMissionForm.region}
              onChange={(e) =>
                setNewMissionForm({ ...newMissionForm, region: e.target.value as RegionCode })
              }
            >
              {REGIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>

          <Input
            label="Adresse / Repère du lieu d'intervention"
            placeholder="ex. Carrefour Castors, près de la pharmacie"
            required
            value={newMissionForm.pickup_address}
            onChange={(e) =>
              setNewMissionForm({ ...newMissionForm, pickup_address: e.target.value })
            }
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Latitude"
              type="number"
              step="any"
              value={newMissionForm.pickup_latitude}
              onChange={(e) =>
                setNewMissionForm({
                  ...newMissionForm,
                  pickup_latitude: parseFloat(e.target.value) || 14.6928,
                })
              }
            />
            <Input
              label="Longitude"
              type="number"
              step="any"
              value={newMissionForm.pickup_longitude}
              onChange={(e) =>
                setNewMissionForm({
                  ...newMissionForm,
                  pickup_longitude: parseFloat(e.target.value) || -17.4467,
                })
              }
            />
          </div>

          <Input
            label="Téléphone de l'appelant"
            placeholder="77 123 45 67"
            value={newMissionForm.caller_phone}
            onChange={(e) =>
              setNewMissionForm({ ...newMissionForm, caller_phone: e.target.value })
            }
          />

          <Select
            label="Hôpital de destination prévu (facultatif)"
            value={newMissionForm.destination_id || ''}
            onChange={(e) =>
              setNewMissionForm({
                ...newMissionForm,
                destination_id: e.target.value ? parseInt(e.target.value, 10) : null,
              })
            }
          >
            <option value="">Orientation ultérieure selon les lits libres</option>
            {facilities.map((fac) => (
              <option key={fac.id} value={fac.id}>
                {fac.name} ({fac.city})
              </option>
            ))}
          </Select>

          <Textarea
            label="Description clinique / Motif d'appel"
            placeholder="ex. Accident de la voie publique, 2 blessés graves..."
            value={newMissionForm.description}
            onChange={(e) =>
              setNewMissionForm({ ...newMissionForm, description: e.target.value })
            }
          />
        </div>
      </Modal>
    </div>
  )
}
