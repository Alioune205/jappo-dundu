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
import { useAuth } from '@/context/AuthContext'
import { useRealtime } from '@/context/RealtimeContext'
import { useTheme } from '@/context/ThemeContext'
import { Badge } from '@/components/ui/Badge'
import { MapView } from '@/components/map/MapView'
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

export const Dashboard: React.FC = () => {
  const { user } = useAuth()
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

  // 3. Flotte d'ambulances
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

  // 5. Synthèse des risques ML (Massogui Diop)
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

  return (
    <div className="space-y-6">
      {/* 1. En-tête sobre et direct */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border-main)]">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-main)]">
            {user?.facility ? user.facility.name : 'Supervision des Urgences Nationales'}
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Indicateurs en temps réel du réseau de santé • Sénégal
            {user?.facility && ` (${user.facility.city})`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Veille Sanitaire Active
          </span>
        </div>
      </div>

      {/* 2. 4 Indicateurs essentiels (clairs, nets, sans surcharge) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Lits */}
        <Link
          to="/beds"
          className="clinical-card p-5 hover:border-slate-300 dark:hover:border-slate-700 transition-colors block"
        >
          <div className="flex items-center justify-between text-[var(--text-muted)] mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Lits Disponibles</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <BedDouble className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-[var(--text-main)]">
              {formatNumber(totalAvailableBeds)}
            </span>
            <span className="text-xs text-[var(--text-muted)]">
              / {formatNumber(totalBeds)} installés
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs pt-2 border-t border-[var(--border-subtle)]">
            <span className="text-[var(--text-muted)]">Taux d'occupation</span>
            <span
              className={`font-semibold font-mono ${
                globalOccupancy > 0.85
                  ? 'text-red-600 dark:text-red-400'
                  : globalOccupancy > 0.7
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {formatPercent(globalOccupancy)}
            </span>
          </div>
        </Link>

        {/* Sang */}
        <Link
          to="/blood"
          className="clinical-card p-5 hover:border-slate-300 dark:hover:border-slate-700 transition-colors block"
        >
          <div className="flex items-center justify-between text-[var(--text-muted)] mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Demandes de Sang</span>
            <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center">
              <Droplets className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-[var(--text-main)]">
              {bloodRequests.length}
            </span>
            <span className="text-xs text-[var(--text-muted)]">en cours</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs pt-2 border-t border-[var(--border-subtle)]">
            <span className="text-[var(--text-muted)]">Urgences vitales</span>
            <span
              className={`font-semibold font-mono ${
                criticalBloodCount > 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {criticalBloodCount > 0 ? `${criticalBloodCount} critique(s)` : 'Aucune'}
            </span>
          </div>
        </Link>

        {/* Ambulances */}
        <Link
          to="/ambulances"
          className="clinical-card p-5 hover:border-slate-300 dark:hover:border-slate-700 transition-colors block"
        >
          <div className="flex items-center justify-between text-[var(--text-muted)] mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Ambulances SMUR</span>
            <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <AmbulanceIcon className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-[var(--text-main)]">
              {availableAmbulances}
            </span>
            <span className="text-xs text-[var(--text-muted)]">
              / {ambulances.length} prêtes
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs pt-2 border-t border-[var(--border-subtle)]">
            <span className="text-[var(--text-muted)]">Interventions</span>
            <span className="font-semibold font-mono text-[var(--text-main)]">
              {activeMissions.length} active(s)
            </span>
          </div>
        </Link>

        {/* IA Vigilance */}
        <Link
          to="/ml"
          className="clinical-card p-5 hover:border-slate-300 dark:hover:border-slate-700 transition-colors block"
        >
          <div className="flex items-center justify-between text-[var(--text-muted)] mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Vigilance Pénuries (IA)</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <BrainCircuit className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-[var(--text-main)]">
              {criticalPredictions}
            </span>
            <span className="text-xs text-[var(--text-muted)]">risques à 7 jours</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs pt-2 border-t border-[var(--border-subtle)]">
            <span className="text-[var(--text-muted)]">Modèle CQR</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              Calibré (81%)
            </span>
          </div>
        </Link>
      </div>

      {/* 3. Carte Nationale Complète des Urgences */}
      <div className="clinical-card p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-main)] pb-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-main)]">
              Cartographie Opérationnelle Nationale
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Localisation des hôpitaux, banques de sang et ambulances géolocalisées
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-medium text-[var(--text-muted)]">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-500" /> Hôpitaux
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600" /> Banques de Sang
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Ambulances Libres
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> En Mission
            </span>
          </div>
        </div>

        <MapView
          facilities={facilities}
          ambulances={ambulances}
          missions={activeMissions}
          height="420px"
        />
      </div>

      {/* 4. Deux Blocs Analytiques Complémentaires (50% / 50%) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Taux d'occupation des lits par spécialité */}
        <div className="clinical-card p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-[var(--border-main)] pb-3">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-main)]">
                Occupation des Lits par Spécialité
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Taux de saturation des services vitaux et d'urgence
              </p>
            </div>
            <Link
              to="/beds"
              className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline flex items-center gap-1"
            >
              Gérer les lits <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={bedsChartData}
                margin={{ top: 10, right: 10, left: -20, bottom: 25 }}
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
                <YAxis
                  stroke={isDark ? '#64748b' : '#94a3b8'}
                  fontSize={10}
                  domain={[0, 100]}
                  unit="%"
                />
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
                <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
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

        {/* Demandes urgentes de sang nécessitant une action */}
        <div className="clinical-card p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-[var(--border-main)] pb-3">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-main)]">
                Demandes de Sang Urgentes ({bloodRequests.length})
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Besoins de transfusion déclarés par les établissements
              </p>
            </div>
            <Link
              to="/blood"
              className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline flex items-center gap-1"
            >
              Voir tout <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-[var(--border-subtle)] overflow-y-auto max-h-64 pr-1">
            {bloodRequests.length === 0 ? (
              <div className="py-12 text-center text-xs text-[var(--text-muted)]">
                Aucune demande de sang en attente actuellement.
              </div>
            ) : (
              bloodRequests.slice(0, 6).map((req) => (
                <div key={req.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 font-mono font-bold flex items-center justify-center shrink-0 text-xs">
                      {req.blood_group}
                    </span>
                    <div className="truncate">
                      <div className="font-semibold text-[var(--text-main)] truncate">
                        {req.facility?.name || 'Hôpital'}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        Besoin de <strong className="text-[var(--text-main)]">{req.units_remaining} poches</strong> • {req.facility?.city}
                      </div>
                    </div>
                  </div>

                  <Badge
                    tone={
                      req.urgency === 'critical'
                        ? 'danger'
                        : req.urgency === 'urgent'
                        ? 'warning'
                        : 'info'
                    }
                    size="sm"
                  >
                    {req.urgency_display}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
