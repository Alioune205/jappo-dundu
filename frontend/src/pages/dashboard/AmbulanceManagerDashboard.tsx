import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Ambulance as AmbulanceIcon, Hourglass, MapPin, Plus, Route, Timer } from 'lucide-react'
import { Link } from 'react-router'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/ui/PageHeader'
import { MetricTile } from '@/components/dash/MetricTile'
import { EmptyNote, Legend, LegendItem, Panel } from '@/components/dash/Panel'
import { ArcGauge } from '@/components/dash/ArcGauge'
import { CapsuleChart, type CapsuleDatum } from '@/components/dash/CapsuleChart'
import { Segmented } from '@/components/dash/Segmented'
import { UrgentCard, type UrgentItem } from '@/components/dash/UrgentCard'
import type { Signal } from '@/components/dash/tones'
import { useNow } from '@/lib/useNow'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import { useAmbulancePositions } from '@/lib/useAmbulancePositions'
import { MISSION_EVENTS, RealtimeEvent } from '@/lib/realtimeEvents'
import { formatMinutes } from '@/lib/format'
import { QK } from '@/lib/queryKeys'
import { DispatchModal } from '@/pages/ambulances/DispatchModal'
import { SosAlerts } from '@/pages/ambulances/SosAlerts'
import type { Ambulance, FacilitySummary, Mission, MissionStats } from '@/types/api'
import { MISSION_STEP, formatClock, minutesSince, plural } from './shared'

/** Une mission en attente depuis plus longtemps est signalée. */
const PENDING_ALERT_MINUTES = 5

const PRIORITY_RANK = { critical: 0, urgent: 1, normal: 2 } as const
const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const WEEKDAYS_LONG = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

/** Répartition des appels (GET /api/ambulances/missions/demand/). */
interface Demand {
  days: number
  by_hour: number[]
  by_weekday: number[]
}

/**
 * Tableau de bord de l'administrateur des ambulances : quatre chiffres, puis
 * une seule rangée — le rythme des appels, la mission qui attend une
 * ambulance (chronomètre à la seconde), la flotte en direct. La liste des
 * missions et la carte vivent dans le module Ambulances.
 */
export const AmbulanceManagerDashboard: React.FC<{ facility: FacilitySummary }> = ({ facility }) => {
  const now = useNow(30_000)

  const [dispatching, setDispatching] = useState<Mission | null>(null)
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
    shortText: String(count),
    details: [
      rhythm === 'weekday'
        ? `Les ${WEEKDAYS_LONG[index] ?? ''}s, sur ${demand?.days ?? 30} jours`
        : `Entre ${String(index).padStart(2, '0')} h et ${String((index + 1) % 24).padStart(2, '0')} h`,
      rhythmTotal > 0 ? `${Math.round((count / rhythmTotal) * 100)} % des appels` : '',
    ].filter(Boolean),
  }))

  // Le point à traiter : la plus ancienne mission sans ambulance.
  const urgent: UrgentItem | null = oldestPending
    ? {
        severity:
          oldestPending.priority === 'critical' || (minutesSince(oldestPending.created_at, now) ?? 0) > PENDING_ALERT_MINUTES
            ? 'critical'
            : 'warning',
        tag: 'Sans ambulance',
        heading: oldestPending.description || `Mission n° ${oldestPending.id}`,
        meta: `${oldestPending.pickup_address} · ${oldestPending.priority_display}${
          pending.length > 1 ? ` · ${pending.length} en attente` : ''
        }`,
        extra: (
          <WaitClock
            createdAt={oldestPending.created_at}
            availableCount={available.length}
          />
        ),
        action: { to: '/ambulances', label: 'Affecter une ambulance' },
      }
    : null

  return (
    <div className="space-y-5">
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

      {/* Alertes SOS des citoyens : n'apparaissent que lorsqu'il y en a. */}
      <SosAlerts missions={missions} onDispatch={setDispatching} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          i={0}
          variant="featured"
          icon={Hourglass}
          accent="amber"
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
          accent="blue"
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
          accent="green"
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
          accent="violet"
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

      {/* Une seule rangée : le rythme des appels, l'attente sans ambulance, la flotte. */}
      <div className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Panel
          i={4}
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
          bodyClassName="px-5 pb-4 pt-10"
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

        <UrgentCard
          i={5}
          title="Attente sans ambulance"
          loading={isPending}
          item={urgent}
          more={{ count: Math.max(0, pending.length - 1), to: '/ambulances' }}
          calm={`Aucune mission n’attend d’ambulance. ${plural(available.length, 'ambulance disponible', 'ambulances disponibles')}.`}
        />

        <Panel
          i={6}
          title="Disponibilité de la flotte"
          subtitle="Véhicules de votre service · en direct"
          bodyClassName="flex items-center justify-center px-4 pb-5 pt-4"
        >
          {fleetPending ? (
            <span className="skeleton block h-36 w-60 rounded-t-full" aria-label="Chargement" />
          ) : fleet.length === 0 ? (
            <EmptyNote title="Aucun véhicule enregistré" />
          ) : (
            <ArcGauge
              size={240}
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

      <DispatchModal mission={dispatching} onClose={() => setDispatching(null)} />
    </div>
  )
}

/**
 * Chronomètre de la plus ancienne mission sans ambulance, à la seconde. Seul
 * ce bloc se rafraîchit chaque seconde ; il passe au rouge au-delà de la cible.
 */
const WaitClock: React.FC<{ createdAt: string; availableCount: number }> = ({ createdAt, availableCount }) => {
  const now = useNow(1000)
  const waitedSeconds = (now - new Date(createdAt).getTime()) / 1000
  const late = waitedSeconds > PENDING_ALERT_MINUTES * 60
  return (
    <div>
      <p
        className={`num font-mono text-[2.5rem] font-medium leading-none tracking-[-0.04em] ${late ? 'text-critical' : 'text-fg'}`}
        role="timer"
        aria-live="off"
      >
        {formatClock(waitedSeconds)}
      </p>
      <p className="mt-2 text-xs text-muted">
        {late ? `Délai cible de ${PENDING_ALERT_MINUTES} min dépassé · ` : `Cible : ${PENDING_ALERT_MINUTES} min · `}
        {plural(availableCount, 'ambulance disponible', 'ambulances disponibles')}
      </p>
    </div>
  )
}
