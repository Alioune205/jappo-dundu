import React, { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { Download } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { canManage, canView } from '@/lib/access'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyNote, Panel } from '@/components/dash/Panel'
import { ArcGauge } from '@/components/dash/ArcGauge'
import { UrgentCard, type UrgentItem } from '@/components/dash/UrgentCard'
import { OCCUPANCY_CRITICAL, occupancySignal } from '@/components/dash/tones'
import { useNow } from '@/lib/useNow'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import { BED_EVENTS, BLOOD_REQUEST_EVENTS, MISSION_EVENTS, RealtimeEvent } from '@/lib/realtimeEvents'
import { formatNumber, formatPercent, formatRelative } from '@/lib/format'
import type { BloodRequest, BedSummaryRow, Ambulance, Mission, PredictionSummaryRow, FacilitySummary } from '@/types/api'
import { QK } from '@/lib/queryKeys'
import { AmbulanceManagerDashboard } from './dashboard/AmbulanceManagerDashboard'
import { BedManagerDashboard } from './dashboard/BedManagerDashboard'
import { BloodManagerDashboard } from './dashboard/BloodManagerDashboard'
import { VITAL_CATEGORIES, groupLabel, minutesSince, plural, shortCategory } from './dashboard/shared'
import type { Role } from '@/types/api'
import { FULL_FEATURES } from '@/lib/features'
import { ResourceTiles } from './dashboard/network/ResourceTiles'
import { ASSIGN_TARGET_MINUTES } from './dashboard/network/status'
import { StockCard } from './dashboard/StockCard'
import { stockCapsules, useStockOutlook } from './dashboard/stockOutlook'

/** Rôles qui ont une vue dédiée, centrée sur leur établissement. */
const DOMAIN_DASHBOARDS: Partial<Record<Role, React.FC<{ facility: FacilitySummary }>>> = {
  bed_manager: BedManagerDashboard,
  blood_manager: BloodManagerDashboard,
  ambulance_manager: AmbulanceManagerDashboard,
}

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

/** Un point prioritaire de la vue réseau, avant mise en forme. */
interface Priority {
  id: string
  severity: 'critical' | 'warning'
  domain: string
  title: string
  meta: string
  to: string
}

/**
 * Exporter le rapport : la page de rapport global quand la version complète
 * est active, sinon l'impression de l'écran (PDF depuis le navigateur ; la
 * navigation et l'en-tête sont masqués à l'impression).
 */
const ExportReport: React.FC = () => {
  const className =
    'inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold text-fg transition-colors hover:border-fg/40'
  return FULL_FEATURES ? (
    <Link to="/rapport" className={className}>
      <Download className="h-4 w-4" aria-hidden="true" /> Exporter le rapport
    </Link>
  ) : (
    <button type="button" onClick={() => window.print()} className={className}>
      <Download className="h-4 w-4" aria-hidden="true" /> Exporter le rapport
    </button>
  )
}

/**
 * Vue réseau : administrateur général (lecture seule) et rôles multi-domaines.
 *
 * Trois étages, du plus simple au plus fin :
 * 1. quatre ressources, chacune sous la forme qui lui ressemble, qui mènent
 *    à leur module ;
 * 2. une seule rangée : le stock de sang par groupe, le point à traiter en
 *    priorité, l'occupation des lits.
 * Les listes de travail (demandes, flotte, missions) vivent dans leurs modules.
 */
const NetworkDashboard: React.FC = () => {
  const { user, roles } = useAuth()
  const now = useNow(15_000)

  // Chaque administrateur ne charge que les domaines de son rôle : le serveur
  // refuserait les autres (403).
  const seeBlood = canView(roles, 'blood')
  const seeBeds = canView(roles, 'beds')
  const seeFleet = canManage(roles, 'ambulances')

  // 1. Demandes de sang ouvertes
  const bloodQuery = useQuery({
    queryKey: [...QK.bloodRequests, 'open'],
    queryFn: async () => {
      const res = await api.get<{ results: BloodRequest[] }>('/api/sang/requests/', { status: 'open' })
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
  const ambulances = useMemo(() => fleetQuery.data ?? [], [fleetQuery.data])

  // 4. Missions actives
  const missionsQuery = useQuery<Mission[]>({
    queryKey: QK.missionsActive,
    queryFn: async () => {
      const res = await api.get<{ results: Mission[] }>('/api/ambulances/missions/', { active: true })
      return res.results || []
    },
    enabled: seeFleet,
  })
  const activeMissions = useMemo(() => missionsQuery.data ?? [], [missionsQuery.data])

  // 5. Synthèse des risques de pénurie
  const predictionsQuery = useQuery<PredictionSummaryRow[]>({
    queryKey: QK.predictionsSummary,
    queryFn: () => api.get<PredictionSummaryRow[]>('/api/ml/predictions/summary/'),
    enabled: seeBlood,
  })
  const predictionSummary = useMemo(() => predictionsQuery.data ?? [], [predictionsQuery.data])

  // 6. Stock par groupe sanguin, tout le réseau
  const stock = useStockOutlook(undefined, now, seeBlood)
  const capsules = useMemo(
    () => stockCapsules(stock.outlook, stock.stockScale, bloodRequests),
    [stock.outlook, stock.stockScale, bloodRequests]
  )

  // Temps réel : rechargements regroupés par fenêtre d'une seconde.
  useRealtimeRefresh([
    { events: BLOOD_REQUEST_EVENTS, queryKeys: [QK.bloodRequests] },
    { events: BED_EVENTS, queryKeys: [QK.bedsSummary, QK.bedCapacities] },
    { events: MISSION_EVENTS, queryKeys: [QK.missionsActive, QK.ambulancesList] },
    { events: [RealtimeEvent.ambulanceStatus], queryKeys: [QK.ambulancesList] },
    { events: [RealtimeEvent.predictionUpdate], queryKeys: [QK.predictionsSummary] },
  ])

  // ------------------------------------------------------------- Lits
  const totalAvailableBeds = bedSummary.reduce((acc, row) => acc + row.available_beds, 0)
  const totalReservedBeds = bedSummary.reduce((acc, row) => acc + (row.reserved_beds ?? 0), 0)
  const totalOccupiedBeds = bedSummary.reduce((acc, row) => acc + row.occupied_beds, 0)
  const totalBeds = bedSummary.reduce((acc, row) => acc + row.total_beds, 0)
  const globalOccupancy = totalBeds > 0 ? (totalBeds - totalAvailableBeds) / totalBeds : 0
  const occupancy = occupancySignal(totalBeds > 0 ? globalOccupancy : null)

  // ------------------------------------------------------- Prévisions
  const riskTotals = predictionSummary.reduce(
    (acc, p) => ({
      critical: acc.critical + p.critical_count,
      warning: acc.warning + p.warning_count,
      normal: acc.normal + p.normal_count,
      regions: acc.regions + (p.critical_count > 0 ? 1 : 0),
    }),
    { critical: 0, warning: 0, normal: 0, regions: 0 }
  )

  // --------------------------------------------- À traiter maintenant
  const priorities = useMemo(() => {
    const items: Priority[] = []
    for (const r of bloodRequests.filter((req) => req.urgency === 'critical')) {
      items.push({
        id: `blood-${r.id}`,
        severity: 'critical',
        domain: 'Demande vitale',
        title: `${groupLabel(r.blood_group)} · ${plural(r.units_remaining, 'poche manquante', 'poches manquantes')}`,
        meta: `${r.facility?.name ?? 'Établissement'} · demandée ${formatRelative(r.created_at, now)}`,
        to: '/blood',
      })
    }
    for (const m of activeMissions.filter((mission) => mission.status === 'pending')) {
      const waited = minutesSince(m.created_at, now) ?? 0
      items.push({
        id: `mission-${m.id}`,
        severity: m.priority === 'critical' || waited > ASSIGN_TARGET_MINUTES ? 'critical' : 'warning',
        domain: 'Sans ambulance',
        title: m.description || `Mission n° ${m.id} · ${m.priority_display}`,
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
        domain: saturatedVital ? 'Service vital saturé' : 'Service en tension',
        title: `${shortCategory(row.category, row.category_display)} · ${row.region_display || row.region}`,
        meta: `${formatNumber(row.available_beds)} libre${row.available_beds > 1 ? 's' : ''} sur ${formatNumber(row.total_beds)} · ${formatPercent(rate)} occupés`,
        to: '/beds',
      })
    }
    for (const p of predictionSummary.filter((row) => row.critical_count > 0)) {
      items.push({
        id: `risk-${p.region}`,
        severity: 'warning',
        domain: 'Pénurie prévue · 7 jours',
        title: p.region_display || p.region,
        meta: `${plural(p.critical_count, 'série critique', 'séries critiques')} (centre × groupe)`,
        to: '/ml',
      })
    }
    return items.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1))
  }, [bloodRequests, activeMissions, bedSummary, predictionSummary, now])

  // Le point le plus pressant, mis en forme selon sa nature.
  const urgent = useMemo<UrgentItem | null>(() => {
    const top = priorities[0]
    if (!top) return null
    const base = { severity: top.severity, tag: top.domain, heading: top.title, meta: top.meta }
    if (top.id.startsWith('blood-')) {
      const request = bloodRequests.find((r) => `blood-${r.id}` === top.id)
      if (request) {
        return {
          ...base,
          heading: request.facility?.name ?? 'Établissement',
          big: plural(request.units_remaining, 'poche', 'poches'),
          bigNote: `de sang ${groupLabel(request.blood_group)} à trouver`,
          meta: `Demandée ${formatRelative(request.created_at, now)}`,
          progress: {
            done: request.units_collected,
            total: request.units_needed,
            left: `${formatNumber(request.units_collected)} reçue${request.units_collected > 1 ? 's' : ''} sur ${formatNumber(request.units_needed)}`,
            right: `${formatNumber(request.units_remaining)} manquante${request.units_remaining > 1 ? 's' : ''}`,
          },
          action: { to: '/blood', label: 'Voir la demande' },
        }
      }
    }
    const label = top.id.startsWith('mission-')
      ? 'Voir la mission'
      : top.id.startsWith('beds-')
        ? 'Voir les lits'
        : 'Voir la prévision'
    return { ...base, action: { to: top.to, label } }
  }, [priorities, bloodRequests, now])

  const loadingUrgent =
    (seeBlood && bloodQuery.isPending) || (seeBeds && bedsQuery.isPending) || (seeFleet && missionsQuery.isPending)

  const lastUpdate = Math.max(
    bloodQuery.dataUpdatedAt,
    bedsQuery.dataUpdatedAt,
    fleetQuery.dataUpdatedAt,
    missionsQuery.dataUpdatedAt,
    predictionsQuery.dataUpdatedAt
  )

  // Les cartes de la rangée : une colonne par carte visible.
  const row = (seeBlood ? 1 : 0) + 1 + (seeBeds ? 1 : 0)
  const rowGrid =
    row === 3
      ? 'xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]'
      : row === 2
        ? 'xl:grid-cols-2'
        : 'xl:grid-cols-1'

  return (
    <div className="space-y-5">
      <PageHeader
        title={user?.facility ? user.facility.name : 'Situation du réseau'}
        description={`${user?.facility ? user.facility.city : 'Supervision nationale · lecture seule'} · ${
          lastUpdate > 0 ? `actualisé ${formatRelative(new Date(lastUpdate), now)}` : 'chargement des données'
        }`}
        actions={<ExportReport />}
      />

      {/* Ressources : chacune sous la forme qui lui ressemble, chacune mène à son module. */}
      <ResourceTiles
        show={{ beds: seeBeds, blood: seeBlood, fleet: seeFleet }}
        beds={{
          total: totalBeds,
          occupied: totalOccupiedBeds,
          reserved: totalReservedBeds,
          available: totalAvailableBeds,
          signal: occupancy,
          loading: bedsQuery.isPending,
        }}
        blood={{ requests: bloodRequests, loading: bloodQuery.isPending }}
        fleet={{ ambulances, activeMissions: activeMissions.length, loading: fleetQuery.isPending }}
        risk={{ ...riskTotals, loading: predictionsQuery.isPending }}
      />

      {/* Une seule rangée : le stock, le point à traiter, l'occupation des lits. */}
      <div className={`grid grid-cols-1 items-stretch gap-5 ${rowGrid}`}>
        {seeBlood && (
          <StockCard
            i={4}
            scope="sur tout le réseau"
            pending={stock.stocksPending}
            hasStock={stock.hasStock}
            capsules={capsules}
            scale={stock.stockScale}
            latestDate={stock.latestDate}
            simulated={stock.simulated}
          />
        )}

        <UrgentCard
          i={5}
          loading={loadingUrgent}
          item={urgent}
          more={{ count: Math.max(0, priorities.length - 1), to: priorities[1]?.to ?? '/' }}
          calm="Aucune situation ne requiert d’intervention."
        />

        {seeBeds && (
          <Panel i={6} title="Occupation des lits" subtitle="Tout le réseau · en direct" bodyClassName="flex items-center justify-center px-4 pb-5 pt-4">
            {bedsQuery.isPending ? (
              <div className="skeleton h-36 w-60 rounded-t-full" aria-label="Chargement" />
            ) : totalBeds === 0 ? (
              <EmptyNote title="Aucune capacité déclarée" hint="Les établissements n’ont pas encore publié leurs lits." />
            ) : (
              <ArcGauge
                size={240}
                centerValue={formatPercent(globalOccupancy)}
                centerLabel="des lits occupés"
                segments={[
                  {
                    label: 'Occupés',
                    value: totalOccupiedBeds,
                    color: `var(--viz-${occupancy === 'critical' ? 'crit' : occupancy === 'warning' ? 'warn' : 'base'})`,
                    unit: 'lits',
                  },
                  ...(totalReservedBeds > 0
                    ? [{ label: 'Réservés', value: totalReservedBeds, color: 'var(--viz-base)', unit: 'lits' }]
                    : []),
                  { label: 'Libres', value: totalAvailableBeds, rest: true, unit: 'lits' },
                ]}
              />
            )}
          </Panel>
        )}
      </div>
    </div>
  )
}
