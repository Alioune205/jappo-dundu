import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Ambulance as AmbulanceIcon, ArrowRight, Clock, Hourglass, MapPin, Plus, Route, Timer } from 'lucide-react'
import { Link } from 'react-router'
import { api } from '@/lib/api'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { MapView } from '@/components/map/MapView'
import { MetricTile } from '@/components/dash/MetricTile'
import { EmptyNote, Legend, LegendItem, Panel } from '@/components/dash/Panel'
import { ArcGauge } from '@/components/dash/ArcGauge'
import { CapsuleChart, type CapsuleDatum } from '@/components/dash/CapsuleChart'
import { Segmented } from '@/components/dash/Segmented'
import { MissionSteps } from '@/components/dash/MissionSteps'
import type { Signal } from '@/components/dash/tones'
import { useNow } from '@/lib/useNow'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import { useAmbulancePositions } from '@/lib/useAmbulancePositions'
import { MISSION_EVENTS, RealtimeEvent } from '@/lib/realtimeEvents'
import { formatMinutes, formatNumber, formatRelative } from '@/lib/format'
import { QK } from '@/lib/queryKeys'
import { DispatchModal } from '@/pages/ambulances/DispatchModal'
import { SosAlerts } from '@/pages/ambulances/SosAlerts'
import type { Ambulance, AmbulanceStatus, FacilitySummary, Mission, MissionStats } from '@/types/api'
import { DemandPanel } from './DemandPanel'
import { MISSION_STEP, formatClock, minutesSince, plural } from './shared'
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
const MISSION_STEPS = ['En attente', 'Affectée', 'Sur place', 'Transport']
const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const WEEKDAYS_LONG = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

/** Répartition des appels (GET /api/ambulances/missions/demand/). */
interface Demand {
  days: number
  by_hour: number[]
  by_weekday: number[]
}

/**
 * Tableau de bord de l'administrateur des ambulances : missions à traiter de
 * sa région, flotte de son service en direct, délais et rythme des appels.
 */
export const AmbulanceManagerDashboard: React.FC<{ facility: FacilitySummary }> = ({ facility }) => {
  const now = useNow(30_000)

  const [dispatching, setDispatching] = useState<Mission | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'in_progress'>('all')
  const [rhythm, setRhythm] = useState<'weekday' | 'hour'>('weekday')

  const { data: missions = [], isPending } = useQuery<Mission[]>({
    queryKey: QK.missionsActive,
    queryFn: async () =>
      (await api.get<{ results: Mission[] }>('/api/ambulances/missions/', { active: true })).results || [],
  })
  const { data: fleet = [], isPending: fleetPending } = useQuery<Ambulance[]>({
    queryKey: QK.ambulancesList,
    queryFn: async () => (await api.get<{ results: Ambulance[] }>('/api/ambulances/vehicles/')).results || [],
  })
  const { data: stats, isPending: statsPending } = useQuery<MissionStats>({
    queryKey: [...QK.missionStats, 30],
    queryFn: () => api.get<MissionStats>('/api/ambulances/missions/stats/', { days: 30 }),
  })
  const { data: demand } = useQuery<Demand | null>({
    queryKey: ['missions-demand'],
    queryFn: async () => (await api.get<Demand>('/api/ambulances/missions/demand/', { days: 30 })) ?? null,
    staleTime: 10 * 60_000,
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
  const oldestPending = [...pending].sort((a, b) => a.created_at.localeCompare(b.created_at))[0] ?? null

  const filteredMissions =
    statusFilter === 'pending' ? pending : statusFilter === 'in_progress' ? inProgress : sorted

  const fleetSorted = useMemo(
    () => [...fleet].sort((a, b) => a.status.localeCompare(b.status) || a.plate_number.localeCompare(b.plate_number)),
    [fleet]
  )
  const center = useMemo<[number, number] | undefined>(
    () => (facility.latitude != null && facility.longitude != null ? [facility.latitude, facility.longitude] : undefined),
    [facility.latitude, facility.longitude]
  )

  const fleetSignal: Signal = fleet.length === 0 ? 'neutral' : available.length <= 1 ? 'warning' : 'ok'

  // Rythme des appels : le pic en encre, le reste en teinte douce.
  const rhythmSeries = demand ? (rhythm === 'weekday' ? demand.by_weekday : demand.by_hour) : []
  const rhythmTotal = rhythmSeries.reduce((a, b) => a + b, 0)
  const rhythmPeak = rhythmTotal > 0 ? rhythmSeries.indexOf(Math.max(...rhythmSeries)) : -1
  const rhythmCapsules: CapsuleDatum[] = rhythmSeries.map((count, index) => ({
    key: String(index),
    label: rhythm === 'weekday' ? (WEEKDAYS[index] ?? `J${index + 1}`) : String(index).padStart(2, '0'),
    value: count,
    signal: index === rhythmPeak ? 'ok' : 'neutral',
    valueText: plural(count, 'appel'),
    details: [
      rhythm === 'weekday'
        ? `Les ${WEEKDAYS_LONG[index] ?? ''}s, sur ${demand?.days ?? 30} jours`
        : `Entre ${String(index).padStart(2, '0')} h et ${String((index + 1) % 24).padStart(2, '0')} h`,
      rhythmTotal > 0 ? `${Math.round((count / rhythmTotal) * 100)} % des appels` : '',
    ].filter(Boolean),
  }))

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <>
            <span>Jappo Ambulances</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              Régulation · région de {facility.region_display}
            </span>
          </>
        }
        title={facility.name}
        description="Missions à affecter, flotte en direct et délais de la régulation."
        actions={
          <Link
            to="/ambulances"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-brand px-4 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-strong"
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
        <MetricTile
          i={0}
          variant="featured"
          icon={Hourglass}
          to="/ambulances"
          label="Missions en attente"
          loading={isPending}
          value={pending.length}
          status={
            pending.length > 0
              ? { text: 'À affecter', signal: waitingTooLong.length > 0 ? 'critical' : 'warning' }
              : { text: 'Aucune mission en attente', signal: 'ok' }
          }
          hint={waitingTooLong.length > 0 ? `${waitingTooLong.length} depuis plus de ${PENDING_ALERT_MINUTES} min` : undefined}
        />
        <MetricTile
          i={1}
          icon={Route}
          label="Missions en cours"
          loading={isPending}
          value={inProgress.length}
          status={{
            text: `${inProgress.filter((m) => m.status === 'transporting').length} en transport vers un hôpital`,
            signal: 'neutral',
          }}
          hint="Affectées, sur place, en transport"
        />
        <MetricTile
          i={2}
          icon={AmbulanceIcon}
          label="Ambulances disponibles"
          loading={fleetPending}
          value={available.length}
          unit={`/ ${fleet.length}`}
          meter={{
            value: fleet.length - available.length,
            max: fleet.length,
            signal: fleetSignal,
            label: 'Ambulances engagées ou hors service',
          }}
          status={
            available.length <= 1
              ? { text: 'Flotte presque épuisée', signal: 'warning' }
              : { text: 'Flotte opérationnelle', signal: 'ok' }
          }
        />
        <MetricTile
          i={3}
          icon={Timer}
          label="Délai d’affectation"
          loading={statsPending}
          value={stats?.assignment_delay_minutes.median ?? null}
          format={(v) => formatMinutes(v)}
          status={
            stats?.response_time_minutes.median != null
              ? { text: `Arrivée sur place : ${formatMinutes(stats.response_time_minutes.median)}`, signal: 'neutral' }
              : undefined
          }
          hint={`Médiane sur 30 jours · ${stats?.missions.total ?? 0} missions`}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <RegulationClock
          className="xl:col-span-7"
          oldestPending={oldestPending}
          pendingCount={pending.length}
          stats={stats}
          availableCount={available.length}
        />

        <Panel
          i={3}
          className="xl:col-span-5"
          title="Disponibilité de la flotte"
          subtitle="Véhicules de votre service · en direct"
          bodyClassName="px-5 pb-5 pt-4"
        >
          {fleetPending ? (
            <span className="skeleton mx-auto mt-4 block h-36 w-64 rounded-t-full" aria-label="Chargement" />
          ) : fleet.length === 0 ? (
            <EmptyNote title="Aucun véhicule enregistré" />
          ) : (
            <ArcGauge
              size={280}
              centerValue={`${available.length} / ${fleet.length}`}
              centerLabel="ambulances libres"
              segments={[
                { label: 'En mission', value: onMissionFleet.length, color: 'var(--viz-base)', unit: 'véh.' },
                { label: 'Hors service', value: outOfServiceFleet.length, color: 'var(--fg-subtle)', unit: 'véh.' },
                { label: 'Disponibles', value: available.length, rest: true, unit: 'véh.' },
              ]}
            />
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Panel
          i={4}
          className="xl:col-span-7"
          title={
            <>
              Missions actives <span className="num ml-1 font-normal text-muted">{sorted.length}</span>
            </>
          }
          subtitle="En attente d’abord, puis par priorité et ancienneté"
          actions={
            <>
              {sorted.length > 0 && (
                <Segmented
                  ariaLabel="Filtrer les missions"
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={[
                    { value: 'all', label: 'Toutes', count: sorted.length },
                    { value: 'pending', label: 'Attente', count: pending.length },
                    { value: 'in_progress', label: 'En cours', count: inProgress.length },
                  ]}
                />
              )}
              <Link to="/ambulances" className="inline-flex items-center gap-1 text-xs font-semibold text-fg hover:underline">
                Réguler <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </>
          }
          bodyClassName="pt-2"
        >
          {isPending ? (
            <div className="space-y-3 px-5 pb-5" aria-label="Chargement">
              {[0, 1, 2].map((k) => (
                <span key={k} className="skeleton block h-16 w-full" />
              ))}
            </div>
          ) : filteredMissions.length === 0 ? (
            <EmptyNote
              tone="calm"
              title={statusFilter === 'pending' ? 'Aucune mission en attente' : 'Aucune mission active'}
            />
          ) : (
            <ul className="divide-y divide-line">
              {filteredMissions.slice(0, 8).map((m, index) => {
                const step = MISSION_STEP[m.status] ?? 0
                const late = m.status === 'pending' && (minutesSince(m.created_at, now) ?? 0) > PENDING_ALERT_MINUTES
                return (
                  <li
                    key={m.id}
                    className="reveal space-y-2.5 px-5 py-3.5"
                    style={{ '--i': index + 2 } as React.CSSProperties}
                  >
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
                    <MissionSteps
                      step={step}
                      labels={MISSION_STEPS}
                      late={late}
                      aside={
                        <>
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          Créée {formatRelative(m.created_at, now)}
                        </>
                      }
                    />
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        <Panel
          i={5}
          className="xl:col-span-5"
          title={
            <>
              Ma flotte <span className="num ml-1 font-normal text-muted">{fleet.length}</span>
            </>
          }
          subtitle="État et dernière position GPS de chaque véhicule"
          bodyClassName="pt-2"
        >
          {fleetPending ? (
            <div className="space-y-3 px-5 pb-5" aria-label="Chargement">
              {[0, 1, 2].map((k) => (
                <span key={k} className="skeleton block h-11 w-full" />
              ))}
            </div>
          ) : fleet.length === 0 ? (
            <EmptyNote title="Aucun véhicule enregistré" />
          ) : (
            <ul className="divide-y divide-line">
              {fleetSorted.map((a, index) => {
                const located = a.latitude != null && a.longitude != null
                const age = minutesSince(a.location_updated_at, now)
                const stale = !located || (age !== null && age > STALE_POSITION_MINUTES)
                return (
                  <li
                    key={a.id}
                    className="reveal flex items-center justify-between gap-3 px-5 py-3"
                    style={{ '--i': index + 2 } as React.CSSProperties}
                  >
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
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Panel
          i={6}
          className="xl:col-span-5"
          title="Rythme des appels"
          subtitle={`Missions des ${demand?.days ?? 30} derniers jours, par ${rhythm === 'weekday' ? 'jour' : 'heure'}`}
          actions={
            <Segmented
              ariaLabel="Découpage"
              value={rhythm}
              onChange={setRhythm}
              options={[
                { value: 'weekday', label: 'Jour' },
                { value: 'hour', label: 'Heure' },
              ]}
            />
          }
          footer={
            rhythmTotal > 0 && (
              <>
                <Legend>
                  <LegendItem className="bg-viz-base">Pic d’activité</LegendItem>
                  <LegendItem className="bg-viz-base-soft">Autres {rhythm === 'weekday' ? 'jours' : 'heures'}</LegendItem>
                </Legend>
                <span className="num font-medium text-fg">{plural(rhythmTotal, 'appel')}</span>
              </>
            )
          }
          bodyClassName="px-5 pb-5 pt-12"
        >
          {!demand ? (
            <EmptyNote title="Rythme indisponible" hint="La répartition des appels n’a pas pu être chargée." />
          ) : rhythmTotal === 0 ? (
            <EmptyNote title="Aucun appel sur la période" hint="Le rythme apparaîtra avec les premières missions." />
          ) : (
            <CapsuleChart
              mode="scale"
              data={rhythmCapsules}
              height={170}
              ariaLabel={`Appels par ${rhythm === 'weekday' ? 'jour de la semaine' : 'heure'}`}
            />
          )}
        </Panel>

        <Panel
          i={7}
          className="xl:col-span-7"
          title="Carte de la région"
          subtitle="Ambulances et lieux d’intervention · positions en direct"
          actions={
            <Legend>
              <LegendItem className="bg-ok">Libre</LegendItem>
              <LegendItem className="bg-viz-warn">En mission</LegendItem>
              <LegendItem className="bg-critical">Intervention</LegendItem>
            </Legend>
          }
          bodyClassName="p-2 pt-3"
        >
          <div className="overflow-hidden rounded-2xl">
            <MapView ambulances={fleet} missions={sorted} center={center} zoom={12} height="340px" />
          </div>
        </Panel>
      </div>

      {FULL_FEATURES && <DemandPanel />}

      <DispatchModal mission={dispatching} onClose={() => setDispatching(null)} />
    </div>
  )
}

/**
 * Chronomètre de régulation : le temps qui passe pour la plus ancienne
 * mission sans ambulance, à la seconde. Sans mission en attente, il affiche
 * les délais médians du mois. Seul ce bloc se rafraîchit chaque seconde.
 */
const RegulationClock: React.FC<{
  oldestPending: Mission | null
  pendingCount: number
  stats: MissionStats | undefined
  availableCount: number
  className?: string
}> = ({ oldestPending, pendingCount, stats, availableCount, className = '' }) => {
  const now = useNow(1000)
  const waitedSeconds = oldestPending ? (now - new Date(oldestPending.created_at).getTime()) / 1000 : 0
  const late = waitedSeconds > PENDING_ALERT_MINUTES * 60

  return (
    <section
      className={`panel-featured reveal flex flex-col p-6 ${className}`}
      style={{ '--i': 2 } as React.CSSProperties}
      aria-label="Chronomètre de régulation"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.9375rem] font-semibold tracking-[-0.01em] text-fg">Chronomètre de régulation</p>
          <p className="mt-0.5 text-xs text-muted">
            {oldestPending
              ? `Plus ancienne mission sans ambulance${pendingCount > 1 ? ` · ${pendingCount} en attente` : ''}`
              : 'Aucune mission en attente d’affectation'}
          </p>
        </div>
        <span
          className={`inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ${
            oldestPending ? (late ? 'bg-critical/10 text-critical' : 'bg-warning/10 text-warning') : 'bg-ok/10 text-ok'
          }`}
        >
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full ${oldestPending ? (late ? 'bg-critical live-pulse' : 'bg-viz-warn live-pulse') : 'bg-ok'}`}
          />
          {oldestPending ? (late ? 'Délai dépassé' : 'En cours') : 'À jour'}
        </span>
      </div>

      {oldestPending ? (
        <div className="my-6">
          <p
            className={`num font-mono text-[clamp(2.75rem,6vw,4.25rem)] font-medium leading-none tracking-[-0.04em] ${
              late ? 'text-critical' : 'text-fg'
            }`}
            role="timer"
            aria-live="off"
          >
            {formatClock(waitedSeconds)}
          </p>
          <p className="mt-3 truncate text-sm font-medium text-fg">
            {oldestPending.description || `Mission n° ${oldestPending.id}`}
            <span className="font-normal text-muted">
              {' '}
              · {oldestPending.pickup_address} · {oldestPending.priority_display}
            </span>
          </p>
        </div>
      ) : (
        <div className="my-6">
          <p className="num font-mono text-[clamp(2.75rem,6vw,4.25rem)] font-medium leading-none tracking-[-0.04em] text-fg/25">
            00:00:00
          </p>
          <p className="mt-3 text-sm text-muted">
            {plural(availableCount, 'ambulance disponible', 'ambulances disponibles')} pour la prochaine mission.
          </p>
        </div>
      )}

      <dl className="mt-auto grid grid-cols-3 gap-2">
        {[
          { label: 'Affectation (médiane)', value: formatMinutes(stats?.assignment_delay_minutes.median ?? null) },
          { label: 'Arrivée sur place (médiane)', value: formatMinutes(stats?.response_time_minutes.median ?? null) },
          { label: 'Missions terminées', value: formatNumber(stats?.missions.by_status?.completed ?? null) },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl bg-surface/80 px-4 py-3 shadow-[0_1px_2px_rgb(16_24_40/0.04)]">
            <dt className="text-2xs text-muted">{item.label}</dt>
            <dd className="num mt-0.5 text-lg font-semibold text-fg">{item.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-2xs text-subtle">Sur les 30 derniers jours.</p>
    </section>
  )
}
