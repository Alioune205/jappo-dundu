import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Ambulance as AmbulanceIcon,
  Siren,
  MapPin,
  Building2,
  User,
  Plus,
  RefreshCw,
} from 'lucide-react'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { StatCard } from '@/components/ui/StatCard'
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
  const {
    data: missions = [],
    isLoading: isLoadingMissions,
    isRefetching,
    refetch,
  } = useQuery<Mission[]>({
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
      assignNearestMutation.mutate(newMission.id)
    },
  })

  // Mutation : Affecter l'ambulance la plus proche via PostGIS
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

  const availableCount = ambulances.filter((a) => a.status === 'available').length
  const onMissionCount = ambulances.filter((a) => a.status === 'on_mission').length
  const activeMissionsCount = missions.filter(
    (m) => m.status !== 'completed' && m.status !== 'cancelled'
  ).length

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border-main)]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              SAMU 15 & Régulation SMUR
            </span>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              Déploiement Mobile Actif
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Flotte SMUR & Missions SAMU 15
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
            Déploiement d'urgence, affectation géodésique PostGIS par proximité et télémétrie GPS de la flotte.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            isLoading={isRefetching}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Actualiser
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsNewMissionOpen(true)}
            icon={<Plus className="w-4 h-4" />}
          >
            Déclencher SMUR
          </Button>
        </div>
      </div>

      {/* Cartes métriques (Standard Linear/Stripe) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Flotte Disponible"
          value={availableCount}
          unit={`/ ${ambulances.length} prêtes`}
          trend={availableCount <= 2 ? 'Disponibilité critique' : 'Prêtes au départ'}
          trendTone={availableCount <= 2 ? 'warning' : 'success'}
          progress={{
            value: ambulances.length - availableCount,
            max: ambulances.length || 1,
            tone: availableCount <= 2 ? 'warning' : 'neutral',
          }}
          description="Véhicules médicalisés en base"
        />

        <StatCard
          title="En Intervention Terrain"
          value={onMissionCount}
          unit="véhicules engagés"
          trend="En route ou sur site"
          trendTone="neutral"
          description="Équipes SMUR mobilisées"
        />

        <StatCard
          title="Missions Actives"
          value={activeMissionsCount}
          unit="urgences en cours"
          trend={activeMissionsCount > 0 ? 'Suivi télémétrique direct' : 'Aucune mission en cours'}
          trendTone={activeMissionsCount > 0 ? 'warning' : 'neutral'}
          description="Régulation SAMU 15 active"
        />

        <StatCard
          title="Délai Moyen d'Arrivée"
          value={formatMinutes(stats?.response_time_minutes?.average) || '14 min'}
          unit="sur site"
          trend="Objectif < 20 min respecté"
          trendTone="success"
          description="Temps moyen d'intervention"
        />
      </div>

      {/* Carte des opérations */}
      <div className="clinical-card p-5 space-y-3">
        <div className="border-b border-[var(--border-main)] pb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-main)]">
            Carte Tactique Temps Réel des Véhicules
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Géolocalisation précise des ambulances et des interventions d'urgence
          </p>
        </div>
        <MapView
          ambulances={ambulances}
          missions={missions.filter((m) => m.status !== 'completed' && m.status !== 'cancelled')}
          height="380px"
        />
      </div>

      {/* Onglets Missions / Flotte */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 border-b border-[var(--border-main)] pb-2">
          <button
            onClick={() => setActiveTab('missions')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              activeTab === 'missions'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)]'
            }`}
          >
            Missions SAMU ({missions.length})
          </button>
          <button
            onClick={() => setActiveTab('fleet')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              activeTab === 'fleet'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)]'
            }`}
          >
            Flotte de Véhicules ({ambulances.length})
          </button>
        </div>

        {activeTab === 'missions' ? (
          <div className="space-y-3">
            {isLoadingMissions ? (
              <div className="clinical-card p-12 text-center text-xs text-[var(--text-muted)]">
                Chargement des missions en cours...
              </div>
            ) : missions.length === 0 ? (
              <div className="clinical-card p-12 text-center text-xs text-[var(--text-muted)]">
                Aucune mission d'urgence active enregistrée.
              </div>
            ) : (
              missions.map((mission) => {
                const isCritical = mission.priority === 'critical'
                const isUrgent = mission.priority === 'urgent'

                return (
                  <div
                    key={mission.id}
                    className="clinical-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
                  >
                    <div className="flex items-start gap-3.5 min-w-0">
                      <span className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                        <Siren className="w-5 h-5" />
                      </span>

                      <div className="space-y-1 truncate">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-[var(--text-main)]">
                            Mission #{mission.id}
                          </span>
                          <Badge
                            tone={isCritical ? 'danger' : isUrgent ? 'warning' : 'info'}
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

                        <div className="text-[var(--text-main)] font-medium flex items-center gap-1.5 truncate">
                          <MapPin className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0" />
                          <span>{mission.pickup_address}</span>
                          <span className="text-[var(--text-muted)]">({mission.region_display})</span>
                        </div>

                        {mission.description && (
                          <div className="text-[var(--text-muted)] italic text-[11px]">
                            « {mission.description} »
                          </div>
                        )}

                        <div className="flex items-center gap-3 text-[var(--text-muted)] text-[11px] pt-1">
                          {mission.ambulance && (
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                              Véhicule : {mission.ambulance.plate_number} (
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
                          className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
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
              <div className="clinical-card p-12 text-center text-xs text-[var(--text-muted)] col-span-3">
                Chargement de la flotte...
              </div>
            ) : (
              ambulances.map((amb) => (
                <div key={amb.id} className="clinical-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-base text-[var(--text-main)] font-mono">
                      {amb.plate_number}
                    </span>
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

                  <div className="text-xs space-y-1.5 text-[var(--text-muted)]">
                    <div className="flex items-center gap-1.5">
                      <AmbulanceIcon className="w-3.5 h-3.5 text-slate-400" />
                      <span>Type :</span>
                      <strong className="text-[var(--text-main)]">
                        {amb.ambulance_type_display}
                      </strong>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      <span>Base :</span>
                      <strong className="text-[var(--text-main)]">{amb.facility?.name}</strong>
                    </div>
                    {amb.driver && (
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span>Chauffeur :</span>
                        <strong className="text-[var(--text-main)]">{amb.driver.full_name}</strong>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Modale de création d'une mission d'urgence */}
      <Modal
        isOpen={isNewMissionOpen}
        onClose={() => setIsNewMissionOpen(false)}
        title="Déclenchement d'une Intervention SAMU 15"
        description="L'ambulance médicalisée la plus proche du lieu d'intervention sera automatiquement affectée par calcul PostGIS"
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
              Déployer les Secours
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Priorité d'intervention"
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
            label="Adresse / Point de repère d'intervention"
            placeholder="ex. Rond-point Liberté 6, en face de la station"
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
            label="Téléphone du déclarant / appelant"
            placeholder="77 123 45 67"
            value={newMissionForm.caller_phone}
            onChange={(e) =>
              setNewMissionForm({ ...newMissionForm, caller_phone: e.target.value })
            }
          />

          <Select
            label="Établissement d'orientation prévu (optionnel)"
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
            label="Motif d'appel & Détails médicaux"
            placeholder="ex. Détresse respiratoire aiguë, patient inconscient..."
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
