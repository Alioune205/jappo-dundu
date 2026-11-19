import React, { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Ambulance as AmbulanceIcon, ArrowRight, BedDouble, Clock, Gauge, MapPin, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { MetricTile } from '@/components/dash/MetricTile'
import { EmptyNote, Legend, LegendItem, Panel } from '@/components/dash/Panel'
import { ArcGauge } from '@/components/dash/ArcGauge'
import { CapsuleChart, type CapsuleDatum } from '@/components/dash/CapsuleChart'
import { MissionSteps } from '@/components/dash/MissionSteps'
import { UrgentCard, type UrgentItem } from '@/components/dash/UrgentCard'
import { OCCUPANCY_CRITICAL, SIGNAL_FILL, occupancySignal } from '@/components/dash/tones'
import { computeBedStats, occupancyLevel } from '@/pages/beds/bedStats'
import { BED_CATEGORIES } from '@/lib/constants'
import { useNow } from '@/lib/useNow'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import { BED_EVENTS, MISSION_EVENTS } from '@/lib/realtimeEvents'
import { formatEta, formatNumber, formatPercent, formatRelative } from '@/lib/format'
import { QK } from '@/lib/queryKeys'
import { PrealertActions } from './PrealertActions'
import { MISSION_STEP, VITAL_CATEGORIES, plural, shortCategory } from './shared'
import type { BedCapacity, BedSummaryRow, FacilitySummary, Mission } from '@/types/api'

const CATEGORY_ORDER = BED_CATEGORIES.map((c) => c.value)

/** Ordre d'affichage : services vitaux d'abord, puis l'ordre du référentiel. */
const byPriority = (a: BedCapacity, b: BedCapacity) =>
  Number(VITAL_CATEGORIES.has(b.category)) - Number(VITAL_CATEGORIES.has(a.category)) ||
  CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)

const MISSION_STEPS = ['Créée', 'Affectée', 'Sur place', 'En route vers vous']

/**
 * Tableau de bord de l'administrateur des lits : quatre chiffres, puis une
 * seule rangée — l'occupation par service, le point à traiter (un patient
 * annoncé à accepter ou refuser, ou un service vital saturé), l'équilibre
 * capacitaire. Les admissions, réservations et recherches de transfert
 * vivent dans le module Lits.
 */
export const BedManagerDashboard: React.FC<{ facility: FacilitySummary }> = ({ facility }) => {
  const now = useNow()

  // 1. Services de mon établissement
  const { data: capacities = [], isPending } = useQuery<BedCapacity[]>({
    queryKey: [...QK.bedCapacities, 'facility', facility.id],
    queryFn: async () => {
      const res = await api.get<{ results: BedCapacity[] }>('/api/lits/capacities/', { facility: facility.id })
      return res.results || []
    },
  })

  // 2. Synthèse de ma région (comparaison)
  const { data: regionSummary = [] } = useQuery<BedSummaryRow[]>({
    queryKey: [...QK.bedsSummary, facility.region],
    queryFn: () =>
      api.get<BedSummaryRow[]>('/api/lits/capacities/summary/', {
        region: facility.region,
      }),
  })

  // 3. Missions qui m'amènent un patient (le serveur ne renvoie que celles-ci)
  const { data: missions = [] } = useQuery<Mission[]>({
    queryKey: [...QK.missionsActive, 'incoming', facility.id],
    queryFn: async () => {
      const res = await api.get<{ results: Mission[] }>('/api/ambulances/missions/', { active: true })
      return res.results || []
    },
  })

  useRealtimeRefresh([
    {
      events: BED_EVENTS,
      queryKeys: [QK.bedCapacities, QK.bedsSummary, QK.bedsNearest],
    },
    { events: MISSION_EVENTS, queryKeys: [QK.missionsActive] },
  ])

  const services = useMemo(() => [...capacities].sort(byPriority), [capacities])
  const stats = computeBedStats(capacities)
  const reservedTotal = capacities.reduce((acc, c) => acc + (c.reserved_beds ?? 0), 0)
  const tension = services.filter((c) => occupancyLevel(c) !== 'normal')
  const saturatedVital = services.filter((c) => VITAL_CATEGORIES.has(c.category) && c.available_beds === 0)
  const incoming = missions
    .filter((m) => m.destination?.id === facility.id)
    .sort((a, b) => (MISSION_STEP[b.status] ?? 0) - (MISSION_STEP[a.status] ?? 0))
  const transporting = incoming.filter((m) => m.status === 'transporting')

  const lastUpdate = capacities.reduce<BedCapacity | null>(
    (latest, c) => (!latest || c.updated_at > latest.updated_at ? c : latest),
    null
  )

  // Région : par service, et global
  const regionByCategory = useMemo(
    () => new Map(regionSummary.map((r) => [r.category, r])),
    [regionSummary]
  )
  const regionTotal = regionSummary.reduce((acc, r) => acc + r.total_beds, 0)
  const regionOccupied = regionSummary.reduce((acc, r) => acc + r.occupied_beds, 0)
  const regionRate = regionTotal > 0 ? regionOccupied / regionTotal : null
  const myRate = stats.totalBeds > 0 ? stats.globalRate / 100 : null
  const mySignal = occupancySignal(myRate)

  const capsules: CapsuleDatum[] = services.map((c) => {
    const rate = c.total_beds > 0 ? c.occupied_beds / c.total_beds : 0
    const region = regionByCategory.get(c.category)
    return {
      key: String(c.id),
      label: shortCategory(c.category, c.category_display),
      value: c.occupied_beds,
      capacity: c.total_beds,
      signal: occupancySignal(rate),
      marker: region?.occupancy_rate ?? undefined,
      valueText: formatPercent(rate),
      details: [
        `${formatNumber(c.occupied_beds)} occupés sur ${formatNumber(c.total_beds)}`,
        `${formatNumber(c.available_beds)} libres${c.reserved_beds ? ` · ${formatNumber(c.reserved_beds)} réservés` : ''}`,
        region?.occupancy_rate != null ? `Région : ${formatPercent(region.occupancy_rate)}` : 'Pas de comparaison régionale',
      ],
    }
  })

  // Le point à traiter en premier : un patient annoncé qui attend une réponse,
  // sinon un service vital saturé, sinon un patient déjà en route.
  const awaiting = incoming.find((m) => m.destination_status === 'pending')
  const steps = (m: Mission) => (
    <MissionSteps
      step={MISSION_STEP[m.status] ?? 0}
      labels={MISSION_STEPS}
      aside={
        m.status === 'transporting' && m.eta_at ? `Arrivée ${formatEta(m.eta_at, now)}` : `Créée ${formatRelative(m.created_at, now)}`
      }
    />
  )
  const patientItem = (m: Mission, tag: string, withAnswer: boolean): UrgentItem => ({
    severity: m.priority === 'critical' || withAnswer ? 'critical' : 'warning',
    tag,
    heading: m.description || `Mission n° ${m.id}`,
    meta: `${m.pickup_address}${m.ambulance ? ` · ${m.ambulance.plate_number}` : ''} · ${m.priority_display}`,
    extra: (
      <div className="space-y-3">
        {steps(m)}
        {withAnswer && <PrealertActions mission={m} />}
      </div>
    ),
    action: withAnswer ? undefined : { to: '/beds', label: 'Ouvrir Mes lits' },
  })
  const vitalFull = saturatedVital[0]
  const urgent: UrgentItem | null = awaiting
    ? patientItem(awaiting, 'Patient annoncé · à confirmer', true)
    : vitalFull
      ? {
          severity: 'critical',
          tag: 'Service vital saturé',
          heading: vitalFull.category_display,
          big: '0 lit libre',
          bigNote: `sur ${formatNumber(vitalFull.total_beds)}`,
          meta: 'Plus aucun lit : cherchez une solution de transfert.',
          action: { to: '/beds', label: 'Trouver un lit ailleurs' },
        }
      : incoming[0]
        ? patientItem(incoming[0], 'Patient en approche', false)
        : null
  const othersCount = Math.max(
    0,
    incoming.length + saturatedVital.length - (urgent ? 1 : 0)
  )

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={
          <>
            <span>Jappo Lits</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              {facility.city === facility.region_display ? facility.city : `${facility.city} · ${facility.region_display}`}
            </span>
          </>
        }
        title={facility.name}
        description={
          lastUpdate ? (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              Chiffres mis à jour {formatRelative(lastUpdate.updated_at, now)}
              {lastUpdate.updated_by ? ` par ${lastUpdate.updated_by.full_name}` : ''}
            </span>
          ) : (
            'Capacités de vos services, admissions et patients annoncés.'
          )
        }
        actions={
          <Link
            to="/beds"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-brand px-4 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-strong"
          >
            Ouvrir Mes lits <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          i={0}
          variant="featured"
          icon={BedDouble}
          accent="blue"
          to="/beds"
          label="Lits libres"
          loading={isPending}
          value={stats.availableBeds}
          unit={`/ ${formatNumber(stats.totalBeds)}`}
          meter={{
            value: stats.occupiedBeds + reservedTotal,
            max: stats.totalBeds,
            signal: mySignal,
            label: 'Lits occupés ou réservés',
          }}
          status={{ text: plural(services.length, 'service'), signal: 'neutral' }}
          hint={reservedTotal > 0 ? plural(reservedTotal, 'lit réservé', 'lits réservés') : undefined}
        />
        <MetricTile
          i={1}
          icon={Gauge}
          accent="violet"
          label="Taux d’occupation"
          loading={isPending}
          value={myRate}
          format={(v) => formatPercent(v)}
          status={
            regionRate === null || myRate === null
              ? { text: 'Pas de comparaison régionale', signal: 'neutral' }
              : myRate > regionRate
                ? { text: `Région : ${formatPercent(regionRate)} · au-dessus`, signal: 'warning' }
                : { text: `Région : ${formatPercent(regionRate)} · dans la moyenne`, signal: 'ok' }
          }
        />
        <MetricTile
          i={2}
          icon={TriangleAlert}
          accent="amber"
          label="Services en tension"
          loading={isPending}
          value={tension.length}
          unit={`/ ${services.length}`}
          badge={
            stats.saturatedCount > 0
              ? { label: plural(stats.saturatedCount, 'saturé'), signal: 'critical' }
              : undefined
          }
          status={
            tension.length > 0
              ? { text: 'Plus de 85 % occupés', signal: 'critical' }
              : { text: 'Aucune tension', signal: 'ok' }
          }
        />
        <MetricTile
          i={3}
          icon={AmbulanceIcon}
          accent="green"
          label="Patients en approche"
          value={incoming.length}
          unit={incoming.length > 1 ? 'ambulances' : 'ambulance'}
          status={
            transporting.length > 0
              ? { text: `${transporting.length} en route vers vous`, signal: 'warning' }
              : { text: 'Aucun transport en cours', signal: 'neutral' }
          }
        />
      </div>

      {/* Une seule rangée : l'occupation par service, le point à traiter, l'équilibre capacitaire. */}
      <div className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Panel
          i={4}
          title="Occupation par service"
          subtitle="Part des lits occupés · le trait marque le taux de la région"
          footer={
            <Legend>
              <LegendItem className={SIGNAL_FILL.ok}>≤ 70 %</LegendItem>
              <LegendItem className={SIGNAL_FILL.warning}>70–85 %</LegendItem>
              <LegendItem className={SIGNAL_FILL.critical}>&gt; 85 %</LegendItem>
              <LegendItem kind="rest">Lits libres</LegendItem>
            </Legend>
          }
          bodyClassName="px-5 pb-4 pt-10"
        >
          {services.length === 0 ? (
            <EmptyNote
              title={isPending ? 'Chargement…' : 'Aucun service déclaré'}
              hint="Déclarez vos services dans le module Lits."
            />
          ) : (
            <CapsuleChart
              mode="fill"
              data={capsules}
              height={190}
              capsuleWidth={34}
              threshold={{ at: OCCUPANCY_CRITICAL, label: 'Seuil 85 %' }}
              ariaLabel="Occupation des lits par service"
            />
          )}
        </Panel>

        <UrgentCard
          i={5}
          loading={isPending}
          item={urgent}
          more={{ count: othersCount, to: '/beds' }}
          calm="Aucun patient annoncé et aucun service vital saturé."
        />

        <Panel
          i={6}
          title="Équilibre capacitaire"
          subtitle="Lits de l’établissement · en direct"
          actions={
            <Badge tone={mySignal === 'critical' ? 'danger' : mySignal === 'warning' ? 'warning' : 'success'} size="sm">
              {mySignal === 'critical' ? 'Sous tension' : mySignal === 'warning' ? 'Vigilance' : 'Nominal'}
            </Badge>
          }
          bodyClassName="flex items-center justify-center px-4 pb-5 pt-4"
        >
          {stats.totalBeds === 0 ? (
            <EmptyNote title="Aucune capacité déclarée" />
          ) : (
            <ArcGauge
              size={240}
              centerValue={formatPercent(myRate)}
              centerLabel="Occupation globale"
              segments={[
                {
                  label: 'Occupés',
                  value: stats.occupiedBeds,
                  color: `var(--viz-${mySignal === 'critical' ? 'crit' : mySignal === 'warning' ? 'warn' : 'base'})`,
                  unit: 'lits',
                },
                ...(reservedTotal > 0 ? [{ label: 'Réservés', value: reservedTotal, color: 'var(--viz-base)', unit: 'lits' }] : []),
                { label: 'Libres', value: stats.availableBeds, rest: true, unit: 'lits' },
              ]}
            />
          )}
        </Panel>
      </div>
    </div>
  )
}
