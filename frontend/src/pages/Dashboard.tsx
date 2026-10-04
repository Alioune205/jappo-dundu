import React, { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BedDouble,
  Droplets,
  Ambulance as AmbulanceIcon,
  BrainCircuit,
  ArrowRight,
} from 'lucide-react'
import { Link } from 'react-router'
import { api } from '@/lib/api'
import { useRealtime } from '@/context/RealtimeContext'
import { useTheme } from '@/context/ThemeContext'
import { StatCard } from '@/components/ui/StatCard'
import { MapView } from '@/components/map/MapView'
import { TacticalCommandBar } from '@/components/dashboard/TacticalCommandBar'
import { LiveDispatchQueue } from '@/components/dashboard/LiveDispatchQueue'
import { HospitalCapacityWidget } from '@/components/dashboard/HospitalCapacityWidget'
import { BloodMatrixWidget } from '@/components/dashboard/BloodMatrixWidget'
import { formatNumber, formatPercent } from '@/lib/format'
import type {
  BloodRequest,
  BedSummaryRow,
  BedCapacity,
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

export const Dashboard: React.FC = () => {
  const { subscribe } = useRealtime()
  const { theme } = useTheme()
  const queryClient = useQueryClient()
  const isDark = theme === 'dark'

  // 1. Demandes de sang ouvertes
  const { data: bloodRequests = [] } = useQuery({
    queryKey: ['blood-requests', 'open'],
    queryFn: async () => {
      const res = await api.get<{ results: BloodRequest[] }>('/api/sang/requests/', {
        status: 'open',
      })
      return res.results || []
    },
  })

  // 2. Synthèse des lits
  const { data: bedSummary = [] } = useQuery<BedSummaryRow[]>({
    queryKey: ['beds-summary'],
    queryFn: () => api.get<BedSummaryRow[]>('/api/lits/capacities/summary/'),
  })

  // 2b. Détail des capacités pour les jauges
  const { data: bedCapacities = [] } = useQuery<BedCapacity[]>({
    queryKey: ['bed-capacities-detail'],
    queryFn: async () => {
      const res = await api.get<{ results: BedCapacity[] }>('/api/lits/capacities/')
      return res.results || []
    },
  })

  // 3. Ambulances
  const { data: ambulances = [] } = useQuery<Ambulance[]>({
    queryKey: ['ambulances-list'],
    queryFn: async () => {
      const res = await api.get<{ results: Ambulance[] }>('/api/ambulances/vehicles/')
      return res.results || []
    },
  })

  // 4. Missions actives
  const { data: activeMissions = [] } = useQuery<Mission[]>({
    queryKey: ['missions-active'],
    queryFn: async () => {
      const res = await api.get<{ results: Mission[] }>('/api/ambulances/missions/', {
        active: true,
      })
      return res.results || []
    },
  })

  // 5. Synthèse des risques ML
  const { data: predictionSummary = [] } = useQuery<PredictionSummaryRow[]>({
    queryKey: ['predictions-summary'],
    queryFn: () => api.get<PredictionSummaryRow[]>('/api/ml/predictions/summary/'),
  })

  // 6. Établissements (pour la carte)
  const { data: facilities = [] } = useQuery<FacilitySummary[]>({
    queryKey: ['facilities-map'],
    queryFn: async () => {
      const res = await api.get<{ results: FacilitySummary[] }>('/api/facilities/')
      return res.results || []
    },
  })

  // Invalidation temps réel
  useEffect(() => {
    const unsub = subscribe('*', () => {
      queryClient.invalidateQueries({ queryKey: ['blood-requests'] })
      queryClient.invalidateQueries({ queryKey: ['beds-summary'] })
      queryClient.invalidateQueries({ queryKey: ['bed-capacities-detail'] })
      queryClient.invalidateQueries({ queryKey: ['ambulances-list'] })
      queryClient.invalidateQueries({ queryKey: ['missions-active'] })
      queryClient.invalidateQueries({ queryKey: ['predictions-summary'] })
    })
    return unsub
  }, [subscribe, queryClient])

  // Statistiques calculées
  const totalAvailableBeds = bedSummary.reduce((acc, row) => acc + row.available_beds, 0)
  const totalBeds = bedSummary.reduce((acc, row) => acc + row.total_beds, 0)
  const globalOccupancy = totalBeds > 0 ? (totalBeds - totalAvailableBeds) / totalBeds : 0

  const availableAmbulances = ambulances.filter((a) => a.status === 'available').length
  const criticalPredictions = predictionSummary.reduce((acc, p) => acc + p.critical_count, 0)
  const criticalBloodCount = bloodRequests.filter((r) => r.urgency === 'critical').length

  // Graphique d'occupation des lits
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

  return (
    <div className="space-y-6">
      {/* 1. Bandeau de commandement opérationnel */}
      <TacticalCommandBar
        criticalBloodCount={criticalBloodCount}
        availableBedsCount={totalAvailableBeds}
        availableAmbulancesCount={availableAmbulances}
        totalMissionsCount={activeMissions.length}
      />

      {/* 2. Indicateurs cliniques clés */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Lits Disponibles"
          value={formatNumber(totalAvailableBeds)}
          unit={`/ ${formatNumber(totalBeds)} installés`}
          description="Services d'urgences, réa et médecine"
          trend={`Occupation réseau : ${formatPercent(globalOccupancy)}`}
          trendTone={globalOccupancy > 0.85 ? 'danger' : globalOccupancy > 0.7 ? 'warning' : 'success'}
          badge={globalOccupancy > 0.85 ? 'Forte tension' : 'Normal'}
          badgeTone={globalOccupancy > 0.85 ? 'danger' : 'success'}
          icon={<BedDouble className="w-5 h-5 text-slate-600 dark:text-slate-300" />}
        />

        <StatCard
          title="Demandes de Sang"
          value={bloodRequests.length}
          unit="demandes en cours"
          description="Besoins de transfusion déclarés"
          trend={
            criticalBloodCount > 0
              ? `${criticalBloodCount} besoin(s) vital critique`
              : 'Aucun besoin critique'
          }
          trendTone={criticalBloodCount > 0 ? 'danger' : 'neutral'}
          badge={criticalBloodCount > 0 ? 'Urgence O-' : 'Sous contrôle'}
          badgeTone={criticalBloodCount > 0 ? 'danger' : 'neutral'}
          icon={<Droplets className="w-5 h-5 text-rose-600 dark:text-rose-400" />}
        />

        <StatCard
          title="Flotte SMUR Disponible"
          value={availableAmbulances}
          unit={`/ ${ambulances.length} véhicules`}
          description="Prêtes pour départ immédiat"
          trend={
            activeMissions.length > 0
              ? `${activeMissions.length} intervention(s) sur le terrain`
              : 'Aucune intervention en cours'
          }
          trendTone={activeMissions.length > 0 ? 'warning' : 'neutral'}
          badge={availableAmbulances > 0 ? 'Opérationnel' : 'Saturé'}
          badgeTone={availableAmbulances > 0 ? 'success' : 'danger'}
          icon={<AmbulanceIcon className="w-5 h-5 text-amber-600 dark:text-amber-400" />}
        />

        <StatCard
          title="Vigilance Pénuries (IA)"
          value={criticalPredictions}
          unit="centres menacés"
          description="Modèle HistGradientBoosting"
          trend="Horizon 7 jours (CQR 80 %)"
          trendTone={criticalPredictions > 0 ? 'danger' : 'success'}
          badge={criticalPredictions > 0 ? 'Risque Détecté' : 'Stable'}
          badgeTone={criticalPredictions > 0 ? 'danger' : 'success'}
          icon={<BrainCircuit className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
        />
      </div>

      {/* 3. Console centrale tactique */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Colonne gauche (7/12) : Carte géolocalisée + File d'attente SMUR */}
        <div className="lg:col-span-7 space-y-6">
          {/* Carte opérationnelle */}
          <div className="clinical-card overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 border-b border-[var(--border-main)] bg-[var(--bg-subtle)]">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-main)]">
                  Cartographie Opérationnelle Nationale
                </h3>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  Position des hôpitaux, véhicules SMUR géolocalisés et points d'urgence
                </p>
              </div>

              {/* Légende clinique */}
              <div className="flex items-center gap-3 text-[11px] font-medium text-[var(--text-muted)]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-sky-500" /> Hôpitaux
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-600" /> CNTS
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" /> SMUR Libre
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500" /> Mission
                </span>
              </div>
            </div>

            <MapView
              facilities={facilities}
              ambulances={ambulances}
              missions={activeMissions}
              height="440px"
              className="border-0 rounded-none shadow-none"
            />
          </div>

          {/* File de dispatch des interventions actives */}
          <LiveDispatchQueue missions={activeMissions} />
        </div>

        {/* Colonne droite (5/12) : Modules d'aide à la décision */}
        <div className="lg:col-span-5 space-y-6">
          {/* Matrice des réserves sanguines */}
          <BloodMatrixWidget bloodRequests={bloodRequests} />

          {/* Tension des services hospitaliers d'urgence */}
          <HospitalCapacityWidget capacities={bedCapacities} />

          {/* Taux d'occupation global par spécialité */}
          <div className="clinical-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-main)] bg-[var(--bg-subtle)]">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-main)]">
                  Capacités par Spécialité Médicale
                </h3>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  Répartition des lits occupés vs installés
                </p>
              </div>
              <Link
                to="/beds"
                className="text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-main)] flex items-center gap-1 transition-colors"
              >
                Détail <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="p-4 h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={bedsChartData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={isDark ? '#1e293b' : '#e2e8f0'}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="category"
                    stroke={isDark ? '#64748b' : '#94a3b8'}
                    fontSize={10}
                    interval={0}
                    angle={-18}
                    textAnchor="end"
                  />
                  <YAxis stroke={isDark ? '#64748b' : '#94a3b8'} fontSize={10} domain={[0, 100]} unit="%" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? '#0f172a' : '#ffffff',
                      borderColor: isDark ? '#334155' : '#e2e8f0',
                      borderRadius: '8px',
                      fontSize: '11px',
                      color: isDark ? '#f8fafc' : '#0f172a',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    }}
                    formatter={(val) => [`${val ?? 0} %`, 'Taux d’occupation']}
                  />
                  <Bar dataKey="rate" radius={[3, 3, 0, 0]}>
                    {bedsChartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          entry.rate > 85 ? '#dc2626' : entry.rate > 70 ? '#d97706' : '#059669'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
