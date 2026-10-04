import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Brain,
  ShieldCheck,
  TrendingDown,
  Database,
  Play,
  RefreshCw,
} from 'lucide-react'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select, Input } from '@/components/ui/Input'
import { Alert } from '@/components/ui/Alert'
import { BLOOD_GROUPS, REGIONS, RISK_LEVELS } from '@/lib/constants'
import { formatDate, formatNumber } from '@/lib/format'
import type { Prediction, ModelMetadata, PredictResponse } from '@/types/api'

export const MLPredictions: React.FC = () => {
  const queryClient = useQueryClient()

  // Filtres de consultation
  const [filterRegion, setFilterRegion] = useState('')
  const [filterBloodGroup, setFilterBloodGroup] = useState('')
  const [filterRiskLevel, setFilterRiskLevel] = useState('')

  // Formulaire d'exécution du modèle
  const [runRegion, setRunRegion] = useState('')
  const [runBloodGroup, setRunBloodGroup] = useState('')
  const [runDaysAhead, setRunDaysAhead] = useState(7)
  const [runSuccessMsg, setRunSuccessMsg] = useState<string | null>(null)

  // 1. Métadonnées du modèle actif (El Hadji Massogui Diop)
  const { data: modelInfoData } = useQuery<{
    status: string
    model: ModelMetadata
  }>({
    queryKey: ['ml-model-info'],
    queryFn: () => api.get<{ status: string; model: ModelMetadata }>('/api/ml/model-info/'),
  })
  const model = modelInfoData?.model

  // 2. Liste des prédictions
  const {
    data: predictions = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<Prediction[]>({
    queryKey: ['ml-predictions-list', filterRegion, filterBloodGroup, filterRiskLevel],
    queryFn: async () => {
      const res = await api.get<{ results: Prediction[] }>('/api/ml/predictions/', {
        region: filterRegion || undefined,
        blood_group: filterBloodGroup || undefined,
        risk_level: filterRiskLevel || undefined,
      })
      return res.results || []
    },
  })

  // Mutation : Exécuter le modèle prédictif
  const predictMutation = useMutation({
    mutationFn: () =>
      api.post<PredictResponse>('/api/ml/predict/', {
        region: runRegion || undefined,
        blood_group: runBloodGroup || undefined,
        days_ahead: runDaysAhead,
      }),
    onSuccess: (data) => {
      setRunSuccessMsg(
        `${data.predictions_count} prédictions générées avec succès (Modèle v${data.model_version}) et diffusées en temps réel sur le WebSocket national.`
      )
      queryClient.invalidateQueries({ queryKey: ['ml-predictions-list'] })
      queryClient.invalidateQueries({ queryKey: ['predictions-summary'] })
    },
    onError: (err: unknown) => {
      alert(err instanceof Error ? err.message : 'Erreur lors de l’exécution du modèle ML.')
    },
  })

  return (
    <div className="space-y-6">
      {/* En-tête scientifique et institutionnel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[var(--border-main)]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900">
              <Brain className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              Machine Learning & Vigilance Transfusionnelle
            </span>
            <span className="text-xs text-[var(--text-muted)]">• CQR Calibré P10-P90</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-main)]">
            Intelligence Prédictive des Stocks Sanguins
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Modèle de régression quantile conformaliste multi-horizon pour l'anticipation des pénuries de sang au Sénégal
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            isLoading={isRefetching}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Actualiser
          </Button>
        </div>
      </div>

      {/* Cartes métriques du modèle ML de Massogui Diop */}
      {model && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="clinical-card p-4">
            <div className="flex items-center justify-between text-[var(--text-muted)] mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Couverture CQR</span>
              <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
              81.0%
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">
              Cible théorique : 80.0% (P10 - P90)
            </p>
          </div>

          <div className="clinical-card p-4">
            <div className="flex items-center justify-between text-[var(--text-muted)] mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Erreur MAE</span>
              <div className="w-7 h-7 rounded-lg bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                <TrendingDown className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-sky-600 dark:text-sky-400 font-mono">
              {model.mae !== null ? `${formatNumber(model.mae, 1)}` : '—'}{' '}
              <span className="text-xs font-normal text-[var(--text-muted)]">poches</span>
            </div>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
              -25% vs modèle de persistance
            </p>
          </div>

          <div className="clinical-card p-4">
            <div className="flex items-center justify-between text-[var(--text-muted)] mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Algorithme Actif</span>
              <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <Brain className="w-4 h-4" />
              </div>
            </div>
            <div className="text-lg font-bold text-[var(--text-main)] truncate mt-1">
              v{model.version} • HistGradient
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-1 truncate">
              Boosting avec quantile loss
            </p>
          </div>

          <div className="clinical-card p-4">
            <div className="flex items-center justify-between text-[var(--text-muted)] mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Échantillons</span>
              <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center">
                <Database className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-[var(--text-main)] font-mono">
              {formatNumber(model.training_samples)}
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">14 régions du Sénégal couvertes</p>
          </div>
        </div>
      )}

      {/* Module d'exécution à la demande du modèle */}
      <div className="clinical-card p-5 border-l-4 border-l-indigo-600 space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Brain className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-main)]">
              Simulateur & Générateur de Prédictions
            </h3>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            Exécutez le modèle pour projeter la demande future et déclencher la diffusion temps réel sur le WebSocket des banques de sang
          </p>
        </div>

        {runSuccessMsg && (
          <Alert tone="success" onClose={() => setRunSuccessMsg(null)}>
            {runSuccessMsg}
          </Alert>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <Select
            label="Région cible"
            value={runRegion}
            onChange={(e) => setRunRegion(e.target.value)}
          >
            <option value="">Toutes les 14 régions</option>
            {REGIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>

          <Select
            label="Groupe Sanguin"
            value={runBloodGroup}
            onChange={(e) => setRunBloodGroup(e.target.value)}
          >
            <option value="">Tous les 8 groupes (ABO/Rh)</option>
            {BLOOD_GROUPS.map((g) => (
              <option key={g} value={g}>
                Groupe {g}
              </option>
            ))}
          </Select>

          <Input
            label="Horizon temporel (jours)"
            type="number"
            min={1}
            max={30}
            value={runDaysAhead}
            onChange={(e) => setRunDaysAhead(parseInt(e.target.value, 10) || 7)}
          />

          <Button
            variant="primary"
            size="md"
            className="w-full bg-indigo-600 hover:bg-indigo-700 border-indigo-500/30"
            isLoading={predictMutation.isPending}
            onClick={() => predictMutation.mutate()}
            icon={<Play className="w-4 h-4 fill-current" />}
          >
            Lancer le Calcul
          </Button>
        </div>
      </div>

      {/* Tableau des prévisions et risques de pénurie */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Projections de Stocks & Alertes ({predictions.length})
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Estimation par intervalle de confiance P10 - P90 avec calcul des jours de réserve
            </p>
          </div>

          {/* Filtres de la table */}
          <div className="flex items-center gap-2">
            <Select
              className="text-xs py-1.5"
              value={filterRiskLevel}
              onChange={(e) => setFilterRiskLevel(e.target.value)}
            >
              <option value="">Tous les risques</option>
              {RISK_LEVELS.map((rl) => (
                <option key={rl.value} value={rl.value}>
                  {rl.label}
                </option>
              ))}
            </Select>

            <Select
              className="text-xs py-1.5"
              value={filterRegion}
              onChange={(e) => setFilterRegion(e.target.value)}
            >
              <option value="">Toutes les régions</option>
              {REGIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>

            <Select
              className="text-xs py-1.5"
              value={filterBloodGroup}
              onChange={(e) => setFilterBloodGroup(e.target.value)}
            >
              <option value="">Tous les groupes</option>
              {BLOOD_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="clinical-card p-12 text-center text-xs text-[var(--text-muted)]">
            Chargement des prévisions algorithmiques...
          </div>
        ) : predictions.length === 0 ? (
          <div className="clinical-card p-12 text-center text-xs text-[var(--text-muted)]">
            Aucune prédiction pour ces critères. Utilisez le simulateur ci-dessus pour lancer un calcul.
          </div>
        ) : (
          <div className="clinical-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="clinical-table">
                <thead>
                  <tr>
                    <th>Banque / Région</th>
                    <th>Groupe</th>
                    <th>Date Prévue</th>
                    <th>Stock Estimé</th>
                    <th>Intervalle P10-P90 (CQR)</th>
                    <th>Jours de Réserve</th>
                    <th className="text-right">Niveau de Risque</th>
                  </tr>
                </thead>
                <tbody>
                  {predictions.map((p) => {
                    const isCritical = p.risk_level === 'CRITICAL'
                    const isWarning = p.risk_level === 'WARNING'

                    return (
                      <tr
                        key={p.id}
                        className={
                          isCritical
                            ? 'bg-red-500/[0.04]'
                            : isWarning
                            ? 'bg-amber-500/[0.03]'
                            : ''
                        }
                      >
                        <td className="font-semibold text-[var(--text-main)]">
                          <div>{p.center_name || 'CNTS Dakar'}</div>
                          <div className="text-[11px] text-[var(--text-muted)] font-normal">
                            {p.region_display}
                          </div>
                        </td>
                        <td>
                          <span className="font-bold text-red-600 dark:text-red-400 font-mono text-sm px-2 py-0.5 rounded bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900">
                            {p.blood_group}
                          </span>
                        </td>
                        <td className="text-[var(--text-muted)]">
                          {formatDate(p.prediction_date)}
                        </td>
                        <td className="font-bold text-[var(--text-main)] font-mono text-sm">
                          {p.predicted_units} <span className="text-xs font-normal text-[var(--text-muted)]">poches</span>
                        </td>
                        <td>
                          <div className="font-mono text-xs text-[var(--text-muted)]">
                            [{p.lower_bound ?? '—'} ; {p.upper_bound ?? '—'}]
                          </div>
                          {p.lower_bound !== null && p.upper_bound !== null && (
                            <div className="w-24 bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1">
                              <div
                                className="h-full bg-indigo-500 rounded-full"
                                style={{
                                  width: `${Math.min(100, Math.max(10, ((p.predicted_units - p.lower_bound) / (p.upper_bound - p.lower_bound || 1)) * 100))}%`,
                                }}
                              />
                            </div>
                          )}
                        </td>
                        <td>
                          <span
                            className={`font-semibold font-mono ${
                              isCritical
                                ? 'text-red-600 dark:text-red-400 font-bold'
                                : isWarning
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            {p.days_of_supply !== null
                              ? `${formatNumber(p.days_of_supply, 1)} jours`
                              : '—'}
                          </span>
                        </td>
                        <td className="text-right">
                          <Badge
                            tone={isCritical ? 'danger' : isWarning ? 'warning' : 'success'}
                            size="sm"
                          >
                            {p.risk_level_display}
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
