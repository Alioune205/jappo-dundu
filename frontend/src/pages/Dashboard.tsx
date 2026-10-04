import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { api } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
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

export const Dashboard: React.FC = () => {
  const { user } = useAuth()
  const colors = useThemeColors()

  // 1. Demandes de sang ouvertes
  const { data: bloodRequests = [] } = useQuery({
    queryKey: [...QK.bloodRequests, 'open'],
    queryFn: async () => {
      const res = await api.get<{ results: BloodRequest[] }>('/api/sang/requests/', {
        status: 'open',
      })
      return res.results || []
    },
  })

  // 2. Synthèse des lits
  const { data: bedSummary = [] } = useQuery<BedSummaryRow[]>({
    queryKey: QK.bedsSummary,
    queryFn: () => api.get<BedSummaryRow[]>('/api/lits/capacities/summary/'),
  })

  // 3. Flotte d'ambulances
  const { data: ambulances = [] } = useQuery<Ambulance[]>({
    queryKey: QK.ambulancesList,
    queryFn: async () => {
      const res = await api.get<{ results: Ambulance[] }>('/api/ambulances/vehicles/')
      return res.results || []
    },
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
  })

  // 5. Synthèse des risques ML (Massogui Diop)
  const { data: predictionSummary = [] } = useQuery<PredictionSummaryRow[]>({
    queryKey: QK.predictionsSummary,
    queryFn: () => api.get<PredictionSummaryRow[]>('/api/ml/predictions/summary/'),
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

  return (
    <div className="space-y-5">
      <PageHeader
        title={user?.facility ? user.facility.name : 'Supervision nationale'}
        description={
          user?.facility
            ? `Indicateurs temps réel · ${user.facility.city}`
            : 'Indicateurs temps réel du réseau de santé · Sénégal'
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Link to="/beds" className="group block rounded-md">
          <StatCard
            title="Lits disponibles"
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

        <Link to="/blood" className="group block rounded-md">
          <StatCard
            title="Demandes de sang"
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

        <Link to="/ambulances" className="group block rounded-md">
          <StatCard
            title="Ambulances disponibles"
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

        <Link to="/ml" className="group block rounded-md">
          <StatCard
            title="Risques de pénurie"
            value={criticalPredictions}
            unit="critiques à 7 j"
            badgeTone={criticalPredictions > 0 ? 'danger' : 'neutral'}
            trend={criticalPredictions > 0 ? 'Action requise' : 'Aucun risque critique'}
            trendTone={criticalPredictions > 0 ? 'danger' : 'success'}
            description="Modèle quantile CQR"
            className="h-full group-hover:border-line-strong"
          />
        </Link>
      </div>

      <section className="rounded-md border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <h2 className="text-sm font-semibold text-fg">Carte opérationnelle</h2>
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted" aria-label="Légende">
            <li className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-info" /> Hôpitaux
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-critical" /> Banques de sang · missions
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-ok" /> Ambulance libre
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-warning" /> En mission
            </li>
          </ul>
        </div>
        <div className="p-2">
          <MapView facilities={facilities} ambulances={ambulances} missions={activeMissions} height="420px" />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="rounded-md border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
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
                    fontSize={10}
                    interval={0}
                    angle={-18}
                    textAnchor="end"
                  />
                  <YAxis
                    tick={{ fill: colors.muted }}
                    tickLine={false}
                    axisLine={false}
                    fontSize={10}
                    fontFamily="IBM Plex Mono, monospace"
                    domain={[0, 100]}
                    unit="%"
                  />
                  <Tooltip
                    cursor={{ fill: colors.raised }}
                    contentStyle={{
                      backgroundColor: colors.surface,
                      borderColor: colors.lineStrong,
                      borderRadius: 4,
                      fontSize: 12,
                      color: colors.fg,
                      boxShadow: 'none',
                    }}
                    labelStyle={{ color: colors.fg }}
                    itemStyle={{ color: colors.muted }}
                    formatter={(val) => [`${val ?? 0} %`, 'Occupation']}
                  />
                  <Bar dataKey="rate" radius={[2, 2, 0, 0]} maxBarSize={36}>
                    {bedsChartData.map((entry) => (
                      <Cell key={entry.category} fill={rateColor(entry.rate)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="flex flex-col rounded-md border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
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
      </div>
    </div>
  )
}
