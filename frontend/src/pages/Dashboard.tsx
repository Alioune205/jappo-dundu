import React, { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useRealtime } from '@/context/RealtimeContext'
import { useAuth } from '@/context/AuthContext'
import { StatCard } from '@/components/ui/StatCard'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
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
  const queryClient = useQueryClient()

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

  // Abonnements temps réel pour rafraîchir automatiquement les données
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

  // Calculs statistiques
  const totalAvailableBeds = bedSummary.reduce((acc, row) => acc + row.available_beds, 0)
  const totalBeds = bedSummary.reduce((acc, row) => acc + row.total_beds, 0)
  const globalOccupancy = totalBeds > 0 ? (totalBeds - totalAvailableBeds) / totalBeds : 0

  const availableAmbulances = ambulances.filter((a) => a.status === 'available').length
  const criticalPredictions = predictionSummary.reduce((acc, p) => acc + p.critical_count, 0)

  // Données de graphique d'occupation des lits par catégorie
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
    <div className="space-y-8 animate-fade-in">
      {/* Salutation et contexte */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-white tracking-tight">
            Centre de Décision & Supervision
          </h1>
          <p className="text-xs text-ink-400 mt-1">
            Indicateurs en temps réel pour le réseau hospitalier du Sénégal
            {user?.facility && ` • ${user.facility.name}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="brand" size="md">
            Réseau National Connecté
          </Badge>
        </div>
      </div>

      {/* Cartes KPI clés */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          title="Lits Disponibles"
          value={formatNumber(totalAvailableBeds)}
          unit={`/ ${formatNumber(totalBeds)} lits`}
          trend={formatPercent(globalOccupancy) + ' occupé'}
          trendTone={globalOccupancy > 0.85 ? 'danger' : globalOccupancy > 0.7 ? 'warning' : 'success'}
          tone={globalOccupancy > 0.85 ? 'danger' : 'success'}
          description="Services d'urgences et réanimation"
          icon={<span className="text-xl">🛏️</span>}
        />

        <StatCard
          title="Demandes de Sang Ouvertes"
          value={bloodRequests.length}
          unit="en cours"
          trend={`${bloodRequests.filter((r) => r.urgency === 'critical').length} critiques`}
          trendTone="danger"
          tone="danger"
          description="Besoins de transfusion immédiats"
          icon={<span className="text-xl">🩸</span>}
        />

        <StatCard
          title="Ambulances Disponibles"
          value={availableAmbulances}
          unit={`/ ${ambulances.length} véhicules`}
          trend={`${activeMissions.length} missions en cours`}
          trendTone={activeMissions.length > 0 ? 'warning' : 'neutral'}
          tone="warning"
          description="Prêtes pour intervention rapide"
          icon={<span className="text-xl">🚑</span>}
        />

        <StatCard
          title="Risques Pénurie IA (ML)"
          value={criticalPredictions}
          unit="centres menacés"
          trend="Horizon 7 jours"
          trendTone={criticalPredictions > 0 ? 'danger' : 'success'}
          tone="violet"
          description="Prévision calibrée à 80 % de confiance"
          icon={<span className="text-xl">🧠</span>}
        />
      </div>

      {/* Carte géographique nationale des urgences */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Carte Nationale Interactive des Opérations</CardTitle>
            <CardDescription>
              Localisation des établissements de santé, ambulances en mouvement et missions
              d'urgence actives
            </CardDescription>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-ink-300">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-400" /> Hôpitaux
            </span>
            <span className="flex items-center gap-1.5 text-ink-300">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Ambulances libres
            </span>
            <span className="flex items-center gap-1.5 text-ink-300">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> En intervention
            </span>
          </div>
        </CardHeader>

        <MapView
          facilities={facilities}
          ambulances={ambulances}
          missions={activeMissions}
          height="450px"
        />
      </Card>

      {/* Graphiques & Tableaux opérationnels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Taux d'occupation des lits par catégorie */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Occupation des Lits par Spécialité</CardTitle>
              <CardDescription>
                Taux de remplissage des services critiques et de réanimation
              </CardDescription>
            </div>
          </CardHeader>

          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bedsChartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2a45" />
                <XAxis
                  dataKey="category"
                  stroke="#7d8bab"
                  fontSize={11}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                />
                <YAxis stroke="#7d8bab" fontSize={11} domain={[0, 100]} unit="%" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0b1220',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                  formatter={(val) => [`${val ?? 0} %`, 'Taux d’occupation']}
                />
                <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
                  {bedsChartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.rate > 85 ? '#f43f5e' : entry.rate > 70 ? '#fbbf24' : '#10b981'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Demandes urgentes de sang nécessitant une action */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Demandes de Sang en Cours</CardTitle>
              <CardDescription>Besoins de transfusion publiés par les hôpitaux</CardDescription>
            </div>
          </CardHeader>

          <div className="divide-y divide-white/[0.06] overflow-y-auto max-h-64">
            {bloodRequests.length === 0 ? (
              <div className="p-8 text-center text-xs text-ink-500">
                Aucune demande de sang en attente actuellement.
              </div>
            ) : (
              bloodRequests.slice(0, 6).map((req) => (
                <div key={req.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-9 h-9 rounded-xl bg-brand-500/15 border border-brand-500/30 text-brand-300 font-bold flex items-center justify-center shrink-0">
                      {req.blood_group}
                    </span>
                    <div className="truncate">
                      <div className="font-semibold text-ink-200 truncate">
                        {req.facility?.name || 'Hôpital'}
                      </div>
                      <div className="text-[11px] text-ink-400">
                        Besoin de <strong className="text-white">{req.units_remaining} poches</strong>{' '}
                        • {req.facility?.city}
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
        </Card>
      </div>
    </div>
  )
}
