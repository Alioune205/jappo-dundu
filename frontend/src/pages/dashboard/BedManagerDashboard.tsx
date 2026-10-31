import React, { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  Ambulance as AmbulanceIcon,
  ArrowRight,
  BarChart3,
  BedDouble,
  Building2,
  Clock,
  MapPin,
  Minus,
  Phone,
  Plus,
  Route,
  Siren,
  TriangleAlert,
} from 'lucide-react'
import { Link } from 'react-router'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  ReferenceLine,
} from 'recharts'
import { api } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { StatCard } from '@/components/ui/StatCard'
import { RadialGauge } from '@/components/ui/RadialGauge'
import { PageHeader } from '@/components/ui/PageHeader'
import { MapView } from '@/components/map/MapView'
import { OccupancyBar } from '@/pages/beds/OccupancyBar'
import { computeBedStats, occupancyLevel } from '@/pages/beds/bedStats'
import { BED_CATEGORIES } from '@/lib/constants'
import { useNow } from '@/lib/useNow'
import { useThemeColors } from '@/lib/useThemeColors'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import { BED_EVENTS, MISSION_EVENTS } from '@/lib/realtimeEvents'
import { formatDistance, formatEta, formatNumber, formatPercent, formatRelative } from '@/lib/format'
import { QK } from '@/lib/queryKeys'
import { BilanSummary, DestinationStatusBadge } from '@/pages/ambulances/MissionClinical'
import { PrealertActions } from './PrealertActions'
import { TechnicalPanel } from './TechnicalPanel'
import { TensionBanner } from './TensionBanner'
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

const VITAL = new Set(BED_CATEGORIES.filter((c) => c.vital).map((c) => c.value))
const CATEGORY_ORDER = BED_CATEGORIES.map((c) => c.value)

/** Ordre d'affichage : services vitaux d'abord, puis l'ordre du référentiel. */
const byPriority = (a: BedCapacity, b: BedCapacity) =>
  Number(VITAL.has(b.category)) - Number(VITAL.has(a.category)) ||
  CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)

const MISSION_STEP: Record<string, number> = {
  pending: 0,
  assigned: 1,
  on_site: 2,
  transporting: 3,
}
const MISSION_STEPS = ['Créée', 'Affectée', 'Sur place', 'En route vers vous']

/**
 * Tableau de bord de l'administrateur des lits : son établissement d'abord
 * (services, admissions, visualisations capacitaires, patients en approche), puis sa région.
 */
export const BedManagerDashboard: React.FC<{ facility: FacilitySummary }> = ({ facility }) => {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const now = useNow()
  const colors = useThemeColors()

  // 1. Services de mon établissement
  const { data: capacities = [], isLoading } = useQuery<BedCapacity[]>({
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
  const saturatedVital = services.filter((c) => VITAL.has(c.category) && c.available_beds === 0)
  const incoming = missions
    .filter((m) => m.destination?.id === facility.id)
    .sort((a, b) => (MISSION_STEP[b.status] ?? 0) - (MISSION_STEP[a.status] ?? 0))

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
  const myRate = stats.globalRate / 100

  // Données du graphique comparatif par service
  const serviceChartData = useMemo(
    () =>
      services.map((c) => {
        const rate = c.total_beds > 0 ? Math.round((c.occupied_beds / c.total_beds) * 100) : 0
        const reg = regionByCategory.get(c.category)
        const regPct = reg?.occupancy_rate != null ? Math.round(reg.occupancy_rate * 100) : null
        return {
          service: c.category_display,
          rate,
          regionRate: regPct,
          available: c.available_beds,
          total: c.total_beds,
        }
      }),
    [services, regionByCategory]
  )

  const rateTone = myRate > 0.85 ? 'danger' : myRate > 0.7 ? 'warning' : 'success'
  const rateColor = (rate: number) => (rate > 85 ? colors.critical : rate > 70 ? colors.warning : colors.ok)
  const center = useMemo<[number, number] | undefined>(
    () =>
      facility.latitude != null && facility.longitude != null ? [facility.latitude, facility.longitude] : undefined,
    [facility.latitude, facility.longitude]
  )
  const inboundAmbulances = incoming.map((m) => m.ambulance).filter((a): a is Ambulance => a !== null)

  return (
    <div className="space-y-6">
      <PageHeader
        title={facility.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              {facility.city === facility.region_display
                ? facility.city
                : `${facility.city} · ${facility.region_display}`}
            </span>
            {lastUpdate && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                Mis à jour {formatRelative(lastUpdate.updated_at, now)}
                {lastUpdate.updated_by ? ` par ${lastUpdate.updated_by.full_name}` : ''}
              </span>
            )}
          </span>
        }
        actions={
          <Link
            to="/beds"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-brand px-4 text-sm font-semibold text-on-brand shadow-sm transition-all hover:bg-brand-strong"
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

      {/* Indicateurs de mon établissement (Bento KPI avec Carte Hero) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Lits libres"
          accent="blue"
          variant="hero"
          stagger={0}
          icon={<BedDouble className="h-5 w-5" />}
          value={formatNumber(stats.availableBeds)}
          unit={`/ ${formatNumber(stats.totalBeds)}`}
          description={`${services.length} services`}
          progress={{
            value: stats.occupiedBeds,
            max: stats.totalBeds || 1,
            tone: rateTone,
          }}
        />
        <StatCard
          title="Taux d’occupation"
          accent="yellow"
          stagger={1}
          icon={<Building2 className="h-5 w-5" />}
          value={formatPercent(myRate)}
          trend={regionRate === null ? undefined : `Région : ${formatPercent(regionRate)}`}
          trendTone={regionRate !== null && myRate > regionRate ? 'warning' : 'success'}
          description={
            regionRate !== null && myRate > regionRate ? 'Au-dessus de la région' : 'Dans la moyenne régionale'
          }
        />
        <StatCard
          title="Services en tension"
          accent="red"
          stagger={2}
          icon={<TriangleAlert className="h-5 w-5" />}
          value={tension.length}
          unit={`/ ${services.length}`}
          badge={
            stats.saturatedCount > 0
              ? `${stats.saturatedCount} saturé${stats.saturatedCount > 1 ? 's' : ''}`
              : undefined
          }
          badgeTone="danger"
          trend={tension.length > 0 ? 'Plus de 85 % occupés' : 'Aucune tension'}
          trendTone={tension.length > 0 ? 'danger' : 'success'}
        />
        <StatCard
          title="Patients en approche"
          accent="green"
          stagger={3}
          icon={<AmbulanceIcon className="h-5 w-5" />}
          value={incoming.length}
          unit={incoming.length > 1 ? 'ambulances' : 'ambulance'}
          trend={
            incoming.some((m) => m.status === 'transporting')
              ? `${incoming.filter((m) => m.status === 'transporting').length} en route vers vous`
              : 'Aucun transport en cours'
          }
          trendTone={incoming.some((m) => m.status === 'transporting') ? 'warning' : 'neutral'}
        />
      </div>

      {/* Section Data Visualization : Occupation par service + Jauge de capacité hospitalière */}
      {services.length > 0 && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <section
            className="panel dash-panel-in flex flex-col justify-between xl:col-span-7"
            style={{ '--stagger': 1 } as React.CSSProperties}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
                  <BarChart3 className="h-4 w-4 text-accent-blue" aria-hidden="true" />
                  Taux d’occupation par service
                </h2>
                <p className="text-2xs text-muted">
                  Comparaison temps réel des services de l’établissement (seuil critique à 85 %)
                </p>
              </div>
              <span className="text-2xs text-muted">Unité : % occupés</span>
            </div>

            <div className="h-56 w-full px-3 pb-2 pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serviceChartData} margin={{ top: 8, right: 12, left: -16, bottom: 20 }}>
                  <CartesianGrid stroke={colors.line} strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="service"
                    tick={{ fill: colors.muted }}
                    tickLine={false}
                    axisLine={{ stroke: colors.line }}
                    fontSize={11}
                    interval={0}
                    angle={-12}
                    textAnchor="end"
                  />
                  <YAxis
                    tick={{ fill: colors.muted }}
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    domain={[0, 100]}
                    unit="%"
                  />
                  <Tooltip
                    cursor={{ fill: colors.raised }}
                    contentStyle={{
                      backgroundColor: colors.surface,
                      borderColor: colors.lineStrong,
                      borderRadius: 10,
                      fontSize: 12,
                      color: colors.fg,
                      boxShadow: 'var(--shadow-raised)',
                    }}
                    formatter={(val) => [`${val ?? 0} %`, 'Occupation']}
                  />
                  <ReferenceLine y={85} stroke={colors.critical} strokeDasharray="4 4" strokeOpacity={0.65} />
                  <Bar dataKey="rate" radius={[8, 8, 0, 0]} maxBarSize={36}>
                    {serviceChartData.map((entry) => (
                      <Cell key={entry.service} fill={rateColor(entry.rate)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-raised/35 px-5 py-2.5 text-2xs text-muted">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-ok" /> &lt; 70 %
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-warning" /> 70–85 %
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-critical" /> &gt; 85 %
                </span>
              </div>
              {expectedDischargesTotal > 0 && (
                <span className="num font-medium text-fg">{`${expectedDischargesTotal} sortie(s) prévue(s)`}</span>
              )}
            </div>
          </section>

          <section
            className="panel dash-panel-in flex flex-col justify-between xl:col-span-5"
            style={{ '--stagger': 2 } as React.CSSProperties}
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
                  <Activity className="h-4 w-4 text-accent-green" aria-hidden="true" />
                  Équilibre capacitaire
                </h2>
                <p className="text-2xs text-muted">Répartition des lits de l’établissement</p>
              </div>
              <Badge tone={rateTone === 'danger' ? 'danger' : rateTone === 'warning' ? 'warning' : 'success'} size="sm">
                {myRate > 0.85 ? 'Sous tension' : myRate > 0.7 ? 'Vigilance' : 'Nominal'}
              </Badge>
            </div>

            <div className="flex flex-1 flex-col justify-center p-4">
              <RadialGauge
                mode="semi"
                centerValue={formatPercent(myRate)}
                centerLabel="Occupation globale"
                segments={[
                  { label: 'Occupés', value: stats.occupiedBeds, color: rateColor(Math.round(myRate * 100)), unit: 'lits' },
                  ...(reservedTotal > 0
                    ? [{ label: 'Réservés', value: reservedTotal, color: colors.info, unit: 'lits' }]
                    : []),
                  { label: 'Libres', value: stats.availableBeds, color: colors.ok, unit: 'lits' },
                ]}
              />
            </div>

            <div className="flex items-center justify-between border-t border-line bg-raised/35 px-5 py-2.5 text-2xs text-muted">
              <span>Capacité totale déclarée</span>
              <span className="num font-semibold text-fg">{`${stats.totalBeds} lits hospitaliers`}</span>
            </div>
          </section>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.6fr_1fr]">
        {/* Mes services : admissions et sorties en un clic */}
        <section className="panel dash-panel-in" style={{ '--stagger': 3 } as React.CSSProperties}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
            <div>
              <h2 className="text-sm font-semibold text-fg">Mes services</h2>
              <p className="text-xs text-muted">Admettre un patient (+) ou enregistrer sa sortie (−). Réservations : « Mes lits ».</p>
            </div>
            <Link to="/beds" className="flex items-center gap-1 text-xs font-medium text-muted hover:text-fg">
              Mes lits <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {actionError && (
            <div className="px-5 pt-4">
              <Alert tone="danger" onClose={() => (admit.error ? admit.reset() : discharge.reset())}>
                {actionError instanceof Error ? actionError.message : 'Action impossible.'}
              </Alert>
            </div>
          )}
          {isLoading ? (
            <p className="px-5 py-10 text-center text-xs text-muted">Chargement des services…</p>
          ) : services.length === 0 ? (
            <p className="px-5 py-10 text-center text-xs text-muted">
              Aucun service déclaré.{' '}
              <Link to="/beds" className="font-semibold text-brand">
                Déclarer une capacité
              </Link>
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {services.map((cap) => {
                const region = regionByCategory.get(cap.category)
                return (
                  <li
                    key={cap.id}
                    className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-5 py-3.5 transition-colors hover:bg-raised/35 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto]"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-fg">{cap.category_display}</span>
                        {VITAL.has(cap.category) && (
                          <Badge tone="brand" size="sm" dot={false}>
                            Vital
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        <span className="num font-semibold text-fg">{cap.available_beds}</span> libre
                        {cap.available_beds > 1 ? 's' : ''} sur <span className="num">{cap.total_beds}</span>
                        {cap.reserved_beds > 0 && (
                          <span className="font-medium text-info">
                            {' · '}
                            {cap.reserved_beds} réservé{cap.reserved_beds > 1 ? 's' : ''}
                          </span>
                        )}
                        {' · '}
                        {formatRelative(cap.updated_at, now)}
                      </p>
                    </div>
                    <div className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto">
                      <OccupancyBar cap={cap} />
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
                        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-line-strong text-fg transition-all hover:scale-105 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => admit.mutate(cap.id)}
                        disabled={busy || cap.available_beds === 0}
                        aria-label={`Admettre un patient : ${cap.category_display}`}
                        title="Admettre un patient"
                        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-brand text-on-brand transition-all hover:scale-105 hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <div className="space-y-6">
          {/* Patients en approche */}
          <section className="panel dash-panel-in" style={{ '--stagger': 4 } as React.CSSProperties}>
            <div className="border-b border-line px-5 py-3.5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
                <Siren className="h-4 w-4 text-critical" aria-hidden="true" />
                Patients en approche
                <span className="num font-normal text-muted">{incoming.length}</span>
              </h2>
              <p className="text-xs text-muted">Missions SAMU dont votre établissement est la destination.</p>
            </div>
            {incoming.length === 0 ? (
              <p className="px-5 py-10 text-center text-xs text-muted">Aucune ambulance n’est en route vers vous.</p>
            ) : (
              <ul className="divide-y divide-line">
                {incoming.map((m) => {
                  const step = MISSION_STEP[m.status] ?? 0
                  return (
                    <li key={m.id} className="space-y-2 px-5 py-3.5 transition-colors hover:bg-raised/35">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-fg">
                            {m.description || `Mission n° ${m.id}`}
                          </p>
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
                      <ol className="grid grid-cols-4 gap-1" aria-label={`Étape : ${MISSION_STEPS[step]}`}>
                        {MISSION_STEPS.map((label, i) => (
                          <li
                            key={label}
                            className={`h-1.5 rounded-full transition-colors ${i <= step ? 'bg-accent-green' : 'bg-raised'}`}
                          />
                        ))}
                      </ol>
                      <p className="flex justify-between text-2xs text-muted">
                        <span className="font-semibold text-fg">{MISSION_STEPS[step]}</span>
                        <span>
                          {m.status === 'transporting' && m.eta_at
                            ? `Arrivée ${formatEta(m.eta_at, now)}`
                            : `Créée ${formatRelative(m.created_at, now)}`}
                        </span>
                      </p>
                      {m.destination_status && m.destination_status !== 'pending' && (
                        <DestinationStatusBadge mission={m} />
                      )}
                      <PrealertActions mission={m} />
                      {FULL_FEATURES && <BilanSummary mission={m} now={now} />}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <TransferPanel facility={facility} services={services} />

          {FULL_FEATURES && <TechnicalPanel facility={facility} />}
        </div>
      </div>

      <section className="panel dash-panel-in overflow-hidden" style={{ '--stagger': 5 } as React.CSSProperties}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="text-sm font-semibold text-fg">Autour de {facility.name}</h2>
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted" aria-label="Légende">
            <li className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-info" /> Établissements
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-warning" /> Ambulance vers vous
            </li>
          </ul>
        </div>
        <div className="p-2">
          <MapView
            facilities={[facility]}
            ambulances={inboundAmbulances}
            missions={incoming}
            center={center}
            zoom={13}
            height="340px"
          />
        </div>
      </section>

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
    .filter((c) => VITAL.has(c.category))
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

  return (
    <section className="panel dash-panel-in" style={{ '--stagger': 4 } as React.CSSProperties}>
      <div className="border-b border-line px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Route className="h-4 w-4 text-muted" aria-hidden="true" />
          Solutions de transfert
        </h2>
        <p className="text-xs text-muted">
          Établissements proches avec des lits libres (50 km). « Transférer » réserve le lit et demande l’ambulance.
        </p>
        {transfer.error && (
          <p role="alert" className="mt-1 text-xs text-critical">
            {transfer.error instanceof Error ? transfer.error.message : 'Transfert impossible.'}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 px-5 pt-3" role="group" aria-label="Service">
        {BED_CATEGORIES.filter((c) => c.vital).map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => setChosen(c.value)}
            aria-pressed={category === c.value}
            className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              category === c.value ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted hover:text-fg'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      {!located ? (
        <p className="px-5 py-8 text-xs text-muted">Position de l’établissement inconnue : recherche impossible.</p>
      ) : isError ? (
        <p className="px-5 py-8 text-xs text-critical">Recherche impossible pour le moment.</p>
      ) : others.length === 0 ? (
        <p className="px-5 py-8 text-xs text-muted">
          {isFetching ? 'Recherche…' : 'Aucun établissement proche avec des lits libres dans ce service.'}
        </p>
      ) : (
        <ol className="mt-2 divide-y divide-line">
          {others.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 px-5 py-3 text-xs transition-colors hover:bg-raised/35">
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
                  <p className="num text-base font-semibold leading-tight text-ok">{f.available_beds}</p>
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
    </section>
  )
}
