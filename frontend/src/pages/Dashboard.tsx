import React, { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Ambulance as AmbulanceIcon,
  ArrowRight,
  BedDouble,
  BrainCircuit,
  Droplets,
  FileText,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import { Link } from 'react-router'
import { api } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { canManage, canView } from '@/lib/access'
import { Badge } from '@/components/ui/Badge'
import { StatCard } from '@/components/ui/StatCard'
import { MapView } from '@/components/map/MapView'
import { PageHeader } from '@/components/ui/PageHeader'
import { useThemeColors } from '@/lib/useThemeColors'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import { useAmbulancePositions } from '@/lib/useAmbulancePositions'
import { BED_EVENTS, BLOOD_REQUEST_EVENTS, MISSION_EVENTS, RealtimeEvent } from '@/lib/realtimeEvents'
import { formatNumber, formatPercent } from '@/lib/format'
import type {
  BloodRequest,
  BedSummaryRow,
  Ambulance,
  Mission,
  PredictionSummaryRow,
  FacilitySummary,
} from '@/types/api'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts'
import { QK } from '@/lib/queryKeys'
import { AmbulanceManagerDashboard } from './dashboard/AmbulanceManagerDashboard'
import { BedManagerDashboard } from './dashboard/BedManagerDashboard'
import { BloodManagerDashboard } from './dashboard/BloodManagerDashboard'
import { KpiPanel } from './dashboard/KpiPanel'
import type { Role } from '@/types/api'

/** Rôles qui ont une vue dédiée, centrée sur leur établissement. */
const DOMAIN_DASHBOARDS: Partial<Record<Role, React.FC<{ facility: FacilitySummary }>>> = {
  bed_manager: BedManagerDashboard,
  blood_manager: BloodManagerDashboard,
  ambulance_manager: AmbulanceManagerDashboard,
}

/** Colonnes de la grille d'indicateurs selon le nombre de cartes visibles. */
const STAT_COLUMNS: Record<number, string> = {
  1: 'xl:grid-cols-1',
  2: 'xl:grid-cols-2',
  3: 'xl:grid-cols-3',
  4: 'xl:grid-cols-4',
}

type LayerKey = 'hospitals' | 'bloodBanks' | 'ambulances' | 'missions'

const LAYERS: { key: LayerKey; label: string; swatch: string }[] = [
  { key: 'hospitals', label: 'Hôpitaux', swatch: 'bg-info' },
  { key: 'bloodBanks', label: 'Banques de sang', swatch: 'bg-critical' },
  { key: 'ambulances', label: 'Ambulances', swatch: 'bg-ok' },
  { key: 'missions', label: 'Missions', swatch: 'bg-warning' },
]

export const Dashboard: React.FC = () => {
  const { user, roles } = useAuth()
  // Un administrateur d'un seul domaine, rattaché à un établissement, a sa propre
  // vue ; l'administrateur général et les comptes multi-domaines gardent la vue réseau.
  const dedicated = roles.filter((role) => role in DOMAIN_DASHBOARDS)
  const DomainDashboard = dedicated.length === 1 && !roles.includes('admin') && !roles.includes('hospital_staff')
    ? DOMAIN_DASHBOARDS[dedicated[0]]
    : undefined
  if (user?.facility && DomainDashboard) return <DomainDashboard facility={user.facility} />
  return <NetworkDashboard />
}

/** Vue réseau : administrateur général et rôles multi-domaines. */
const NetworkDashboard: React.FC = () => {
  const { user, roles } = useAuth()
  const colors = useThemeColors()

  // Chaque administrateur ne charge que les domaines de son rôle : le serveur
  // refuserait les autres (403).
  const seeBlood = canView(roles, 'blood')
  const seeBeds = canView(roles, 'beds')
  const seeFleet = canManage(roles, 'ambulances')

  // 1. Demandes de sang ouvertes
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    hospitals: true,
    bloodBanks: true,
    ambulances: true,
    missions: true,
  })
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

  const { data: bloodRequests = [] } = useQuery({
    queryKey: [...QK.bloodRequests, 'open'],
    queryFn: async () => {
      const res = await api.get<{ results: BloodRequest[] }>('/api/sang/requests/', {
        status: 'open',
      })
      return res.results || []
    },
    enabled: seeBlood,
  })

  // 2. Synthèse des lits
  const { data: bedSummary = [] } = useQuery<BedSummaryRow[]>({
    queryKey: QK.bedsSummary,
    queryFn: () => api.get<BedSummaryRow[]>('/api/lits/capacities/summary/'),
    enabled: seeBeds,
  })

  // 3. Flotte d'ambulances
  const { data: ambulances = [] } = useQuery<Ambulance[]>({
    queryKey: QK.ambulancesList,
    queryFn: async () => {
      const res = await api.get<{ results: Ambulance[] }>('/api/ambulances/vehicles/')
      return res.results || []
    },
    enabled: seeFleet,
  })

  // 4. Missions actives
  const { data: activeMissions = [] } = useQuery<Mission[]>({
    queryKey: QK.missionsActive,
    queryFn: async () => {
      const res = await api.get<{ results: Mission[] }>('/api/ambulances/missions/', {
        active: true,
      })
      return res.results || []
    },
    enabled: seeFleet,
  })

  // 5. Synthèse des risques ML (Massogui Diop)
  const { data: predictionSummary = [] } = useQuery<PredictionSummaryRow[]>({
    queryKey: QK.predictionsSummary,
    queryFn: () => api.get<PredictionSummaryRow[]>('/api/ml/predictions/summary/'),
    enabled: seeBlood,
  })

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
  useRealtimeRefresh([
    { events: BLOOD_REQUEST_EVENTS, queryKeys: [QK.bloodRequests] },
    { events: BED_EVENTS, queryKeys: [QK.bedsSummary] },
    { events: MISSION_EVENTS, queryKeys: [QK.missionsActive, QK.ambulancesList] },
    { events: [RealtimeEvent.ambulanceStatus], queryKeys: [QK.ambulancesList] },
    { events: [RealtimeEvent.predictionUpdate], queryKeys: [QK.predictionsSummary] },
  ])
  useAmbulancePositions(QK.ambulancesList)

  // Statistiques calculées
  const totalAvailableBeds = bedSummary.reduce((acc, row) => acc + row.available_beds, 0)
  const totalBeds = bedSummary.reduce((acc, row) => acc + row.total_beds, 0)
  const globalOccupancy = totalBeds > 0 ? (totalBeds - totalAvailableBeds) / totalBeds : 0

  const availableAmbulances = ambulances.filter((a) => a.status === 'available').length
  const criticalPredictions = predictionSummary.reduce((acc, p) => acc + p.critical_count, 0)
  const criticalBloodCount = bloodRequests.filter((r) => r.urgency === 'critical').length

  // Graphique d'occupation des lits par spécialité
  const bedsChartData = bedSummary
    .reduce((acc, row) => {
      const existing = acc.find((item) => item.category === row.category_display)
      if (existing) {
        existing.total += row.total_beds
        existing.occupied += row.occupied_beds
      } else {
        acc.push({
          category: row.category_display,
          total: row.total_beds,
          occupied: row.occupied_beds,
          rate: row.total_beds > 0 ? Math.round((row.occupied_beds / row.total_beds) * 100) : 0,
        })
      }
      return acc
    }, [] as { category: string; total: number; occupied: number; rate: number }[])
    .sort((a, b) => b.rate - a.rate)

  const occupancyTone = globalOccupancy > 0.85 ? 'danger' : globalOccupancy > 0.7 ? 'warning' : 'success'
  const rateColor = (rate: number) =>
    rate > 85 ? colors.critical : rate > 70 ? colors.warning : colors.ok
  const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`
  const visibleCards = [seeBeds, seeBlood, seeFleet, seeBlood].filter(Boolean).length

  return (
    <div ref={rootRef} className={`space-y-6 ${crisisMode ? 'overflow-y-auto bg-canvas p-6' : ''}`}>
      <PageHeader
        title={user?.facility ? user.facility.name : 'Supervision nationale'}
        description={
          user?.facility
            ? `Indicateurs temps réel · ${user.facility.city}`
            : 'Indicateurs temps réel du réseau de santé · Sénégal'
        }
        actions={
          <div className="flex items-center gap-2">
            <Link
              to="/rapport"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm font-medium text-fg hover:bg-raised"
            >
              <FileText className="h-4 w-4" aria-hidden="true" /> Rapport
            </Link>
            <button
              type="button"
              onClick={toggleCrisisMode}
              aria-pressed={crisisMode}
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md bg-navy px-3 text-sm font-semibold text-white hover:opacity-90"
              title="Plein écran pour un écran mural de salle de crise"
            >
              {crisisMode ? <Minimize2 className="h-4 w-4" aria-hidden="true" /> : <Maximize2 className="h-4 w-4" aria-hidden="true" />}
              {crisisMode ? 'Quitter' : 'Salle de crise'}
            </button>
          </div>
        }
      />

      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${STAT_COLUMNS[visibleCards] ?? 'xl:grid-cols-4'}`}>
        {seeBeds && (
          <Link to="/beds" className="group block rounded-md">
            <StatCard
              title="Lits disponibles" accent="blue"
              icon={<BedDouble className="h-5 w-5" />}
              value={formatNumber(totalAvailableBeds)}
              unit={`/ ${formatNumber(totalBeds)}`}
              trend={`${formatPercent(globalOccupancy)} occupés`}
              trendTone={occupancyTone}
              progress={{
                value: totalBeds > 0 ? totalBeds - totalAvailableBeds : 0,
                max: totalBeds || 1,
                tone: occupancyTone,
              }}
              description="Réseau hospitalier"
              className="h-full group-hover:border-line-strong"
            />
          </Link>
        )}

        {seeBlood && (
          <Link to="/blood" className="group block rounded-md">
            <StatCard
              title="Demandes de sang" accent="red"
              icon={<Droplets className="h-5 w-5" />}
              value={bloodRequests.length}
              unit="ouvertes"
              badge={criticalBloodCount > 0 ? plural(criticalBloodCount, 'vitale') : undefined}
              badgeTone={criticalBloodCount > 0 ? 'danger' : 'neutral'}
              trend={criticalBloodCount > 0 ? 'Urgence vitale en cours' : 'Aucune urgence vitale'}
              trendTone={criticalBloodCount > 0 ? 'danger' : 'success'}
              description="CNTS et régions"
              className="h-full group-hover:border-line-strong"
            />
          </Link>
        )}

        {seeFleet && (
          <Link to="/ambulances" className="group block rounded-md">
            <StatCard
              title="Ambulances disponibles" accent="green"
              icon={<AmbulanceIcon className="h-5 w-5" />}
              value={availableAmbulances}
              unit={`/ ${ambulances.length}`}
              trend={plural(activeMissions.length, 'mission') + ' en cours'}
              trendTone={availableAmbulances <= 2 ? 'warning' : 'neutral'}
              progress={{
                value: availableAmbulances,
                max: ambulances.length || 1,
                tone: availableAmbulances <= 2 ? 'warning' : 'success',
              }}
              description="Flotte SAMU"
              className="h-full group-hover:border-line-strong"
            />
          </Link>
        )}

        {seeBlood && (
          <Link to="/ml" className="group block rounded-md">
            <StatCard
              title="Risques de pénurie" accent="yellow"
              icon={<BrainCircuit className="h-5 w-5" />}
              value={criticalPredictions}
              unit="critiques à 7 j"
              badgeTone={criticalPredictions > 0 ? 'danger' : 'neutral'}
              trend={criticalPredictions > 0 ? 'Action requise' : 'Aucun risque critique'}
              trendTone={criticalPredictions > 0 ? 'danger' : 'success'}
              description="Modèle quantile CQR"
              className="h-full group-hover:border-line-strong"
            />
          </Link>
        )}
      </div>

      <section className="panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="text-sm font-semibold text-fg">Carte opérationnelle</h2>
          {/* Légende = calques : chaque entrée s'affiche ou se masque. */}
          <ul className="flex flex-wrap items-center gap-1 text-xs" aria-label="Calques de la carte">
            {LAYERS.map((layer) => (
              <li key={layer.key}>
                <button
                  type="button"
                  aria-pressed={layers[layer.key]}
                  onClick={() => setLayers((current) => ({ ...current, [layer.key]: !current[layer.key] }))}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors ${
                    layers[layer.key] ? 'border-line-strong text-fg' : 'border-line text-subtle line-through'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-sm ${layer.swatch}`} /> {layer.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="p-2">
          <MapView
            facilities={facilities.filter((f) =>
              f.facility_type === 'blood_bank' ? layers.bloodBanks : f.facility_type === 'ambulance_service' ? true : layers.hospitals
            )}
            ambulances={layers.ambulances ? ambulances : []}
            missions={layers.missions ? activeMissions : []}
            height={crisisMode ? '62vh' : '420px'}
          />
        </div>
      </section>

      <div className={`grid grid-cols-1 gap-6 ${seeBeds && seeBlood ? 'lg:grid-cols-2' : ''}`}>
        {seeBeds && (
          <section className="panel">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <h3 className="text-sm font-semibold text-fg">Occupation par spécialité</h3>
              <Link to="/beds" className="flex items-center gap-1 text-xs text-muted hover:text-fg">
                Lits <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
  
            <div className="h-64 w-full px-2 pb-2 pt-3">
              {bedsChartData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-xs text-muted">
                  Aucune capacité déclarée.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bedsChartData} margin={{ top: 4, right: 8, left: -16, bottom: 28 }}>
                    <CartesianGrid stroke={colors.line} vertical={false} />
                    <XAxis
                      dataKey="category"
                      tick={{ fill: colors.muted }}
                      tickLine={false}
                      axisLine={{ stroke: colors.line }}
                      fontSize={11}
                      interval={0}
                      angle={-18}
                      textAnchor="end"
                    />
                    <YAxis
                      tick={{ fill: colors.muted }}
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      fontFamily="Inter, sans-serif"
                      domain={[0, 100]}
                      unit="%"
                    />
                    <Tooltip
                      cursor={{ fill: colors.raised }}
                      contentStyle={{
                        backgroundColor: colors.surface,
                        borderColor: colors.lineStrong,
                        borderRadius: 8,
                        fontSize: 12,
                        color: colors.fg,
                        boxShadow: 'var(--shadow-raised)',
                      }}
                      labelStyle={{ color: colors.fg }}
                      itemStyle={{ color: colors.muted }}
                      formatter={(val) => [`${val ?? 0} %`, 'Occupation']}
                    />
                    <Bar dataKey="rate" radius={[6, 6, 0, 0]} maxBarSize={36}>
                      {bedsChartData.map((entry) => (
                        <Cell key={entry.category} fill={rateColor(entry.rate)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>
        )}

        {seeBlood && (
          <section className="flex flex-col panel">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <h3 className="text-sm font-semibold text-fg">
                Demandes de sang ouvertes
                <span className="num ml-1.5 font-normal text-muted">{bloodRequests.length}</span>
              </h3>
              <Link to="/blood" className="flex items-center gap-1 text-xs text-muted hover:text-fg">
                Tout voir <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
  
            {bloodRequests.length === 0 ? (
              <div className="flex flex-1 items-center justify-center py-12 text-xs text-muted">
                Aucune demande en attente.
              </div>
            ) : (
              <table className="ops-table">
                <thead>
                  <tr>
                    <th scope="col">Groupe</th>
                    <th scope="col">Établissement</th>
                    <th scope="col" className="text-right">Poches</th>
                    <th scope="col">Urgence</th>
                  </tr>
                </thead>
                <tbody>
                  {bloodRequests.slice(0, 6).map((req) => (
                    <tr
                      key={req.id}
                      data-severity={
                        req.urgency === 'critical' ? 'critical' : req.urgency === 'urgent' ? 'warning' : undefined
                      }
                    >
                      <td className="num font-medium text-fg">{req.blood_group}</td>
                      <td className="w-full max-w-0">
                        <div className="truncate text-fg">{req.facility?.name || '—'}</div>
                        <div className="truncate text-2xs text-muted">{req.facility?.city}</div>
                      </td>
                      <td className="num text-right text-fg">{req.units_remaining}</td>
                      <td>
                        <Badge
                          tone={req.urgency === 'critical' ? 'danger' : req.urgency === 'urgent' ? 'warning' : 'info'}
                          size="sm"
                        >
                          {req.urgency_display}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
      </div>

      <KpiPanel />
    </div>
  )
}
