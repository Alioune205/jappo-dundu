import React, { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ambulance as AmbulanceIcon, ArrowRight, BedDouble, Clock, Gauge, MapPin, Minus, Phone, Plus, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'
import { api } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { MapView } from '@/components/map/MapView'
import { MetricTile } from '@/components/dash/MetricTile'
import { EmptyNote, Legend, LegendItem, Panel } from '@/components/dash/Panel'
import { ArcGauge } from '@/components/dash/ArcGauge'
import { CapsuleChart, type CapsuleDatum } from '@/components/dash/CapsuleChart'
import { Segmented } from '@/components/dash/Segmented'
import { MissionSteps } from '@/components/dash/MissionSteps'
import { OCCUPANCY_CRITICAL, SIGNAL_FILL, occupancySignal } from '@/components/dash/tones'
import { computeBedStats, occupancyLevel } from '@/pages/beds/bedStats'
import { FreshnessBadge } from '@/pages/beds/FreshnessBadge'
import { BED_CATEGORIES } from '@/lib/constants'
import { useNow } from '@/lib/useNow'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import { BED_EVENTS, MISSION_EVENTS } from '@/lib/realtimeEvents'
import { formatDistance, formatEta, formatNumber, formatPercent, formatRelative } from '@/lib/format'
import { QK } from '@/lib/queryKeys'
import { BilanSummary, DestinationStatusBadge } from '@/pages/ambulances/MissionClinical'
import { PrealertActions } from './PrealertActions'
import { TechnicalPanel } from './TechnicalPanel'
import { TensionBanner } from './TensionBanner'
import { MISSION_STEP, VITAL_CATEGORIES, plural, shortCategory } from './shared'
import type {
  Ambulance,
  BedCapacity,
  BedCategory,
  BedSummaryRow,
  FacilitySummary,
  Mission,
  NearbyBedFacility,
} from '@/types/api'
import { FULL_FEATURES } from '@/lib/features'

const CATEGORY_ORDER = BED_CATEGORIES.map((c) => c.value)

/** Ordre d'affichage : services vitaux d'abord, puis l'ordre du référentiel. */
const byPriority = (a: BedCapacity, b: BedCapacity) =>
  Number(VITAL_CATEGORIES.has(b.category)) - Number(VITAL_CATEGORIES.has(a.category)) ||
  CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)

const MISSION_STEPS = ['Créée', 'Affectée', 'Sur place', 'En route vers vous']

/**
 * Tableau de bord de l'administrateur des lits : son établissement d'abord
 * (services, admissions, capacité, patients en approche), puis sa région.
 */
export const BedManagerDashboard: React.FC<{ facility: FacilitySummary }> = ({ facility }) => {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const now = useNow()
  const [chartMode, setChartMode] = useState<'rate' | 'volume'>('rate')

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

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: QK.bedCapacities })
    queryClient.invalidateQueries({ queryKey: QK.bedsSummary })
  }
  const admit = useMutation({
    mutationFn: (id: number) => api.post<BedCapacity>(`/api/lits/capacities/${id}/admit/`),
    onSuccess: refresh,
  })
  const discharge = useMutation({
    mutationFn: (id: number) => api.post<BedCapacity>(`/api/lits/capacities/${id}/discharge/`),
    onSuccess: refresh,
  })
  const busy = admit.isPending || discharge.isPending
  const actionError = admit.error ?? discharge.error

  const services = useMemo(() => [...capacities].sort(byPriority), [capacities])
  const stats = computeBedStats(capacities)
  const reservedTotal = capacities.reduce((acc, c) => acc + (c.reserved_beds ?? 0), 0)
  const expectedDischargesTotal = capacities.reduce((acc, c) => acc + (c.expected_discharges ?? 0), 0)
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
    () => new Map<BedCategory, BedSummaryRow>(regionSummary.map((r) => [r.category, r])),
    [regionSummary]
  )
  const regionTotal = regionSummary.reduce((acc, r) => acc + r.total_beds, 0)
  const regionOccupied = regionSummary.reduce((acc, r) => acc + r.occupied_beds, 0)
  const regionRate = regionTotal > 0 ? regionOccupied / regionTotal : null
  const myRate = stats.totalBeds > 0 ? stats.globalRate / 100 : null
  const mySignal = occupancySignal(myRate)

  const maxTotal = Math.max(1, ...services.map((c) => c.total_beds))
  const capsules: CapsuleDatum[] = services.map((c) => {
    const rate = c.total_beds > 0 ? c.occupied_beds / c.total_beds : 0
    const region = regionByCategory.get(c.category)
    return {
      key: String(c.id),
      label: shortCategory(c.category, c.category_display),
      value: c.occupied_beds,
      capacity: c.total_beds,
      heightRatio: chartMode === 'volume' ? Math.max(0.15, c.total_beds / maxTotal) : 1,
      signal: occupancySignal(rate),
      marker: chartMode === 'rate' ? (region?.occupancy_rate ?? undefined) : undefined,
      valueText: chartMode === 'rate' ? formatPercent(rate) : `${formatNumber(c.available_beds)} / ${formatNumber(c.total_beds)}`,
      details: [
        `${formatNumber(c.occupied_beds)} occupés sur ${formatNumber(c.total_beds)}`,
        `${formatNumber(c.available_beds)} libres${c.reserved_beds ? ` · ${formatNumber(c.reserved_beds)} réservés` : ''}`,
        region?.occupancy_rate != null ? `Région : ${formatPercent(region.occupancy_rate)}` : 'Pas de comparaison régionale',
      ],
    }
  })

  const center = useMemo<[number, number] | undefined>(
    () =>
      facility.latitude != null && facility.longitude != null ? [facility.latitude, facility.longitude] : undefined,
    [facility.latitude, facility.longitude]
  )
  const inboundAmbulances = incoming.map((m) => m.ambulance).filter((a): a is Ambulance => a !== null)

  return (
    <div className="space-y-6">
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

      {FULL_FEATURES && <TensionBanner facility={facility} />}

      {saturatedVital.length > 0 && (
        <Alert tone="danger" title="Service vital saturé">
          {saturatedVital.map((c) => c.category_display).join(', ')} : plus aucun lit libre. Les solutions de transfert
          sont proposées plus bas.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          i={0}
          variant="featured"
          icon={BedDouble}
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

      {services.length > 0 && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <Panel
            i={2}
            className="xl:col-span-7"
            title="Occupation par service"
            subtitle={
              chartMode === 'rate'
                ? 'Part des lits occupés · le trait blanc marque le taux de la région'
                : 'Hauteur = capacité du service · remplissage = lits occupés'
            }
            actions={
              <Segmented
                ariaLabel="Mode du graphique"
                value={chartMode}
                onChange={setChartMode}
                options={[
                  { value: 'rate', label: 'Taux' },
                  { value: 'volume', label: 'Volumes' },
                ]}
              />
            }
            footer={
              <>
                <Legend>
                  <LegendItem className={SIGNAL_FILL.ok}>≤ 70 %</LegendItem>
                  <LegendItem className={SIGNAL_FILL.warning}>70–85 %</LegendItem>
                  <LegendItem className={SIGNAL_FILL.critical}>&gt; 85 %</LegendItem>
                  <LegendItem kind="rest">Lits libres</LegendItem>
                </Legend>
                {expectedDischargesTotal > 0 && (
                  <span className="num font-medium text-fg">
                    {plural(expectedDischargesTotal, 'sortie prévue', 'sorties prévues')}
                  </span>
                )}
              </>
            }
            bodyClassName="px-5 pb-5 pt-10"
          >
            <CapsuleChart
              mode="fill"
              data={capsules}
              height={210}
              threshold={chartMode === 'rate' ? { at: OCCUPANCY_CRITICAL, label: 'Seuil 85 %' } : undefined}
              ariaLabel="Occupation des lits par service"
            />
          </Panel>

          <Panel
            i={3}
            className="xl:col-span-5"
            title="Équilibre capacitaire"
            subtitle="Lits de l’établissement · en direct"
            actions={
              <Badge tone={mySignal === 'critical' ? 'danger' : mySignal === 'warning' ? 'warning' : 'success'} size="sm">
                {mySignal === 'critical' ? 'Sous tension' : mySignal === 'warning' ? 'Vigilance' : 'Nominal'}
              </Badge>
            }
            bodyClassName="px-5 pb-5 pt-4"
          >
            <ArcGauge
              size={290}
              centerValue={formatPercent(myRate)}
              centerLabel="Occupation globale"
              segments={[
                {
                  label: 'Occupés',
                  value: stats.occupiedBeds,
                  color: `var(--viz-${mySignal === 'critical' ? 'crit' : mySignal === 'warning' ? 'warn' : 'base'})`,
                  unit: 'lits',
                },
                ...(reservedTotal > 0 ? [{ label: 'Réservés', value: reservedTotal, color: 'var(--info)', unit: 'lits' }] : []),
                { label: 'Libres', value: stats.availableBeds, rest: true, unit: 'lits' },
              ]}
            />
          </Panel>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Panel
          i={4}
          className="xl:col-span-7"
          title="Mes services"
          subtitle="Admettre un patient (+) ou enregistrer sa sortie (−)"
          actions={
            <Link to="/beds" className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-fg">
              Mes lits <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          }
          bodyClassName="pt-2"
        >
          {actionError && (
            <div className="px-5 pb-3">
              <Alert tone="danger" onClose={() => (admit.error ? admit.reset() : discharge.reset())}>
                {actionError instanceof Error ? actionError.message : 'Action impossible.'}
              </Alert>
            </div>
          )}
          {isPending ? (
            <div className="space-y-3 px-5 pb-5" aria-label="Chargement">
              {[0, 1, 2, 3].map((k) => (
                <span key={k} className="skeleton block h-12 w-full" />
              ))}
            </div>
          ) : services.length === 0 ? (
            <EmptyNote
              title="Aucun service déclaré"
              hint={
                <Link to="/beds" className="font-semibold text-fg underline underline-offset-4">
                  Déclarer une capacité
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {services.map((cap, index) => {
                const region = regionByCategory.get(cap.category)
                const total = Math.max(1, cap.total_beds)
                const rate = cap.total_beds > 0 ? cap.occupied_beds / cap.total_beds : 0
                return (
                  <li
                    key={cap.id}
                    className="reveal grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2.5 px-5 py-3.5 sm:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_auto]"
                    style={{ '--i': index + 2 } as React.CSSProperties}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm font-semibold text-fg">{cap.category_display}</span>
                        {VITAL_CATEGORIES.has(cap.category) && (
                          <Badge tone="brand" size="sm" dot={false}>
                            Vital
                          </Badge>
                        )}
                        {cap.freshness && cap.freshness !== 'fresh' && (
                          <FreshnessBadge freshness={cap.freshness} confirmedAt={cap.confirmed_at} now={now} showAge={false} />
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        <span className={`num font-semibold ${cap.available_beds === 0 ? 'text-critical' : 'text-fg'}`}>
                          {cap.available_beds}
                        </span>{' '}
                        libre{cap.available_beds > 1 ? 's' : ''} sur <span className="num">{cap.total_beds}</span>
                        {cap.reserved_beds > 0 && (
                          <span className="font-medium text-info">
                            {' · '}
                            {plural(cap.reserved_beds, 'réservé')}
                          </span>
                        )}
                        {' · '}
                        {formatRelative(cap.updated_at, now)}
                      </p>
                    </div>
                    <div className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto">
                      <div className="flex items-center gap-3">
                        <div
                          className="relative h-2 flex-1 overflow-hidden rounded-full bg-track"
                          role="meter"
                          aria-label={`Occupation : ${cap.category_display}`}
                          aria-valuemin={0}
                          aria-valuemax={cap.total_beds}
                          aria-valuenow={cap.occupied_beds}
                        >
                          <div className="absolute inset-y-0 left-0 flex w-full">
                            <span
                              className={`bar-fill h-full rounded-l-full ${SIGNAL_FILL[occupancySignal(rate)]}`}
                              style={{ width: `${(cap.occupied_beds / total) * 100}%` }}
                            />
                            {cap.reserved_beds > 0 && (
                              <span className="bar-fill h-full bg-info" style={{ width: `${(cap.reserved_beds / total) * 100}%` }} />
                            )}
                          </div>
                          {region?.occupancy_rate != null && (
                            <span
                              aria-hidden="true"
                              className="absolute inset-y-0 w-0.5 bg-fg"
                              style={{ left: `${Math.min(100, region.occupancy_rate * 100)}%` }}
                            />
                          )}
                        </div>
                        <span className="num w-11 text-right text-xs font-semibold text-fg">{formatPercent(rate)}</span>
                      </div>
                      {region?.occupancy_rate != null && (
                        <p className="mt-1 text-2xs text-muted">Région : {formatPercent(region.occupancy_rate)}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => discharge.mutate(cap.id)}
                        disabled={busy || cap.occupied_beds === 0}
                        aria-label={`Sortie d’un patient : ${cap.category_display}`}
                        title="Sortie d’un patient"
                        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-sunken text-muted transition-[background-color,color,scale] duration-150 hover:bg-track hover:text-fg active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => admit.mutate(cap.id)}
                        disabled={busy || cap.available_beds === 0}
                        aria-label={`Admettre un patient : ${cap.category_display}`}
                        title="Admettre un patient"
                        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-brand-soft text-fg transition-[background-color,color,scale] duration-150 hover:bg-brand hover:text-on-brand active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        <div className="flex min-w-0 flex-col gap-6 xl:col-span-5">
          <Panel
            i={5}
            title={
              <>
                Patients en approche <span className="num ml-1 font-normal text-muted">{incoming.length}</span>
              </>
            }
            subtitle="Missions SAMU à destination de votre établissement"
            bodyClassName="pt-2"
          >
            {incoming.length === 0 ? (
              <EmptyNote tone="calm" title="Aucune ambulance n’est en route vers vous" />
            ) : (
              <ul className="divide-y divide-line">
                {incoming.map((m) => {
                  const step = MISSION_STEP[m.status] ?? 0
                  return (
                    <li key={m.id} className="space-y-2.5 px-5 py-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-fg">{m.description || `Mission n° ${m.id}`}</p>
                          <p className="truncate text-xs text-muted">
                            {m.pickup_address}
                            {m.ambulance ? ` · ${m.ambulance.plate_number}` : ''}
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
                        aside={
                          m.status === 'transporting' && m.eta_at
                            ? `Arrivée ${formatEta(m.eta_at, now)}`
                            : `Créée ${formatRelative(m.created_at, now)}`
                        }
                      />
                      {m.destination_status && m.destination_status !== 'pending' && <DestinationStatusBadge mission={m} />}
                      <PrealertActions mission={m} />
                      {FULL_FEATURES && <BilanSummary mission={m} now={now} />}
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>

          <TransferPanel facility={facility} services={services} />

          {FULL_FEATURES && <TechnicalPanel facility={facility} />}
        </div>
      </div>

      <Panel
        i={7}
        title={`Autour de ${facility.name}`}
        subtitle="Votre établissement et les ambulances en route vers vous"
        actions={
          <Legend>
            <LegendItem className="bg-info">Établissement</LegendItem>
            <LegendItem className="bg-viz-warn">Ambulance vers vous</LegendItem>
          </Legend>
        }
        bodyClassName="p-2 pt-3"
      >
        <div className="overflow-hidden rounded-2xl">
          <MapView
            facilities={[facility]}
            ambulances={inboundAmbulances}
            missions={incoming}
            center={center}
            zoom={13}
            height="340px"
          />
        </div>
      </Panel>

      {user && (
        <p className="text-center text-2xs text-subtle">
          Vous gérez les lits de {facility.name}. Les autres établissements sont visibles en lecture seule.
        </p>
      )}
    </div>
  )
}

/**
 * Solutions de transfert : pour un service choisi (par défaut le service vital
 * le plus tendu), les établissements proches qui ont des lits libres.
 */
const TransferPanel: React.FC<{
  facility: FacilitySummary
  services: BedCapacity[]
}> = ({ facility, services }) => {
  const mostTense = [...services]
    .filter((c) => VITAL_CATEGORIES.has(c.category))
    .sort((a, b) => a.available_beds - b.available_beds || b.occupancy_rate - a.occupancy_rate)[0]
  const [chosen, setChosen] = useState<BedCategory | null>(null)
  const category: BedCategory = chosen ?? mostTense?.category ?? 'emergency'
  const located = facility.latitude != null && facility.longitude != null

  const {
    data: nearby = [],
    isFetching,
    isError,
  } = useQuery<NearbyBedFacility[]>({
    queryKey: [...QK.bedsNearest, facility.id, category],
    queryFn: () =>
      api.get<NearbyBedFacility[]>('/api/lits/capacities/nearest/', {
        latitude: facility.latitude ?? undefined,
        longitude: facility.longitude ?? undefined,
        category,
        radius_km: 50,
        limit: 6,
      }),
    enabled: located,
  })
  const others = nearby.filter((f) => f.id !== facility.id).slice(0, 4)
  const queryClient = useQueryClient()
  const [sent, setSent] = useState<number | null>(null)
  const transfer = useMutation({
    mutationFn: (destinationId: number) =>
      api.post<Mission>('/api/ambulances/missions/transfer/', {
        destination_id: destinationId,
        category,
        priority: 'urgent',
      }),
    onSuccess: (_, destinationId) => {
      setSent(destinationId)
      queryClient.invalidateQueries({ queryKey: QK.missionsActive })
      queryClient.invalidateQueries({ queryKey: QK.bedsNearest })
    },
  })
  const vitalOptions = BED_CATEGORIES.filter((c) => c.vital)

  return (
    <Panel
      i={6}
      title="Solutions de transfert"
      subtitle="Lits libres à moins de 50 km, dans le service choisi"
      bodyClassName="pt-2"
    >
      <div className="px-5">
        <Segmented
          ariaLabel="Service"
          value={category}
          onChange={setChosen}
          options={vitalOptions.map((c) => ({ value: c.value, label: shortCategory(c.value, c.label) }))}
          className="w-full"
        />
        {transfer.error && (
          <p role="alert" className="mt-2 text-xs text-critical">
            {transfer.error instanceof Error ? transfer.error.message : 'Transfert impossible.'}
          </p>
        )}
      </div>
      {!located ? (
        <EmptyNote title="Position de l’établissement inconnue" hint="La recherche d’établissements proches est impossible." />
      ) : isError ? (
        <EmptyNote title="Recherche impossible pour le moment" hint="Réessayez dans quelques instants." />
      ) : others.length === 0 ? (
        <EmptyNote
          title={isFetching ? 'Recherche…' : 'Aucun établissement proche avec des lits libres'}
          hint={isFetching ? undefined : 'Élargissez la recherche depuis la page Lits.'}
        />
      ) : (
        <ol className="mt-2 divide-y divide-line">
          {others.map((f, index) => (
            <li
              key={f.id}
              className="reveal flex items-center justify-between gap-3 px-5 py-3 text-xs"
              style={{ '--i': index + 1 } as React.CSSProperties}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-fg">{f.name}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-muted">
                  <span className="num">{formatDistance(f.distance_km)}</span>
                  {f.phone_number && (
                    <a href={`tel:${f.phone_number}`} className="num inline-flex items-center gap-1 hover:text-fg">
                      <Phone className="h-3 w-3" aria-hidden="true" />
                      {f.phone_number}
                    </a>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <div className="text-right">
                  <p className="num text-lg font-semibold leading-tight text-fg">{f.available_beds}</p>
                  <p className="text-2xs text-muted">libres</p>
                </div>
                {!FULL_FEATURES ? null : sent === f.id ? (
                  <span className="text-2xs font-semibold text-ok">Transfert demandé</span>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    isLoading={transfer.isPending && transfer.variables === f.id}
                    disabled={transfer.isPending || sent !== null}
                    onClick={() => transfer.mutate(f.id)}
                    title="Réserve un lit là-bas et demande une ambulance à la régulation"
                  >
                    Transférer
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  )
}
