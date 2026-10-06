import React, { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Ambulance as AmbulanceIcon, ArrowRight, Clock, MapPin, Plus, Siren, Timer, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'
import { api } from '@/lib/api'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { StatCard } from '@/components/ui/StatCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { MapView } from '@/components/map/MapView'
import { useNow } from '@/lib/useNow'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import { useAmbulancePositions } from '@/lib/useAmbulancePositions'
import { MISSION_EVENTS, RealtimeEvent } from '@/lib/realtimeEvents'
import { formatMinutes, formatRelative } from '@/lib/format'
import { QK } from '@/lib/queryKeys'
import type { Ambulance, AmbulanceStatus, FacilitySummary, Mission, MissionStats } from '@/types/api'

/** Une mission en attente depuis plus longtemps est signalée. */
const PENDING_ALERT_MINUTES = 5
/** Position GPS considérée comme ancienne au-delà de ce délai. */
const STALE_POSITION_MINUTES = 15

const PRIORITY_RANK = { critical: 0, urgent: 1, normal: 2 } as const
const STATUS_TONE: Record<AmbulanceStatus, 'success' | 'warning' | 'neutral'> = {
  available: 'success',
  on_mission: 'warning',
  out_of_service: 'neutral',
}
const MISSION_STEP: Record<string, number> = { pending: 0, assigned: 1, on_site: 2, transporting: 3 }
const MISSION_STEPS = ['En attente', 'Affectée', 'Sur place', 'Transport']

const minutesSince = (iso: string | null, now: number) => (iso ? (now - new Date(iso).getTime()) / 60_000 : null)

/**
 * Tableau de bord de l'administrateur des ambulances : missions à traiter de
 * sa région, flotte de son service en direct, délais du mois.
 */
export const AmbulanceManagerDashboard: React.FC<{ facility: FacilitySummary }> = ({ facility }) => {
  const now = useNow(30_000)

  const { data: missions = [], isLoading } = useQuery<Mission[]>({
    queryKey: QK.missionsActive,
    queryFn: async () =>
      (await api.get<{ results: Mission[] }>('/api/ambulances/missions/', { active: true })).results || [],
  })
  const { data: fleet = [] } = useQuery<Ambulance[]>({
    queryKey: QK.ambulancesList,
    queryFn: async () => (await api.get<{ results: Ambulance[] }>('/api/ambulances/vehicles/')).results || [],
  })
  const { data: stats } = useQuery<MissionStats>({
    queryKey: [...QK.missionStats, 30],
    queryFn: () => api.get<MissionStats>('/api/ambulances/missions/stats/', { days: 30 }),
  })

  useRealtimeRefresh([
    { events: MISSION_EVENTS, queryKeys: [QK.missionsActive, QK.ambulancesList, QK.missionStats] },
    { events: [RealtimeEvent.ambulanceStatus], queryKeys: [QK.ambulancesList] },
  ])
  useAmbulancePositions(QK.ambulancesList)

  const sorted = useMemo(
    () =>
      [...missions].sort(
        (a, b) =>
          (MISSION_STEP[a.status] ?? 9) - (MISSION_STEP[b.status] ?? 9) ||
          PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
          a.created_at.localeCompare(b.created_at)
      ),
    [missions]
  )
  const pending = sorted.filter((m) => m.status === 'pending')
  const inProgress = sorted.filter((m) => m.status !== 'pending')
  const waitingTooLong = pending.filter((m) => (minutesSince(m.created_at, now) ?? 0) > PENDING_ALERT_MINUTES)
  const available = fleet.filter((a) => a.status === 'available')
  const fleetSorted = useMemo(
    () => [...fleet].sort((a, b) => a.status.localeCompare(b.status) || a.plate_number.localeCompare(b.plate_number)),
    [fleet]
  )
  const center = useMemo<[number, number] | undefined>(
    () => (facility.latitude != null && facility.longitude != null ? [facility.latitude, facility.longitude] : undefined),
    [facility.latitude, facility.longitude]
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title={facility.name}
        description={
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            Régulation · région de {facility.region_display}
          </span>
        }
        actions={
          <Link
            to="/ambulances"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-brand px-4 text-sm font-semibold text-on-brand hover:bg-brand-strong"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Nouvelle mission
          </Link>
        }
      />

      {waitingTooLong.length > 0 && (
        <Alert tone="danger" title="Mission en attente">
          {waitingTooLong.length} mission{waitingTooLong.length > 1 ? 's attendent' : ' attend'} une ambulance depuis
          plus de {PENDING_ALERT_MINUTES} minutes.{' '}
          {available.length === 0 ? 'Aucune ambulance n’est disponible.' : 'Affectez-la depuis la page Ambulances.'}
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Missions en attente"
          accent="red"
          icon={<Siren className="h-5 w-5" />}
          value={pending.length}
          trend={pending.length > 0 ? 'À affecter' : 'Aucune mission en attente'}
          trendTone={pending.length > 0 ? 'danger' : 'success'}
        />
        <StatCard
          title="Missions en cours"
          accent="yellow"
          icon={<TriangleAlert className="h-5 w-5" />}
          value={inProgress.length}
          description="Affectées, sur place ou en transport"
        />
        <StatCard
          title="Ambulances disponibles"
          accent="green"
          icon={<AmbulanceIcon className="h-5 w-5" />}
          value={available.length}
          unit={`/ ${fleet.length}`}
          progress={{ value: available.length, max: fleet.length || 1, tone: available.length <= 1 ? 'warning' : 'success' }}
          trend={available.length <= 1 ? 'Flotte presque épuisée' : 'Flotte opérationnelle'}
          trendTone={available.length <= 1 ? 'warning' : 'success'}
        />
        <StatCard
          title="Délai d’affectation"
          accent="blue"
          icon={<Timer className="h-5 w-5" />}
          value={formatMinutes(stats?.assignment_delay_minutes.median ?? null)}
          trend={
            stats?.response_time_minutes.median != null
              ? `Arrivée sur place : ${formatMinutes(stats.response_time_minutes.median)}`
              : undefined
          }
          description={`Médiane sur 30 jours · ${stats?.missions.total ?? 0} missions`}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_1fr]">
        {/* Missions actives */}
        <section className="panel">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="text-sm font-semibold text-fg">
              Missions actives <span className="num ml-1 font-normal text-muted">{sorted.length}</span>
            </h2>
            <Link to="/ambulances" className="flex items-center gap-1 text-xs text-muted hover:text-fg">
              Réguler <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {isLoading ? (
            <p className="px-5 py-10 text-center text-xs text-muted">Chargement des missions…</p>
          ) : sorted.length === 0 ? (
            <p className="px-5 py-10 text-center text-xs text-muted">Aucune mission active.</p>
          ) : (
            <ul className="divide-y divide-line">
              {sorted.slice(0, 8).map((m) => {
                const step = MISSION_STEP[m.status] ?? 0
                const late = m.status === 'pending' && (minutesSince(m.created_at, now) ?? 0) > PENDING_ALERT_MINUTES
                return (
                  <li key={m.id} className="space-y-2 px-5 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-fg">{m.description || `Mission n° ${m.id}`}</p>
                        <p className="truncate text-xs text-muted">
                          {m.pickup_address}
                          {m.ambulance ? ` · ${m.ambulance.plate_number}` : ' · sans ambulance'}
                          {m.destination ? ` → ${m.destination.name}` : ''}
                        </p>
                      </div>
                      <Badge
                        size="sm"
                        tone={m.priority === 'critical' ? 'danger' : m.priority === 'urgent' ? 'warning' : 'info'}
                      >
                        {m.priority_display}
                      </Badge>
                    </div>
                    <ol className="grid grid-cols-4 gap-1" aria-label={`Étape : ${MISSION_STEPS[step]}`}>
                      {MISSION_STEPS.map((label, i) => (
                        <li
                          key={label}
                          className={`h-1 rounded-full ${i <= step ? (late ? 'bg-critical' : 'bg-accent-green') : 'bg-raised'}`}
                        />
                      ))}
                    </ol>
                    <p className="flex justify-between text-2xs text-muted">
                      <span className={`font-semibold ${late ? 'text-critical' : 'text-fg'}`}>{MISSION_STEPS[step]}</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        Créée {formatRelative(m.created_at, now)}
                      </span>
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* Flotte */}
        <section className="panel h-fit">
          <div className="border-b border-line px-5 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
              <AmbulanceIcon className="h-4 w-4 text-muted" aria-hidden="true" />
              Ma flotte <span className="num font-normal text-muted">{fleet.length}</span>
            </h2>
            <p className="text-xs text-muted">État et dernière position GPS de chaque véhicule.</p>
          </div>
          {fleet.length === 0 ? (
            <p className="px-5 py-10 text-center text-xs text-muted">Aucun véhicule enregistré.</p>
          ) : (
            <ul className="divide-y divide-line">
              {fleetSorted.map((a) => {
                const located = a.latitude != null && a.longitude != null
                const age = minutesSince(a.location_updated_at, now)
                const stale = !located || (age !== null && age > STALE_POSITION_MINUTES)
                return (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="num truncate text-sm font-semibold text-fg">{a.plate_number}</p>
                      <p className={`truncate text-xs ${stale && a.status !== 'out_of_service' ? 'text-warning' : 'text-muted'}`}>
                        {a.ambulance_type_display}
                        {a.driver ? ` · ${a.driver.full_name}` : ''} ·{' '}
                        {!located
                          ? 'pas de position'
                          : a.location_updated_at
                            ? `position ${formatRelative(a.location_updated_at, now)}`
                            : 'position non datée'}
                      </p>
                    </div>
                    <Badge size="sm" tone={STATUS_TONE[a.status]}>
                      {a.status_display}
                    </Badge>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      <section className="panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="text-sm font-semibold text-fg">Carte de la région</h2>
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted" aria-label="Légende">
            <li className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-ok" /> Ambulance libre
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-warning" /> En mission
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-critical" /> Lieu d’intervention
            </li>
          </ul>
        </div>
        <div className="p-2">
          <MapView ambulances={fleet} missions={sorted} center={center} zoom={12} height="380px" />
        </div>
      </section>
    </div>
  )
}
