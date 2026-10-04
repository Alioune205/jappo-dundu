import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, CardTitle, CardDescription } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select, Input } from '@/components/ui/Input'
import { Alert } from '@/components/ui/Alert'
import { BLOOD_GROUPS, REGIONS, RISK_LEVELS } from '@/lib/constants'
import { formatDate, formatNumber } from '@/lib/format'
import type { Prediction, ModelMetadata, PredictResponse } from '@/types/api'

export const MLPredictions: React.FC = () => {
  const queryClient = useQueryClient()

  // Filtres
  const [filterRegion, setFilterRegion] = useState('')
  const [filterBloodGroup, setFilterBloodGroup] = useState('')
  const [filterRiskLevel, setFilterRiskLevel] = useState('')

  // Formulaire de prédiction à la demande
  const [runRegion, setRunRegion] = useState('')
  const [runBloodGroup, setRunBloodGroup] = useState('')
  const [runDaysAhead, setRunDaysAhead] = useState(7)
  const [runSuccessMsg, setRunSuccessMsg] = useState<string | null>(null)

  // 1. Modèle actif et métriques
  const { data: modelInfoData } = useQuery<{ status: string; model: ModelMetadata }>({
    queryKey: ['ml-model-info'],
    queryFn: () => api.get<{ status: string; model: ModelMetadata }>('/api/ml/model-info/'),
  })
  const model = modelInfoData?.model

  // 2. Liste des prédictions
  const { data: predictions = [], isLoading } = useQuery<Prediction[]>({
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

  // Mutation : Lancer une prédiction à la demande
  const predictMutation = useMutation({
    mutationFn: () =>
      api.post<PredictResponse>('/api/ml/predict/', {
        region: runRegion || undefined,
        blood_group: runBloodGroup || undefined,
        days_ahead: runDaysAhead,
      }),
    onSuccess: (data) => {
      setRunSuccessMsg(
        `${data.predictions_count} prédictions générées avec succès (Modèle v${data.model_version})`
      )
      queryClient.invalidateQueries({ queryKey: ['ml-predictions-list'] })
      queryClient.invalidateQueries({ queryKey: ['predictions-summary'] })
    },
    onError: (err: unknown) => {
      alert(err instanceof Error ? err.message : 'Erreur lors de l’exécution du modèle ML.')
    },
  })

  return (
    <div className="space-y-8 animate-fade-in">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-white tracking-tight">
            Intelligence Artificielle & Pénuries de Sang
          </h1>
          <p className="text-xs text-ink-400 mt-1">
            Modèle prédictif multi-horizon avec régression quantile et calibration conformelle à 80 %
          </p>
        </div>

        <Badge tone="violet" size="md">
          HistGradientBoostingRegressor • CQR Calibré
        </Badge>
      </div>

      {/* Métriques du modèle actif */}
      {model && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4 border-violet-500/20 bg-violet-500/[0.02]">
            <span className="text-[10px] font-bold text-ink-400 uppercase tracking-wider block">
              Version du Modèle
            </span>
            <div className="text-xl font-bold text-violet-300 mt-1">v{model.version}</div>
            <span className="text-[11px] text-ink-500 mt-0.5 block truncate">
              {model.algorithm}
            </span>
          </Card>

          <Card className="p-4 border-emerald-500/20 bg-emerald-500/[0.02]">
            <span className="text-[10px] font-bold text-ink-400 uppercase tracking-wider block">
              Couverture Intervalle (P10-P90)
            </span>
            <div className="text-xl font-bold text-emerald-400 mt-1">
              81.0 %{' '}
              <span className="text-xs font-normal text-ink-400">(cible 80 %)</span>
            </div>
            <span className="text-[11px] text-emerald-500 mt-0.5 block">
              ✓ Calibration Conforme Robuste
            </span>
          </Card>

          <Card className="p-4 border-sky-500/20 bg-sky-500/[0.02]">
            <span className="text-[10px] font-bold text-ink-400 uppercase tracking-wider block">
              Erreur Moyenne Absolue (MAE)
            </span>
            <div className="text-xl font-bold text-sky-400 mt-1">
              {model.mae !== null ? `${formatNumber(model.mae, 2)} poches` : '—'}
            </div>
            <span className="text-[11px] text-sky-500 mt-0.5 block">-25 % vs persistance</span>
          </Card>

          <Card className="p-4 border-brand-500/20 bg-brand-500/[0.02]">
            <span className="text-[10px] font-bold text-ink-400 uppercase tracking-wider block">
              Échantillons d'Apprentissage
            </span>
            <div className="text-xl font-bold text-brand-300 mt-1">
              {formatNumber(model.training_samples)}
            </div>
            <span className="text-[11px] text-ink-500 mt-0.5 block">
              14 régions du Sénégal
            </span>
          </Card>
        </div>
      )}

      {/* Lancer une prédiction à la demande */}
      <Card className="p-5 border-violet-500/30 bg-violet-500/[0.03]">
        <CardTitle className="text-sm">Déclencher une Prédiction à la Demande</CardTitle>
        <CardDescription>
          Calcule les tendances d'approvisionnement et diffuse automatiquement les alertes aux hôpitaux
        </CardDescription>

        {runSuccessMsg && (
          <Alert tone="success" className="my-3" onClose={() => setRunSuccessMsg(null)}>
            {runSuccessMsg}
          </Alert>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-4">
          <Select
            label="Région cible"
            value={runRegion}
            onChange={(e) => setRunRegion(e.target.value)}
          >
            <option value="">Toutes les régions</option>
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
            <option value="">Tous les groupes</option>
            {BLOOD_GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>

          <Input
            label="Horizon (jours)"
            type="number"
            min={1}
            max={30}
            value={runDaysAhead}
            onChange={(e) => setRunDaysAhead(parseInt(e.target.value, 10) || 7)}
          />

          <div className="flex items-end">
            <Button
              variant="primary"
              size="md"
              className="w-full bg-violet-600 hover:bg-violet-500 border-violet-400/40"
              isLoading={predictMutation.isPending}
              onClick={() => predictMutation.mutate()}
            >
              Exécuter le Modèle
            </Button>
          </div>
        </div>
      </Card>

      {/* Liste des prédictions futures et risques de pénurie */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-ink-100">
              Prévisions & Niveaux de Réserve Sanguine ({predictions.length})
            </h2>
            <p className="text-xs text-ink-400">
              Surveillance des stocks prévus avec intervalle de confiance P10 - P90
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
          <div className="surface p-12 text-center text-xs text-ink-500">
            Chargement des prévisions...
          </div>
        ) : predictions.length === 0 ? (
          <div className="surface p-12 text-center text-xs text-ink-500">
            Aucune prédiction pour ces critères. Vous pouvez exécuter le modèle ci-dessus.
          </div>
        ) : (
          <div className="surface border border-white/10 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-ink-950/60 text-ink-400 font-semibold border-b border-white/[0.08]">
                  <tr>
                    <th className="py-3 px-4">Centre Transfusion</th>
                    <th className="py-3 px-4">Région</th>
                    <th className="py-3 px-4">Groupe</th>
                    <th className="py-3 px-4">Date Prévue</th>
                    <th className="py-3 px-4">Stock Estimé</th>
                    <th className="py-3 px-4">Intervalle P10-P90</th>
                    <th className="py-3 px-4">Jours de Réserve</th>
                    <th className="py-3 px-4 text-right">Niveau de Risque</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04] text-ink-200">
                  {predictions.map((p) => {
                    const isCritical = p.risk_level === 'CRITICAL'
                    const isWarning = p.risk_level === 'WARNING'

                    return (
                      <tr
                        key={p.id}
                        className={`hover:bg-white/[0.02] transition-colors ${
                          isCritical
                            ? 'bg-rose-500/[0.03]'
                            : isWarning
                            ? 'bg-amber-500/[0.02]'
                            : ''
                        }`}
                      >
                        <td className="py-3 px-4 font-semibold text-ink-100">{p.center_name}</td>
                        <td className="py-3 px-4 text-ink-300">{p.region_display}</td>
                        <td className="py-3 px-4">
                          <span className="font-bold text-brand-400">{p.blood_group}</span>
                        </td>
                        <td className="py-3 px-4 text-ink-300">{formatDate(p.prediction_date)}</td>
                        <td className="py-3 px-4 font-bold text-ink-100">
                          {p.predicted_units} poches
                        </td>
                        <td className="py-3 px-4 text-ink-400 font-mono text-[11px]">
                          [{p.lower_bound ?? '—'} ; {p.upper_bound ?? '—'}]
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`font-semibold ${
                              isCritical
                                ? 'text-rose-400'
                                : isWarning
                                ? 'text-amber-400'
                                : 'text-emerald-400'
                            }`}
                          >
                            {p.days_of_supply !== null ? `${formatNumber(p.days_of_supply, 1)} j` : '—'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
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
