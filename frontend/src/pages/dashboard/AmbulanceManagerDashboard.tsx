import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  Ambulance as AmbulanceIcon,
  ArrowRight,
  Clock,
  Gauge,
  MapPin,
  Plus,
  Siren,
  Timer,
  TriangleAlert,
} from 'lucide-react'
import { Link } from 'react-router'
import { api } from '@/lib/api'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { RadialGauge } from '@/components/ui/RadialGauge'
import { StatCard } from '@/components/ui/StatCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { MapView } from '@/components/map/MapView'
import { useNow } from '@/lib/useNow'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import { useAmbulancePositions } from '@/lib/useAmbulancePositions'
import { useThemeColors } from '@/lib/useThemeColors'
import { MISSION_EVENTS, RealtimeEvent } from '@/lib/realtimeEvents'
import { formatMinutes, formatRelative } from '@/lib/format'
import { QK } from '@/lib/queryKeys'
import { DispatchModal } from '@/pages/ambulances/DispatchModal'
import { SosAlerts } from '@/pages/ambulances/SosAlerts'
import type { Ambulance, AmbulanceStatus, FacilitySummary, Mission, MissionStats } from '@/types/api'
import { DemandPanel } from './DemandPanel'
import { FULL_FEATURES } from '@/lib/features'

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
  const colors = useThemeColors()

  const [dispatching, setDispatching] = useState<Mission | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'in_progress'>('all')

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
  const onMissionFleet = fleet.filter((a) => a.status === 'on_mission')
  const outOfServiceFleet = fleet.filter((a) => a.status === 'out_of_service')

  const filteredMissions = useMemo(() => {
    if (statusFilter === 'pending') return pending
    if (statusFilter === 'in_progress') return inProgress
    return sorted
  }, [sorted, pending, inProgress, statusFilter])

  const fleetSorted = useMemo(
    () => [...fleet].sort((a, b) => a.status.localeCompare(b.status) || a.plate_number.localeCompare(b.plate_number)),
    [fleet]
  )
  const center = useMemo<[number, number] | undefined>(
    () => (facility.latitude != null && facility.longitude != null ? [facility.latitude, facility.longitude] : undefined),
    [facility.latitude, facility.longitude]
  )

  const fleetAvailPct = fleet.length > 0 ? Math.round((available.length / fleet.length) * 100) : 0
  const fleetSegments = useMemo(
    () => [
      { label: 'Disponibles', value: available.length, color: colors.ok, unit: 'véh.' },
      { label: 'En mission', value: onMissionFleet.length, color: colors.warning, unit: 'véh.' },
      { label: 'Hors service', value: outOfServiceFleet.length, color: colors.muted, unit: 'véh.' },
    ],
    [available.length, onMissionFleet.length, outOfServiceFleet.length, colors]
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
            className="inline-flex h-10 items-center gap-2 rounded-full bg-brand px-4 text-sm font-semibold text-on-brand shadow-xs transition-all hover:bg-brand-strong"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Nouvelle mission
          </Link>
        }
      />

      <SosAlerts missions={missions} onDispatch={setDispatching} />

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
          variant="hero"
          stagger={1}
          icon={<Siren className="h-5 w-5" />}
          value={pending.length}
          trend={pending.length > 0 ? 'À affecter' : 'Aucune mission en attente'}
          trendTone={pending.length > 0 ? 'danger' : 'success'}
        />
        <StatCard
          title="Missions en cours"
          accent="yellow"
          stagger={2}
          icon={<TriangleAlert className="h-5 w-5" />}
          value={inProgress.length}
          description="Affectées, sur place ou en transport"
        />
        <StatCard
          title="Ambulances disponibles"
          accent="green"
          stagger={3}
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
          stagger={4}
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

      {/* Console Chrono SLA & Répartition de la Flotte */}
      {(fleet.length > 0 || stats != null) && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_1fr]">
          <section className="cmd-tracker-card dash-panel-in flex flex-col justify-between p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="inline-flex items-center gap-1.5 text-2xs font-semibold tracking-wider text-emerald-400 uppercase">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Chronomètre opérationnel SAMU · 30 jours
                </p>
                <h2 className="mt-1 text-base font-bold text-white">Performance de régulation & intervention</h2>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-slate-200">
                <Activity className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                {stats?.missions.by_status?.completed ?? 0} terminée(s)
              </span>
            </div>

            <div className="my-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs text-slate-300">Affectation ambulance (médiane)</p>
                <p className="num mt-1 text-3xl font-bold tracking-tight text-white">
                  {formatMinutes(stats?.assignment_delay_minutes.median ?? null)}
                </p>
                <p className="mt-1 text-2xs text-slate-400">
                  Moyenne : {formatMinutes(stats?.assignment_delay_minutes.average ?? null)} ·{' '}
                  {stats?.assignment_delay_minutes.count ?? 0} éch.
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs text-slate-300">Arrivée sur site (médiane)</p>
                <p className="num mt-1 text-3xl font-bold tracking-tight text-emerald-400">
                  {formatMinutes(stats?.response_time_minutes.median ?? null)}
                </p>
                <p className="mt-1 text-2xs text-slate-400">
                  Moyenne : {formatMinutes(stats?.response_time_minutes.average ?? null)} ·{' '}
                  {stats?.response_time_minutes.count ?? 0} éch.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-xs text-slate-300">
              <span>
                Équipage prêt en direct : <strong className="num text-white">{available.length}</strong> véhicule(s)
              </span>
              <Link
                to="/ambulances"
                className="inline-flex items-center gap-1 font-semibold text-emerald-400 hover:text-emerald-300"
              >
                Ouvrir le poste de régulation <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </section>

          <section className="panel dash-panel-in flex flex-col justify-between p-5">
            <div className="mb-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
                <Gauge className="h-4 w-4 text-brand" aria-hidden="true" />
                Disponibilité de la flotte
              </h2>
              <p className="text-xs text-muted">Répartition opérationnelle des véhicules en temps réel</p>
            </div>
            <div className="my-auto py-1">
              <RadialGauge
                mode="donut"
                segments={fleetSegments}
                centerValue={`${fleetAvailPct}%`}
                centerLabel="Flotte libre"
                size={156}
              />
            </div>
          </section>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_1fr]">
        {/* Missions actives */}
        <section className="panel dash-panel-in overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-fg">
                Missions actives <span className="num ml-1 font-normal text-muted">{sorted.length}</span>
              </h2>
              {sorted.length > 0 && (
                <div className="inline-flex rounded-lg border border-line bg-subtle p-0.5 text-2xs">
                  <button
                    type="button"
                    onClick={() => setStatusFilter('all')}
                    className={`rounded-md px-2 py-0.5 font-medium transition-colors ${
                      statusFilter === 'all' ? 'bg-surface text-fg shadow-xs' : 'text-muted hover:text-fg'
                    }`}
                  >
                    Toutes
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('pending')}
                    className={`rounded-md px-2 py-0.5 font-medium transition-colors ${
                      statusFilter === 'pending' ? 'bg-surface text-fg shadow-xs' : 'text-muted hover:text-fg'
                    }`}
                  >
                    Attente
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('in_progress')}
                    className={`rounded-md px-2 py-0.5 font-medium transition-colors ${
                      statusFilter === 'in_progress' ? 'bg-surface text-fg shadow-xs' : 'text-muted hover:text-fg'
                    }`}
                  >
                    En cours
                  </button>
                </div>
              )}
            </div>
            <Link to="/ambulances" className="flex items-center gap-1 text-xs font-medium text-brand hover:underline">
              Réguler <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {isLoading ? (
            <p className="px-5 py-10 text-center text-xs text-muted">Chargement des missions…</p>
          ) : filteredMissions.length === 0 ? (
            <p className="px-5 py-10 text-center text-xs text-muted">Aucune mission active.</p>
          ) : (
            <ul className="divide-y divide-line">
              {filteredMissions.slice(0, 8).map((m) => {
                const step = MISSION_STEP[m.status] ?? 0
                const late = m.status === 'pending' && (minutesSince(m.created_at, now) ?? 0) > PENDING_ALERT_MINUTES
                return (
                  <li key={m.id} className="space-y-2.5 px-5 py-3.5 transition-colors hover:bg-subtle/40">
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
                    <ol className="grid grid-cols-4 gap-1.5" aria-label={`Étape : ${MISSION_STEPS[step]}`}>
                      {MISSION_STEPS.map((label, i) => (
                        <li
                          key={label}
                          className={`h-1.5 rounded-full transition-colors ${
                            i <= step ? (late ? 'bg-critical' : 'bg-accent-green') : 'bg-raised'
                          }`}
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
        <section className="panel dash-panel-in h-fit overflow-hidden">
          <div className="border-b border-line px-5 py-3.5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
              <AmbulanceIcon className="h-4 w-4 text-brand" aria-hidden="true" />
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
                  <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-subtle/40">
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

      <section className="panel dash-panel-in overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="text-sm font-semibold text-fg">Carte de la région</h2>
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted" aria-label="Légende">
            <li className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-ok" /> Ambulance libre
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-warning" /> En mission
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-critical" /> Lieu d’intervention
            </li>
          </ul>
        </div>
        <div className="p-2">
          <MapView ambulances={fleet} missions={sorted} center={center} zoom={12} height="380px" />
        </div>
      </section>

      {FULL_FEATURES && <DemandPanel />}

      <DispatchModal mission={dispatching} onClose={() => setDispatching(null)} />
    </div>
  )
}
