import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Ambulance as AmbulanceIcon, ArrowRight, BedDouble, BrainCircuit, Droplets, FileText, Maximize2, Minimize2 } from 'lucide-react'
import { Link } from 'react-router'
import { api } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { canView } from '@/lib/access'
import { Badge } from '@/components/ui/Badge'
import { MapView } from '@/components/map/MapView'
import { PageHeader } from '@/components/ui/PageHeader'
import { SupervisionBadge } from '@/components/ui/SupervisionBadge'
import { MetricTile } from '@/components/dash/MetricTile'
import { EmptyNote, Legend, LegendItem, Panel } from '@/components/dash/Panel'
import { ArcGauge } from '@/components/dash/ArcGauge'
import { CapsuleChart, type CapsuleDatum } from '@/components/dash/CapsuleChart'
import { StackBars, type StackRow } from '@/components/dash/StackBars'
import { Segmented } from '@/components/dash/Segmented'
import { PriorityFeed, type PriorityItem } from '@/components/dash/PriorityFeed'
import { OCCUPANCY_CRITICAL, SIGNAL_FILL, occupancySignal, type Signal } from '@/components/dash/tones'
import { useNow } from '@/lib/useNow'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import { useAmbulancePositions } from '@/lib/useAmbulancePositions'
import { BED_EVENTS, BLOOD_REQUEST_EVENTS, MISSION_EVENTS, RealtimeEvent } from '@/lib/realtimeEvents'
import { formatNumber, formatPercent, formatRelative } from '@/lib/format'
import type {
  BloodRequest,
  BedCapacity,
  BedCategory,
  BedSummaryRow,
  Ambulance,
  Mission,
  PredictionSummaryRow,
  FacilitySummary,
} from '@/types/api'
import { QK } from '@/lib/queryKeys'
import { AmbulanceManagerDashboard } from './dashboard/AmbulanceManagerDashboard'
import { BedManagerDashboard } from './dashboard/BedManagerDashboard'
import { BloodManagerDashboard } from './dashboard/BloodManagerDashboard'
import { KpiPanel } from './dashboard/KpiPanel'
import { VITAL_CATEGORIES, groupLabel, minutesSince, plural, shortCategory } from './dashboard/shared'
import { FacilitiesOverview } from './dashboard/FacilitiesOverview'
import { facilityRows } from './dashboard/facilityRows'
import type { Role } from '@/types/api'
import { FULL_FEATURES } from '@/lib/features'

/** Rôles qui ont une vue dédiée, centrée sur leur établissement. */
const DOMAIN_DASHBOARDS: Partial<Record<Role, React.FC<{ facility: FacilitySummary }>>> = {
  bed_manager: BedManagerDashboard,
  blood_manager: BloodManagerDashboard,
  ambulance_manager: AmbulanceManagerDashboard,
}

/** Colonnes de la rangée d'indicateurs selon le nombre de tuiles visibles. */
const TILE_COLUMNS: Record<number, string> = {
  1: 'xl:grid-cols-1',
  2: 'xl:grid-cols-2',
  3: 'xl:grid-cols-3',
  4: 'xl:grid-cols-4',
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

const URGENCY_RANK = { critical: 0, urgent: 1, normal: 2 } as const

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
  const { user, roles } = useAuth()
  const now = useNow(15_000)

  // Chaque administrateur ne charge que les domaines de son rôle : le serveur
  // refuserait les autres (403). L'administrateur général les consulte tous,
  // en lecture seule : le tableau de bord ne propose aucune action métier.
  const seeBlood = canView(roles, 'blood')
  const seeBeds = canView(roles, 'beds')
  const seeFleet = canView(roles, 'ambulances')

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

  // 6. Établissements (pour la carte)
  const { data: facilities = [] } = useQuery<FacilitySummary[]>({
    queryKey: QK.facilitiesMap,
    queryFn: async () => {
      const res = await api.get<{ results: FacilitySummary[] }>('/api/facilities/')
      return res.results || []
    },
  })

  // Temps réel : rechargements regroupés par fenêtre d'une seconde, et
  // positions GPS appliquées directement au cache (aucune requête).
  // Lits par service, pour la situation de chaque établissement (vue nationale).
  const national = !user?.facility
  const { data: capacities = [] } = useQuery<BedCapacity[]>({
    queryKey: [...QK.bedCapacities, 'network'],
    queryFn: async () => {
      const res = await api.get<{ results: BedCapacity[] }>('/api/lits/capacities/', { page_size: 200 })
      return res.results || []
    },
    enabled: seeBeds && national,
  })
  const rows = national ? facilityRows(facilities, capacities, bloodRequests, ambulances) : []

  // Périmètre couvert, déduit des établissements actifs : « phase pilote » tant
  // qu'une seule région est raccordée.
  const regions = Array.from(new Set(facilities.map((f) => f.region_display).filter(Boolean)))
  const hospitalCount = facilities.filter((f) => f.facility_type === 'hospital').length
  const scope =
    regions.length === 1
      ? `Phase pilote · Région de ${regions[0]} · ${hospitalCount} ${hospitalCount > 1 ? 'hôpitaux' : 'hôpital'}`
      : 'Supervision nationale'

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
  const sortedRequests = [...bloodRequests].sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency])
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
      <PageHeader
        eyebrow={
          <>
            <span>{user?.facility ? user.facility.city : scope}</span>
            <span aria-hidden="true">·</span>
            <span>{lastUpdate > 0 ? `Actualisé ${formatRelative(new Date(lastUpdate), now)}` : 'Chargement des données'}</span>
          </>
        }
        title={user?.facility ? user.facility.name : 'Situation du réseau'}
        description={
          <>
            Lits, sang et SAMU en temps réel : l’urgent d’abord, la tendance ensuite.
            <SupervisionBadge className="ml-2 align-middle" />
          </>
        }
        actions={
          FULL_FEATURES && (
            <>
              <Link
                to="/rapport"
                className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-semibold text-fg transition-colors hover:bg-raised"
              >
                <FileText className="h-4 w-4 text-muted" aria-hidden="true" /> Rapport
              </Link>
              <button
                type="button"
                onClick={toggleCrisisMode}
                aria-pressed={crisisMode}
                className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-brand px-4 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-strong"
                title="Plein écran pour un écran mural de salle de crise"
              >
                {crisisMode ? (
                  <Minimize2 className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Maximize2 className="h-4 w-4" aria-hidden="true" />
                )}
                {crisisMode ? 'Quitter' : 'Salle de crise'}
              </button>
            </>
          )
        }
      />

      {/* Indicateurs : une tuile mise en avant, les autres blanches, chacune mène à son module. */}
      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${TILE_COLUMNS[visibleTiles] ?? 'xl:grid-cols-4'}`}>
        {seeBeds && (
          <MetricTile
            i={0}
            variant="featured"
            icon={BedDouble}
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
            icon={Droplets}
            to="/blood"
            label="Demandes de sang"
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
            icon={AmbulanceIcon}
            to="/ambulances"
            label="Ambulances disponibles"
            loading={fleetQuery.isPending}
            value={availableAmbulances}
            unit={`/ ${ambulances.length}`}
            meter={{
              value: ambulances.length - availableAmbulances,
              max: ambulances.length,
              signal: fleetSignal,
              label: 'Ambulances engagées ou hors service',
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
            icon={BrainCircuit}
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

      {/* Ce qui demande une action et le risque à venir, face à la capacité hospitalière. */}
      <div className={`grid grid-cols-1 items-stretch gap-6 ${seeBeds ? 'xl:grid-cols-12' : ''}`}>
        <div className={`flex min-w-0 flex-col gap-6 ${seeBeds ? 'xl:col-span-7' : ''}`}>
          <Panel
            i={2}
            title={
              <span className="flex items-center gap-2">
                À traiter maintenant
                {priorities.length > 0 && (
                  <span className="num inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-critical/10 px-1.5 text-[0.6875rem] font-semibold text-critical">
                    {priorities.length}
                  </span>
                )}
              </span>
            }
            subtitle="Du plus grave au moins grave, tous modules confondus"
            bodyClassName="pt-2"
          >
            <PriorityFeed items={priorities} />
          </Panel>

          {seeBlood && (
            <Panel
              i={5}
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

        {seeBeds && (
          <Panel
            i={3}
            className="h-full xl:col-span-5"
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

      {national && <FacilitiesOverview rows={rows} />}

      <Panel
        i={4}
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

      {(seeBeds || seeBlood) && (
        <div className={`grid grid-cols-1 gap-6 ${seeBeds && seeBlood ? 'xl:grid-cols-12' : ''}`}>
          {seeBeds && (
            <Panel
              i={6}
              className={seeBlood ? 'xl:col-span-7' : ''}
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
              i={7}
              className={seeBeds ? 'xl:col-span-5' : ''}
              title={
                <>
                  Demandes de sang ouvertes <span className="num ml-1 font-normal text-muted">{bloodRequests.length}</span>
                </>
              }
              subtitle="Urgences vitales d’abord · poches collectées"
              actions={
                <Link to="/blood" className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-fg">
                  Tout voir <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              }
              bodyClassName="pt-2"
            >
              {bloodQuery.isPending ? (
                <div className="space-y-3 px-5 pb-5" aria-label="Chargement">
                  {[0, 1, 2].map((k) => (
                    <span key={k} className="skeleton block h-12 w-full" />
                  ))}
                </div>
              ) : bloodRequests.length === 0 ? (
                <EmptyNote tone="calm" title="Aucune demande en attente" />
              ) : (
                <ul className="divide-y divide-line">
                  {sortedRequests.slice(0, 6).map((req, index) => {
                    const pct = req.units_needed > 0 ? (req.units_collected / req.units_needed) * 100 : 0
                    return (
                      <li
                        key={req.id}
                        className="reveal grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3.5 px-5 py-3"
                        style={{ '--i': index + 2 } as React.CSSProperties}
                      >
                        <span
                          className={`num inline-flex h-10 w-11 items-center justify-center rounded-xl text-sm font-semibold ${
                            req.urgency === 'critical' ? 'bg-critical/10 text-critical' : 'bg-sunken text-fg'
                          }`}
                        >
                          {groupLabel(req.blood_group)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-fg">{req.facility?.name || '—'}</span>
                          <span className="mt-1 flex items-center gap-2">
                            <span className="block h-1.5 w-20 overflow-hidden rounded-full bg-track" aria-hidden="true">
                              <span className="bar-fill block h-full rounded-full bg-viz-base" style={{ width: `${pct}%` }} />
                            </span>
                            <span className="num truncate text-2xs text-muted">
                              {req.units_collected} / {req.units_needed} poches · {formatRelative(req.created_at, now)}
                            </span>
                          </span>
                        </span>
                        <span className="flex flex-col items-end gap-1">
                          <Badge
                            tone={req.urgency === 'critical' ? 'danger' : req.urgency === 'urgent' ? 'warning' : 'info'}
                            size="sm"
                          >
                            {req.urgency === 'critical' ? 'Vitale' : req.urgency_display}
                          </Badge>
                          <span className="num text-2xs text-muted">
                            <span className="font-semibold text-fg">{req.units_remaining}</span> manquante{req.units_remaining > 1 ? 's' : ''}
                          </span>
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Panel>
          )}
        </div>
      )}

      {FULL_FEATURES && <KpiPanel />}
    </div>
  )
}
