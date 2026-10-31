import React, { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  Ambulance as AmbulanceIcon,
  ArrowRight,
  BedDouble,
  BrainCircuit,
  Droplets,
  FileText,
  Layers,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import { Link } from 'react-router'
import { api } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { canManage, canView } from '@/lib/access'
import { Badge } from '@/components/ui/Badge'
import { StatCard } from '@/components/ui/StatCard'
import { RadialGauge } from '@/components/ui/RadialGauge'
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
  ReferenceLine,
} from 'recharts'
import { QK } from '@/lib/queryKeys'
import { AmbulanceManagerDashboard } from './dashboard/AmbulanceManagerDashboard'
import { BedManagerDashboard } from './dashboard/BedManagerDashboard'
import { BloodManagerDashboard } from './dashboard/BloodManagerDashboard'
import { KpiPanel } from './dashboard/KpiPanel'
import type { Role } from '@/types/api'
import { FULL_FEATURES } from '@/lib/features'

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
  const DomainDashboard =
    dedicated.length === 1 && !roles.includes('admin') && !roles.includes('hospital_staff')
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

  // Statistiques calculées (Lits)
  const totalAvailableBeds = bedSummary.reduce((acc, row) => acc + row.available_beds, 0)
  const totalReservedBeds = bedSummary.reduce((acc, row) => acc + (row.reserved_beds ?? 0), 0)
  const totalOccupiedBeds = bedSummary.reduce((acc, row) => acc + row.occupied_beds, 0)
  const totalBeds = bedSummary.reduce((acc, row) => acc + row.total_beds, 0)
  const globalOccupancy = totalBeds > 0 ? (totalBeds - totalAvailableBeds) / totalBeds : 0

  // Statistiques Flotte & Sang
  const availableAmbulances = ambulances.filter((a) => a.status === 'available').length
  const criticalPredictions = predictionSummary.reduce((acc, p) => acc + p.critical_count, 0)
  const warningPredictions = predictionSummary.reduce((acc, p) => acc + p.warning_count, 0)
  const normalPredictions = predictionSummary.reduce((acc, p) => acc + p.normal_count, 0)
  const criticalBloodCount = bloodRequests.filter((r) => r.urgency === 'critical').length

  // Graphique d'occupation des lits par spécialité
  const bedsChartData = bedSummary
    .reduce(
      (acc, row) => {
        const existing = acc.find((item) => item.category === row.category_display)
        if (existing) {
          existing.total += row.total_beds
          existing.occupied += row.occupied_beds
          existing.available += row.available_beds
          existing.rate = existing.total > 0 ? Math.round((existing.occupied / existing.total) * 100) : 0
        } else {
          acc.push({
            category: row.category_display,
            total: row.total_beds,
            occupied: row.occupied_beds,
            available: row.available_beds,
            rate: row.total_beds > 0 ? Math.round((row.occupied_beds / row.total_beds) * 100) : 0,
          })
        }
        return acc
      },
      [] as { category: string; total: number; occupied: number; available: number; rate: number }[]
    )
    .sort((a, b) => b.rate - a.rate)

  // Synthèse régionale des lits pour le panneau d'équilibre capacitaire
  const regionBedsData = bedSummary
    .reduce(
      (acc, row) => {
        const label = row.region_display || row.region || 'Région'
        const existing = acc.find((item) => item.region === label)
        if (existing) {
          existing.total += row.total_beds
          existing.occupied += row.occupied_beds
          existing.available += row.available_beds
        } else {
          acc.push({
            region: label,
            total: row.total_beds,
            occupied: row.occupied_beds,
            available: row.available_beds,
          })
        }
        return acc
      },
      [] as { region: string; total: number; occupied: number; available: number }[]
    )
    .sort((a, b) => b.total - a.total)

  const occupancyTone = globalOccupancy > 0.85 ? 'danger' : globalOccupancy > 0.7 ? 'warning' : 'success'
  const rateColor = (rate: number) => (rate > 85 ? colors.critical : rate > 70 ? colors.warning : colors.ok)
  const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`
  const visibleCards = [seeBeds, seeBlood, seeFleet, seeBlood].filter(Boolean).length

  // Sparklines réelles extraites des séries présentes
  const bedSparkline = bedsChartData.length >= 2 ? bedsChartData.map((d) => d.rate) : undefined
  const mlSparkline =
    predictionSummary.length >= 2
      ? predictionSummary.map((p) => p.critical_count * 2 + p.warning_count)
      : undefined

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
          FULL_FEATURES && (
            <div className="flex items-center gap-2">
              <Link
                to="/rapport"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 text-sm font-medium text-fg shadow-2xs transition-colors hover:bg-raised"
              >
                <FileText className="h-4 w-4 text-muted" aria-hidden="true" /> Rapport
              </Link>
              <button
                type="button"
                onClick={toggleCrisisMode}
                aria-pressed={crisisMode}
                className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-[#0f2547] px-3.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#16335e]"
                title="Plein écran pour un écran mural de salle de crise"
              >
                {crisisMode ? (
                  <Minimize2 className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Maximize2 className="h-4 w-4" aria-hidden="true" />
                )}
                {crisisMode ? 'Quitter' : 'Salle de crise'}
              </button>
            </div>
          )
        }
      />

      {/* Rangée Bento KPI : première carte en Hero plein, suivantes avec jauges et sparklines */}
      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${STAT_COLUMNS[visibleCards] ?? 'xl:grid-cols-4'}`}>
        {seeBeds && (
          <Link to="/beds" className="group block rounded-2xl">
            <StatCard
              title="Lits disponibles"
              accent="blue"
              variant="hero"
              stagger={0}
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
              className="h-full"
            />
          </Link>
        )}

        {seeBlood && (
          <Link to="/blood" className="group block rounded-2xl">
            <StatCard
              title="Demandes de sang"
              accent="red"
              stagger={1}
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
          <Link to="/ambulances" className="group block rounded-2xl">
            <StatCard
              title="Ambulances disponibles"
              accent="green"
              stagger={2}
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
          <Link to="/ml" className="group block rounded-2xl">
            <StatCard
              title="Risques de pénurie"
              accent="yellow"
              stagger={3}
              sparkline={mlSparkline}
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

      {/* Carte opérationnelle avec contrôles de calques enrichis */}
      <section className="panel dash-panel-in overflow-hidden" style={{ '--stagger': 1 } as React.CSSProperties}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-info/10 text-info">
              <Layers className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-fg">Carte opérationnelle</h2>
              <p className="text-2xs text-muted">
                Géolocalisation temps réel des structures, banques de sang, véhicules SAMU et interventions
              </p>
            </div>
          </div>
          {/* Légende = calques : chaque entrée s'affiche ou se masque. */}
          <ul className="flex flex-wrap items-center gap-1.5 text-xs" aria-label="Calques de la carte">
            {LAYERS.map((layer) => (
              <li key={layer.key}>
                <button
                  type="button"
                  aria-pressed={layers[layer.key]}
                  onClick={() => setLayers((current) => ({ ...current, [layer.key]: !current[layer.key] }))}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 font-medium transition-all ${
                    layers[layer.key]
                      ? 'border-line-strong bg-raised/70 text-fg shadow-2xs'
                      : 'border-line text-subtle line-through opacity-65'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${layer.swatch}`} /> {layer.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="p-2">
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
            height={crisisMode ? '62vh' : '420px'}
          />
        </div>
      </section>

      {/* Grille analytique principale : Occupation par spécialité + Équilibre Capacitaire / Demandes de sang */}
      <div className={`grid grid-cols-1 gap-6 ${seeBeds && seeBlood ? 'xl:grid-cols-12' : ''}`}>
        {seeBeds && (
          <section
            className={`panel dash-panel-in flex flex-col justify-between ${
              seeBlood ? 'xl:col-span-7' : ''
            }`}
            style={{ '--stagger': 2 } as React.CSSProperties}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
              <div>
                <h3 className="text-sm font-semibold text-fg">Occupation par spécialité</h3>
                <p className="text-2xs text-muted">
                  Temps réel · Seuil d’alerte critique fixé à 85 % ({bedSparkline ? `${bedsChartData.length} spécialités` : 'aucune donnée'})
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-full border border-line bg-raised p-0.5 text-2xs" role="group" aria-label="Mode du graphique">
                  <button
                    type="button"
                    onClick={() => setBedChartMode('rate')}
                    aria-pressed={bedChartMode === 'rate'}
                    className={`cursor-pointer rounded-full px-2.5 py-0.5 font-medium transition-colors ${
                      bedChartMode === 'rate' ? 'bg-surface text-fg shadow-2xs' : 'text-muted hover:text-fg'
                    }`}
                  >
                    Taux (%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setBedChartMode('volume')}
                    aria-pressed={bedChartMode === 'volume'}
                    className={`cursor-pointer rounded-full px-2.5 py-0.5 font-medium transition-colors ${
                      bedChartMode === 'volume' ? 'bg-surface text-fg shadow-2xs' : 'text-muted hover:text-fg'
                    }`}
                  >
                    Volumes
                  </button>
                </div>
                <Link to="/beds" className="flex items-center gap-1 text-xs font-medium text-muted hover:text-fg">
                  Lits <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>

            <div className="h-68 w-full px-3 pb-2 pt-4">
              {bedsChartData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-xs text-muted">
                  Aucune capacité déclarée.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bedsChartData} margin={{ top: 8, right: 12, left: -14, bottom: 28 }}>
                    <CartesianGrid stroke={colors.line} strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="category"
                      tick={{ fill: colors.muted }}
                      tickLine={false}
                      axisLine={{ stroke: colors.line }}
                      fontSize={11}
                      interval={0}
                      angle={-16}
                      textAnchor="end"
                    />
                    <YAxis
                      tick={{ fill: colors.muted }}
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      domain={bedChartMode === 'rate' ? [0, 100] : [0, 'auto']}
                      unit={bedChartMode === 'rate' ? '%' : ''}
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
                      labelStyle={{ color: colors.fg, fontWeight: 600 }}
                      itemStyle={{ color: colors.muted }}
                      formatter={(val, name) => {
                        if (bedChartMode === 'rate') return [`${val ?? 0} %`, 'Occupation']
                        return [`${val ?? 0} lits`, name === 'occupied' ? 'Occupés' : 'Libres']
                      }}
                    />
                    {bedChartMode === 'rate' && (
                      <ReferenceLine
                        y={85}
                        stroke={colors.critical}
                        strokeDasharray="4 4"
                        strokeOpacity={0.65}
                      />
                    )}
                    {bedChartMode === 'rate' ? (
                      <Bar dataKey="rate" radius={[8, 8, 0, 0]} maxBarSize={38}>
                        {bedsChartData.map((entry) => (
                          <Cell key={entry.category} fill={rateColor(entry.rate)} />
                        ))}
                      </Bar>
                    ) : (
                      <>
                        <Bar dataKey="occupied" stackId="beds" fill={colors.info} radius={[0, 0, 0, 0]} maxBarSize={38} />
                        <Bar dataKey="available" stackId="beds" fill={colors.ok} radius={[8, 8, 0, 0]} maxBarSize={38} />
                      </>
                    )}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-raised/35 px-5 py-2.5 text-2xs text-muted">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-ok" /> Nominal (&lt; 70 %)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-warning" /> Vigilance (70–85 %)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-critical" /> Critique (&gt; 85 %)
                </span>
              </div>
              <span className="num font-medium text-fg">
                {`${totalOccupiedBeds} occupés · ${totalAvailableBeds} libres`}
              </span>
            </div>
          </section>
        )}

        {seeBeds && (
          <section
            className={`panel dash-panel-in flex flex-col justify-between ${
              seeBlood ? 'xl:col-span-5' : ''
            }`}
            style={{ '--stagger': 3 } as React.CSSProperties}
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
                  <Activity className="h-4 w-4 text-accent-blue" aria-hidden="true" />
                  Jauge de tension hospitalière
                </h3>
                <p className="text-2xs text-muted">Répartition temps réel de la capacité déclarée</p>
              </div>
              <Badge tone={occupancyTone === 'danger' ? 'danger' : occupancyTone === 'warning' ? 'warning' : 'success'} size="sm">
                {globalOccupancy > 0.85 ? 'Tension forte' : globalOccupancy > 0.7 ? 'Vigilance' : 'Équilibre'}
              </Badge>
            </div>

            <div className="flex flex-1 flex-col justify-center px-5 py-4">
              <RadialGauge
                mode="semi"
                centerValue={formatPercent(globalOccupancy)}
                centerLabel="Taux global réseau"
                segments={[
                  { label: 'Occupés', value: totalOccupiedBeds, color: rateColor(Math.round(globalOccupancy * 100)), unit: 'lits' },
                  ...(totalReservedBeds > 0
                    ? [{ label: 'Réservés', value: totalReservedBeds, color: colors.info, unit: 'lits' }]
                    : []),
                  { label: 'Disponibles', value: totalAvailableBeds, color: colors.ok, unit: 'lits' },
                ]}
              />

              {regionBedsData.length > 0 && (
                <div className="mt-4 space-y-2 border-t border-line pt-3">
                  <p className="eyebrow text-2xs">Capacité par région</p>
                  <ul className="space-y-1.5 text-xs">
                    {regionBedsData.slice(0, 3).map((reg) => {
                      const regRate = reg.total > 0 ? Math.round((reg.occupied / reg.total) * 100) : 0
                      return (
                        <li key={reg.region} className="space-y-1">
                          <div className="flex items-center justify-between text-2xs">
                            <span className="font-medium text-fg">{reg.region}</span>
                            <span className="num text-muted">
                              {`${reg.available} libres sur ${reg.total} (${regRate} %)`}
                            </span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-raised">
                            <div
                              className="bar-origin-left h-full rounded-full"
                              style={{ width: `${regRate}%`, backgroundColor: rateColor(regRate) }}
                            />
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      {/* Section Sang & Prévisions ML (affichée si le rôle a accès au sang) */}
      {seeBlood && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <section className="panel dash-panel-in flex flex-col xl:col-span-8" style={{ '--stagger': 4 } as React.CSSProperties}>
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <div>
                <h3 className="text-sm font-semibold text-fg">
                  Demandes de sang ouvertes
                  <span className="num ml-1.5 font-normal text-muted">{bloodRequests.length}</span>
                </h3>
                <p className="text-2xs text-muted">Priorisées par niveau d’urgence médicale et besoin restant</p>
              </div>
              <Link to="/blood" className="flex items-center gap-1 text-xs font-medium text-muted hover:text-fg">
                Tout voir <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {bloodRequests.length === 0 ? (
              <div className="flex flex-1 items-center justify-center py-12 text-xs text-muted">
                Aucune demande en attente.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th scope="col">Groupe</th>
                      <th scope="col">Établissement</th>
                      <th scope="col" className="text-right">
                        Poches
                      </th>
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
                        <td className="num font-medium text-fg">
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent-red/10 font-bold text-accent-red">
                            {req.blood_group}
                          </span>
                        </td>
                        <td className="w-full max-w-0">
                          <div className="truncate font-medium text-fg">{req.facility?.name || '—'}</div>
                          <div className="truncate text-2xs text-muted">{req.facility?.city}</div>
                        </td>
                        <td className="num text-right font-semibold text-fg">{req.units_remaining}</td>
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
              </div>
            )}
          </section>

          <section className="panel dash-panel-in flex flex-col justify-between xl:col-span-4" style={{ '--stagger': 5 } as React.CSSProperties}>
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
                  <BrainCircuit className="h-4 w-4 text-warning" aria-hidden="true" />
                  Radar prédictif CQR (7 j)
                </h3>
                <p className="text-2xs text-muted">Répartition des séries de stocks analysées</p>
              </div>
              <Link to="/ml" className="flex items-center gap-1 text-xs font-medium text-muted hover:text-fg">
                Détails <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="flex flex-1 flex-col justify-center p-5">
              {predictionSummary.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted">Aucune prévision disponible.</p>
              ) : (
                <RadialGauge
                  mode="donut"
                  size={136}
                  centerValue={`${criticalPredictions + warningPredictions + normalPredictions} séries`}
                  centerLabel="Séries suivies"
                  segments={[
                    { label: 'Critique', value: criticalPredictions, color: colors.critical, unit: 'séries' },
                    { label: 'Vigilance', value: warningPredictions, color: colors.warning, unit: 'séries' },
                    { label: 'Nominal', value: normalPredictions, color: colors.ok, unit: 'séries' },
                  ]}
                />
              )}
            </div>
          </section>
        </div>
      )}

      {FULL_FEATURES && <KpiPanel />}
    </div>
  )
}
