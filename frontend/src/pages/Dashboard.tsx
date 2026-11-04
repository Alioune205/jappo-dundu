import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Ambulance as AmbulanceIcon, ArrowRight, BedDouble, BrainCircuit, Droplets } from 'lucide-react'
import { Link } from 'react-router'
import { api, fetchAllPages } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { canManage, canOpen, canView } from '@/lib/access'
import { Badge } from '@/components/ui/Badge'
import { MapView } from '@/components/map/MapView'
import { MetricTile } from '@/components/dash/MetricTile'
import { EmptyNote, Legend, LegendItem, Panel } from '@/components/dash/Panel'
import { ArcGauge } from '@/components/dash/ArcGauge'
import { CapsuleChart, type CapsuleDatum } from '@/components/dash/CapsuleChart'
import { StackBars, type StackRow } from '@/components/dash/StackBars'
import { Segmented } from '@/components/dash/Segmented'
import type { PriorityItem } from '@/components/dash/PriorityFeed'
import { OCCUPANCY_CRITICAL, SIGNAL_FILL, occupancySignal, type Signal } from '@/components/dash/tones'
import { useNow } from '@/lib/useNow'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import { useAmbulancePositions } from '@/lib/useAmbulancePositions'
import { BED_EVENTS, BLOOD_REQUEST_EVENTS, MISSION_EVENTS, RealtimeEvent } from '@/lib/realtimeEvents'
import { formatNumber, formatPercent, formatRelative } from '@/lib/format'
import type {
  BloodRequest,
  BedCategory,
  BedSummaryRow,
  Ambulance,
  Mission,
  PredictionSummaryRow,
  FacilitySummary,
  BedCapacity,
} from '@/types/api'
import { QK } from '@/lib/queryKeys'
import { AmbulanceManagerDashboard } from './dashboard/AmbulanceManagerDashboard'
import { BedManagerDashboard } from './dashboard/BedManagerDashboard'
import { BloodManagerDashboard } from './dashboard/BloodManagerDashboard'
import { KpiPanel } from './dashboard/KpiPanel'
import { VITAL_CATEGORIES, groupLabel, minutesSince, plural, shortCategory } from './dashboard/shared'
import type { Role } from '@/types/api'
import { FULL_FEATURES } from '@/lib/features'
import { HeroBanner } from './dashboard/network/HeroBanner'
import { ActivityPanel } from './dashboard/network/ActivityPanel'
import { CoveragePanel } from './dashboard/network/CoveragePanel'
import { FacilitiesPanel, RecentActivityPanel } from './dashboard/network/RecentPanels'
import { AlertsCard, AssistantCard, DriveCard, SystemStatusCard } from './dashboard/network/SideCards'
import { useActivitySeries, type ActivityPeriod } from './dashboard/network/useActivitySeries'

/** Rôles qui ont une vue dédiée, centrée sur leur établissement. */
const DOMAIN_DASHBOARDS: Partial<Record<Role, React.FC<{ facility: FacilitySummary }>>> = {
  bed_manager: BedManagerDashboard,
  blood_manager: BloodManagerDashboard,
  ambulance_manager: AmbulanceManagerDashboard,
}

/** Colonnes de la rangée d'indicateurs selon le nombre de tuiles visibles. */
const TILE_COLUMNS: Record<number, string> = {
  1: 'sm:grid-cols-1',
  2: '',
  3: 'xl:grid-cols-3',
  // Tuiles compactes en ligne : quatre de front seulement sur très grand écran.
  4: 'min-[1760px]:grid-cols-4',
}

/** Une mission sans ambulance au-delà de ce délai devient critique. */
const PENDING_ALERT_MINUTES = 5

type LayerKey = 'hospitals' | 'bloodBanks' | 'ambulances' | 'missions'

const LAYERS: { key: LayerKey; label: string; swatch: string }[] = [
  { key: 'hospitals', label: 'Hôpitaux', swatch: 'bg-info' },
  { key: 'bloodBanks', label: 'Banques de sang', swatch: 'bg-critical' },
  { key: 'ambulances', label: 'Ambulances', swatch: 'bg-ok' },
  { key: 'missions', label: 'Missions', swatch: 'bg-viz-warn' },
]

export const Dashboard: React.FC = () => {
  const { user, roles } = useAuth()
  // Un administrateur d'un seul domaine, rattaché à un établissement, a sa propre
  // vue ; l'administrateur général et les comptes multi-domaines gardent la vue réseau.
  const dedicated = roles.filter((role) => role in DOMAIN_DASHBOARDS)
  const DomainDashboard =
    dedicated.length === 1 && !roles.includes('admin') && !roles.includes('hospital_staff')
      ? DOMAIN_DASHBOARDS[dedicated[0]]
      : undefined
  if (user?.facility && DomainDashboard) return <DomainDashboard facility={user.facility} />
  return <NetworkDashboard />
}

interface CategoryRow {
  category: BedCategory
  label: string
  total: number
  occupied: number
  reserved: number
  available: number
}

/** Vue réseau : administrateur général et rôles multi-domaines. */
const NetworkDashboard: React.FC = () => {
  const { user, roles, isAdmin } = useAuth()
  const greetingName = user?.full_name || user?.username || 'à vous'
  const now = useNow(15_000)

  // Chaque administrateur ne charge que les domaines de son rôle : le serveur
  // refuserait les autres (403).
  const seeBlood = canView(roles, 'blood')
  const seeBeds = canView(roles, 'beds')
  const seeFleet = canManage(roles, 'ambulances')

  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    hospitals: true,
    bloodBanks: true,
    ambulances: true,
    missions: true,
  })
  const [bedChartMode, setBedChartMode] = useState<'rate' | 'volume'>('rate')

  // Salle de crise : le tableau de bord en plein écran (écran mural).
  const rootRef = useRef<HTMLDivElement>(null)
  const [crisisMode, setCrisisMode] = useState(false)
  useEffect(() => {
    const sync = () => setCrisisMode(document.fullscreenElement === rootRef.current)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])
  const toggleCrisisMode = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined)
    else rootRef.current?.requestFullscreen?.().catch(() => undefined)
  }

  // 1. Demandes de sang ouvertes
  const bloodQuery = useQuery({
    queryKey: [...QK.bloodRequests, 'open'],
    queryFn: async () => {
      const res = await api.get<{ results: BloodRequest[] }>('/api/sang/requests/', {
        status: 'open',
      })
      return res.results || []
    },
    enabled: seeBlood,
  })
  const bloodRequests = useMemo(() => bloodQuery.data ?? [], [bloodQuery.data])

  // 2. Synthèse des lits
  const bedsQuery = useQuery<BedSummaryRow[]>({
    queryKey: QK.bedsSummary,
    queryFn: () => api.get<BedSummaryRow[]>('/api/lits/capacities/summary/'),
    enabled: seeBeds,
  })
  const bedSummary = useMemo(() => bedsQuery.data ?? [], [bedsQuery.data])

  // 3. Flotte d'ambulances
  const fleetQuery = useQuery<Ambulance[]>({
    queryKey: QK.ambulancesList,
    queryFn: async () => {
      const res = await api.get<{ results: Ambulance[] }>('/api/ambulances/vehicles/')
      return res.results || []
    },
    enabled: seeFleet,
  })
  const ambulances = fleetQuery.data ?? []

  // 4. Missions actives
  const missionsQuery = useQuery<Mission[]>({
    queryKey: QK.missionsActive,
    queryFn: async () => {
      const res = await api.get<{ results: Mission[] }>('/api/ambulances/missions/', {
        active: true,
      })
      return res.results || []
    },
    enabled: seeFleet,
  })
  const activeMissions = useMemo(() => missionsQuery.data ?? [], [missionsQuery.data])

  // 5. Synthèse des risques ML (Massogui Diop)
  const predictionsQuery = useQuery<PredictionSummaryRow[]>({
    queryKey: QK.predictionsSummary,
    queryFn: () => api.get<PredictionSummaryRow[]>('/api/ml/predictions/summary/'),
    enabled: seeBlood,
  })
  const predictionSummary = useMemo(() => predictionsQuery.data ?? [], [predictionsQuery.data])

  // 6. Établissements (carte opérationnelle et couverture nationale)
  const facilitiesQuery = useQuery<FacilitySummary[]>({
    queryKey: QK.facilitiesMap,
    queryFn: async () => {
      const res = await api.get<{ results: FacilitySummary[] }>('/api/facilities/')
      return res.results || []
    },
  })
  const facilities = useMemo(() => facilitiesQuery.data ?? [], [facilitiesQuery.data])

  // 7. Capacités par service et par établissement (journal, établissements principaux)
  const capacitiesQuery = useQuery<BedCapacity[]>({
    queryKey: [...QK.bedCapacities, 'network'],
    queryFn: () => fetchAllPages<BedCapacity>('/api/lits/capacities/', {}, { maxPages: 6 }),
    enabled: seeBeds,
  })
  const capacities = useMemo(() => capacitiesQuery.data ?? [], [capacitiesQuery.data])

  // 8. Activité quotidienne (demandes, dons, missions) comptée sur les enregistrements réels
  const [activityPeriod, setActivityPeriod] = useState<ActivityPeriod>(7)
  const activityQuery = useActivitySeries(activityPeriod, now, { blood: seeBlood, fleet: seeFleet })
  /** Série des 7 derniers jours pour une tuile, seulement si elle a été chargée. */
  const activitySpark = (key: 'requests', label: string) => {
    const data = activityQuery.data
    if (!data || !data.available[key]) return undefined
    return { values: data.days.slice(-7).map((d) => d[key]), label }
  }

  // Temps réel : rechargements regroupés par fenêtre d'une seconde, et
  // positions GPS appliquées directement au cache (aucune requête).
  useRealtimeRefresh([
    { events: BLOOD_REQUEST_EVENTS, queryKeys: [QK.bloodRequests] },
    { events: BED_EVENTS, queryKeys: [QK.bedsSummary, QK.bedCapacities] },
    { events: MISSION_EVENTS, queryKeys: [QK.missionsActive, QK.ambulancesList] },
    { events: [RealtimeEvent.ambulanceStatus], queryKeys: [QK.ambulancesList] },
    { events: [RealtimeEvent.predictionUpdate], queryKeys: [QK.predictionsSummary] },
  ])
  useAmbulancePositions(QK.ambulancesList)

  // ------------------------------------------------------------- Lits
  const totalAvailableBeds = bedSummary.reduce((acc, row) => acc + row.available_beds, 0)
  const totalReservedBeds = bedSummary.reduce((acc, row) => acc + (row.reserved_beds ?? 0), 0)
  const totalOccupiedBeds = bedSummary.reduce((acc, row) => acc + row.occupied_beds, 0)
  const totalBeds = bedSummary.reduce((acc, row) => acc + row.total_beds, 0)
  const globalOccupancy = totalBeds > 0 ? (totalBeds - totalAvailableBeds) / totalBeds : 0
  const occupancy = occupancySignal(totalBeds > 0 ? globalOccupancy : null)

  const byCategory = useMemo(() => {
    const map = new Map<BedCategory, CategoryRow>()
    for (const row of bedSummary) {
      const entry = map.get(row.category) ?? {
        category: row.category,
        label: shortCategory(row.category, row.category_display),
        total: 0,
        occupied: 0,
        reserved: 0,
        available: 0,
      }
      entry.total += row.total_beds
      entry.occupied += row.occupied_beds
      entry.reserved += row.reserved_beds ?? 0
      entry.available += row.available_beds
      map.set(row.category, entry)
    }
    return [...map.values()].sort((a, b) => b.occupied / (b.total || 1) - a.occupied / (a.total || 1))
  }, [bedSummary])

  const maxCategoryTotal = Math.max(1, ...byCategory.map((c) => c.total))
  const categoryCapsules: CapsuleDatum[] = byCategory.map((c) => {
    const rate = c.total > 0 ? c.occupied / c.total : 0
    return {
      key: c.category,
      label: c.label,
      value: c.occupied,
      capacity: c.total,
      heightRatio: bedChartMode === 'volume' ? Math.max(0.12, c.total / maxCategoryTotal) : 1,
      signal: occupancySignal(rate),
      valueText: bedChartMode === 'rate' ? formatPercent(rate) : `${formatNumber(c.available)} libres`,
      details: [
        `${formatNumber(c.occupied)} occupés sur ${formatNumber(c.total)}`,
        `${formatNumber(c.available)} libres${c.reserved ? ` · ${formatNumber(c.reserved)} réservés` : ''}`,
      ],
    }
  })

  const regionRows: StackRow[] = useMemo(() => {
    const map = new Map<string, { label: string; total: number; occupied: number; reserved: number; available: number }>()
    for (const row of bedSummary) {
      const label = row.region_display || row.region
      const entry = map.get(label) ?? { label, total: 0, occupied: 0, reserved: 0, available: 0 }
      entry.total += row.total_beds
      entry.occupied += row.occupied_beds
      entry.reserved += row.reserved_beds ?? 0
      entry.available += row.available_beds
      map.set(label, entry)
    }
    return [...map.values()]
      .filter((r) => r.total > 0)
      .sort((a, b) => b.occupied / b.total - a.occupied / a.total)
      .slice(0, 6)
      .map((r, index) => {
        const rate = r.occupied / r.total
        return {
          key: r.label,
          label: r.label,
          emphasis: index === 0 && rate > OCCUPANCY_CRITICAL,
          valueText: `${formatPercent(rate)} · ${formatNumber(r.available)} libres`,
          parts: [
            { label: 'Occupés', value: r.occupied, className: SIGNAL_FILL[occupancySignal(rate)] },
            { label: 'Réservés', value: r.reserved, className: 'bg-info' },
            { label: 'Libres', value: r.available, rest: true },
          ],
        }
      })
  }, [bedSummary])

  // ------------------------------------------------------- Flotte, sang
  const availableAmbulances = ambulances.filter((a) => a.status === 'available').length
  const criticalPredictions = predictionSummary.reduce((acc, p) => acc + p.critical_count, 0)
  const criticalBlood = bloodRequests.filter((r) => r.urgency === 'critical')
  const fleetSignal: Signal = ambulances.length === 0 ? 'neutral' : availableAmbulances <= 2 ? 'warning' : 'ok'

  const riskRows: StackRow[] = [...predictionSummary]
    .filter((p) => p.total_predictions > 0 || p.critical_count + p.warning_count + p.normal_count > 0)
    .sort((a, b) => b.critical_count - a.critical_count || b.warning_count - a.warning_count)
    .slice(0, 7)
    .map((p) => ({
      key: p.region,
      label: p.region_display || p.region,
      emphasis: p.critical_count > 0,
      valueText:
        p.critical_count > 0
          ? plural(p.critical_count, 'critique')
          : p.warning_count > 0
            ? `${formatNumber(p.warning_count)} vigilance`
            : 'stable',
      parts: [
        { label: 'Critique', value: p.critical_count, className: 'bg-viz-crit' },
        { label: 'Vigilance', value: p.warning_count, className: 'bg-viz-warn' },
        { label: 'Nominal', value: p.normal_count, className: 'bg-viz-base-soft' },
      ],
    }))

  // --------------------------------------------- À traiter maintenant
  const priorities = useMemo(() => {
    const items: PriorityItem[] = []
    for (const r of bloodRequests.filter((req) => req.urgency === 'critical')) {
      items.push({
        id: `blood-${r.id}`,
        severity: 'critical',
        domain: 'Sang · urgence vitale',
        title: `${groupLabel(r.blood_group)} · ${plural(r.units_remaining, 'poche manquante', 'poches manquantes')}`,
        meta: `${r.facility?.name ?? 'Établissement'} · demandée ${formatRelative(r.created_at, now)}`,
        to: '/blood',
      })
    }
    for (const m of activeMissions.filter((mission) => mission.status === 'pending')) {
      const waited = minutesSince(m.created_at, now) ?? 0
      items.push({
        id: `mission-${m.id}`,
        severity: m.priority === 'critical' || waited > PENDING_ALERT_MINUTES ? 'critical' : 'warning',
        domain: 'SAMU · sans ambulance',
        title: m.description || `Mission n° ${m.id}`,
        meta: `${m.pickup_address || m.region_display} · créée ${formatRelative(m.created_at, now)}`,
        to: '/ambulances',
      })
    }
    for (const row of bedSummary) {
      const rate = row.total_beds > 0 ? row.occupied_beds / row.total_beds : 0
      const saturatedVital = VITAL_CATEGORIES.has(row.category) && row.total_beds > 0 && row.available_beds === 0
      if (!saturatedVital && rate <= OCCUPANCY_CRITICAL) continue
      items.push({
        id: `beds-${row.region}-${row.category}`,
        severity: saturatedVital ? 'critical' : 'warning',
        domain: saturatedVital ? 'Lits · service vital saturé' : 'Lits · tension',
        title: `${shortCategory(row.category, row.category_display)} · ${row.region_display || row.region}`,
        meta: `${formatNumber(row.available_beds)} libre${row.available_beds > 1 ? 's' : ''} sur ${formatNumber(row.total_beds)} · ${formatPercent(rate)} occupés`,
        to: '/beds',
      })
    }
    for (const p of predictionSummary.filter((row) => row.critical_count > 0)) {
      items.push({
        id: `risk-${p.region}`,
        severity: 'warning',
        domain: 'Prévision · 7 jours',
        title: `Pénurie prévue · ${p.region_display || p.region}`,
        meta: `${plural(p.critical_count, 'série critique', 'séries critiques')} (centre × groupe)`,
        to: '/ml',
      })
    }
    return items.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1))
  }, [bloodRequests, activeMissions, bedSummary, predictionSummary, now])

  const lastUpdate = Math.max(
    bloodQuery.dataUpdatedAt,
    bedsQuery.dataUpdatedAt,
    fleetQuery.dataUpdatedAt,
    missionsQuery.dataUpdatedAt,
    predictionsQuery.dataUpdatedAt
  )
  const visibleTiles = [seeBeds, seeBlood, seeFleet, seeBlood].filter(Boolean).length

  return (
    <div ref={rootRef} className={`space-y-6 ${crisisMode ? 'overflow-y-auto bg-canvas p-6' : ''}`}>
      <HeroBanner
        name={greetingName}
        title={user?.facility ? user.facility.name : 'Situation du réseau'}
        status={
          <span>
            {user?.facility ? user.facility.city : 'Supervision nationale'} ·{' '}
            {lastUpdate > 0 ? `actualisé ${formatRelative(new Date(lastUpdate), now)}` : 'chargement des données'}
          </span>
        }
        reportHref={FULL_FEATURES ? '/rapport' : undefined}
        crisisMode={crisisMode}
        onToggleCrisis={toggleCrisisMode}
      />

      {/* Indicateurs compacts, chacun mène à son module. */}
      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${TILE_COLUMNS[visibleTiles] ?? 'min-[1760px]:grid-cols-4'}`}>
        {seeBeds && (
          <MetricTile
            i={0}
            layout="row"
            icon={BedDouble}
            accent="blue"
            to="/beds"
            label="Lits disponibles"
            loading={bedsQuery.isPending}
            value={totalAvailableBeds}
            unit={`/ ${formatNumber(totalBeds)}`}
            meter={{ value: totalOccupiedBeds + totalReservedBeds, max: totalBeds, signal: occupancy, label: 'Lits occupés ou réservés' }}
            status={{ text: `${formatPercent(globalOccupancy)} occupés`, signal: occupancy }}
            hint="Réseau hospitalier"
          />
        )}
        {seeBlood && (
          <MetricTile
            i={1}
            layout="row"
            icon={Droplets}
            accent="red"
            to="/blood"
            label="Demandes de sang"
            spark={activitySpark('requests', 'Demandes de sang créées par jour, 7 derniers jours')}
            loading={bloodQuery.isPending}
            value={bloodRequests.length}
            unit="ouvertes"
            badge={criticalBlood.length > 0 ? { label: plural(criticalBlood.length, 'vitale'), signal: 'critical' } : undefined}
            status={
              criticalBlood.length > 0
                ? { text: 'Urgence vitale en cours', signal: 'critical' }
                : { text: 'Aucune urgence vitale', signal: 'ok' }
            }
            hint="CNTS et régions"
          />
        )}
        {seeFleet && (
          <MetricTile
            i={2}
            layout="row"
            icon={AmbulanceIcon}
            accent="green"
            to="/ambulances"
            label="Ambulances disponibles"
            loading={fleetQuery.isPending}
            value={availableAmbulances}
            unit={`/ ${ambulances.length}`}
            meter={{
              value: availableAmbulances,
              max: ambulances.length,
              signal: fleetSignal,
              label: 'Part des ambulances disponibles',
            }}
            status={{
              text: `${plural(activeMissions.length, 'mission')} en cours`,
              signal: activeMissions.some((m) => m.status === 'pending') ? 'warning' : 'neutral',
            }}
            hint="Flotte SAMU"
          />
        )}
        {seeBlood && (
          <MetricTile
            i={3}
            layout="row"
            icon={BrainCircuit}
            accent="violet"
            to="/ml"
            label="Risques de pénurie"
            loading={predictionsQuery.isPending}
            value={criticalPredictions}
            unit="critiques à 7 j"
            status={
              criticalPredictions > 0
                ? { text: 'Action requise', signal: 'critical' }
                : { text: 'Aucun risque critique', signal: 'ok' }
            }
            hint="Modèle quantile CQR"
          />
        )}
      </div>

      {/* Tendance et territoire à gauche, ce qui demande une action à droite. */}
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-12">
        <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] xl:col-span-9">
          {(seeBlood || seeFleet) && (
            <ActivityPanel
              i={2}
              period={activityPeriod}
              onPeriodChange={setActivityPeriod}
              data={activityQuery.data}
              loading={activityQuery.isPending}
            />
          )}
          <CoveragePanel i={3} facilities={facilities} loading={facilitiesQuery.isPending} />
          <RecentActivityPanel
            i={4}
            requests={bloodRequests}
            missions={activeMissions}
            capacities={capacities}
            now={now}
            loading={bloodQuery.isLoading || missionsQuery.isLoading || capacitiesQuery.isLoading}
          />
          {seeBeds && (
            <FacilitiesPanel
              i={5}
              capacities={capacities}
              loading={capacitiesQuery.isPending}
              canOpenFacilities={canOpen(roles, '/facilities')}
            />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-6 xl:col-span-3">
          <AlertsCard i={3} items={priorities} />
          {FULL_FEATURES && seeBlood ? <DriveCard i={4} /> : <AssistantCard i={4} />}
          {isAdmin && <SystemStatusCard i={5} />}
        </div>
      </div>

      {/* Détail opérationnel : positions en direct et capacité hospitalière. */}
      <div className={`grid grid-cols-1 items-stretch gap-6 ${seeBeds ? 'xl:grid-cols-12' : ''}`}>
      <Panel
        i={4}
        className={seeBeds ? 'xl:col-span-8' : ''}
        eyebrow="Géographie"
        title="Carte opérationnelle"
        subtitle="Structures, véhicules SAMU et interventions · positions en direct"
        actions={
          // Légende = calques : chaque entrée s'affiche ou se masque.
          <ul className="flex flex-wrap items-center gap-1.5 text-xs" aria-label="Calques de la carte">
            {LAYERS.map((layer) => (
              <li key={layer.key}>
                <button
                  type="button"
                  aria-pressed={layers[layer.key]}
                  onClick={() => setLayers((current) => ({ ...current, [layer.key]: !current[layer.key] }))}
                  className={`flex h-8 cursor-pointer items-center gap-2 rounded-full border px-3 font-medium transition-colors ${
                    layers[layer.key]
                      ? 'border-transparent bg-sunken text-fg hover:bg-track'
                      : 'border-dashed border-line-strong text-subtle hover:text-muted'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`h-2 w-2 rounded-full transition-opacity ${layer.swatch} ${layers[layer.key] ? '' : 'opacity-30'}`}
                  />
                  {layer.label}
                </button>
              </li>
            ))}
          </ul>
        }
        bodyClassName="p-2 pt-3"
      >
        <div className="overflow-hidden rounded-2xl">
          <MapView
            facilities={facilities.filter((f) =>
              f.facility_type === 'blood_bank'
                ? layers.bloodBanks
                : f.facility_type === 'ambulance_service'
                  ? true
                  : layers.hospitals
            )}
            ambulances={layers.ambulances ? ambulances : []}
            missions={layers.missions ? activeMissions : []}
            height={crisisMode ? '62vh' : '440px'}
          />
        </div>
      </Panel>

        {seeBeds && (
          <Panel
            i={3}
            className="h-full xl:col-span-4"
            eyebrow="Capacité"
            title="Tension hospitalière"
            subtitle="Lits déclarés du réseau · en direct"
            actions={
              <Badge tone={occupancy === 'critical' ? 'danger' : occupancy === 'warning' ? 'warning' : 'success'} size="sm">
                {occupancy === 'critical' ? 'Tension forte' : occupancy === 'warning' ? 'Vigilance' : 'Équilibre'}
              </Badge>
            }
            bodyClassName="px-5 pb-5 pt-4"
          >
            {totalBeds === 0 ? (
              <EmptyNote title="Aucune capacité déclarée" hint="Les établissements n’ont pas encore publié leurs lits." />
            ) : (
              <>
                <ArcGauge
                  size={300}
                  centerValue={formatPercent(globalOccupancy)}
                  centerLabel="Taux d’occupation du réseau"
                  segments={[
                    {
                      label: 'Occupés',
                      value: totalOccupiedBeds,
                      color: `var(--viz-${occupancy === 'critical' ? 'crit' : occupancy === 'warning' ? 'warn' : 'base'})`,
                      unit: 'lits',
                    },
                    ...(totalReservedBeds > 0
                      ? [{ label: 'Réservés', value: totalReservedBeds, color: 'var(--info)', unit: 'lits' }]
                      : []),
                    { label: 'Libres', value: totalAvailableBeds, rest: true, unit: 'lits' },
                  ]}
                />
                {regionRows.length > 1 && (
                  <div className="mt-6 rounded-2xl bg-raised p-4">
                    <p className="mb-3 text-xs font-medium text-muted">Régions les plus tendues</p>
                    <StackBars rows={regionRows} ariaLabel="Occupation des lits par région" />
                  </div>
                )}
              </>
            )}
          </Panel>
        )}
      </div>

      {(seeBeds || seeBlood) && (
        <div className={`grid grid-cols-1 gap-6 ${seeBeds && seeBlood ? 'xl:grid-cols-12' : ''}`}>
          {seeBeds && (
            <Panel
              i={6}
              className={seeBlood ? 'xl:col-span-7' : ''}
              eyebrow="Lits"
              title="Occupation par spécialité"
              subtitle={
                bedChartMode === 'rate'
                  ? 'Part des lits occupés · seuil critique à 85 %'
                  : 'Hauteur = capacité du service · remplissage = lits occupés'
              }
              actions={
                <Segmented
                  ariaLabel="Mode du graphique"
                  value={bedChartMode}
                  onChange={setBedChartMode}
                  options={[
                    { value: 'rate', label: 'Taux' },
                    { value: 'volume', label: 'Volumes' },
                  ]}
                />
              }
              footer={
                <>
                  <Legend>
                    <LegendItem className={SIGNAL_FILL.ok}>Nominal (≤ 70 %)</LegendItem>
                    <LegendItem className={SIGNAL_FILL.warning}>Vigilance (70–85 %)</LegendItem>
                    <LegendItem className={SIGNAL_FILL.critical}>Critique (&gt; 85 %)</LegendItem>
                    <LegendItem kind="rest">Lits libres</LegendItem>
                  </Legend>
                  <span className="num font-medium text-fg">
                    {`${formatNumber(totalOccupiedBeds)} occupés · ${formatNumber(totalAvailableBeds)} libres`}
                  </span>
                </>
              }
              bodyClassName="px-5 pb-5 pt-10"
            >
              {categoryCapsules.length === 0 ? (
                <EmptyNote title="Aucune capacité déclarée" />
              ) : (
                <CapsuleChart
                  mode="fill"
                  data={categoryCapsules}
                  threshold={bedChartMode === 'rate' ? { at: OCCUPANCY_CRITICAL, label: 'Seuil 85 %' } : undefined}
                  height={220}
                  ariaLabel="Occupation des lits par spécialité"
                />
              )}
            </Panel>
          )}

          {seeBlood && (
            <Panel
              i={5}
              className={seeBeds ? 'xl:col-span-5' : ''}
              eyebrow="Prévisions"
              title="Risque de pénurie par région"
              subtitle="Prévisions à 7 jours · par centre et groupe sanguin"
              actions={
                <Link to="/ml" className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-fg">
                  Prévisions <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              }
              footer={
                <Legend>
                  <LegendItem className="bg-viz-crit">Critique</LegendItem>
                  <LegendItem className="bg-viz-warn">Vigilance</LegendItem>
                  <LegendItem className="bg-viz-base-soft">Nominal</LegendItem>
                </Legend>
              }
              bodyClassName="px-5 pb-5 pt-4"
            >
              {predictionsQuery.isPending ? (
                <div className="space-y-3" aria-label="Chargement">
                  {[0, 1, 2, 3].map((k) => (
                    <span key={k} className="skeleton block h-2.5 w-full" />
                  ))}
                </div>
              ) : riskRows.length === 0 ? (
                <EmptyNote title="Aucune prévision disponible" hint="Le modèle n’a pas encore produit de prévision pour le réseau." />
              ) : (
                <StackBars rows={riskRows} ariaLabel="Risque de pénurie par région" />
              )}
            </Panel>
          )}
        </div>
      )}

      {FULL_FEATURES && <KpiPanel />}
    </div>
  )
}
