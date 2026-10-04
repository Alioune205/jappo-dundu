import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Brain, Play, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import { RealtimeEvent } from '@/lib/realtimeEvents'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select, Input } from '@/components/ui/Input'
import { Alert } from '@/components/ui/Alert'
import { StatCard } from '@/components/ui/StatCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton, EmptyState } from '@/components/ui/Skeleton'
import { BLOOD_GROUPS, REGIONS, RISK_LEVELS, toneOf } from '@/lib/constants'
import { formatDate, formatNumber, formatPercent } from '@/lib/format'
import type { Prediction, ModelMetadata, PredictionJob } from '@/types/api'
import { QK } from '@/lib/queryKeys'

/** Intervalle de suivi d'un calcul de prévision en arrière-plan (ms). */
const JOB_POLL_MS = 1500

export const MLPredictions: React.FC = () => {
  const queryClient = useQueryClient()

  // Mises à jour poussées par le serveur (regroupées, voir useRealtimeRefresh).
  useRealtimeRefresh([
    { events: [RealtimeEvent.predictionUpdate], queryKeys: [QK.mlPredictionsList, QK.predictionsSummary] },
  ])

  // Filtres de consultation
  const [filterRegion, setFilterRegion] = useState('')
  const [filterBloodGroup, setFilterBloodGroup] = useState('')
  const [filterRiskLevel, setFilterRiskLevel] = useState('')

  // Formulaire d'exécution du modèle
  const [runRegion, setRunRegion] = useState('')
  const [runBloodGroup, setRunBloodGroup] = useState('')
  const [runDaysAhead, setRunDaysAhead] = useState(7)
  const [runMsg, setRunMsg] = useState<{ type: 'success' | 'danger'; text: string } | null>(null)

  // 1. Métadonnées du modèle actif (El Hadji Massogui Diop)
  const { data: modelInfoData } = useQuery<{
    status: string
    model: ModelMetadata
  }>({
    queryKey: QK.mlModelInfo,
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
    queryKey: [...QK.mlPredictionsList, filterRegion, filterBloodGroup, filterRiskLevel],
    queryFn: async () => {
      const res = await api.get<{ results: Prediction[] }>('/api/ml/predictions/', {
        region: filterRegion || undefined,
        blood_group: filterBloodGroup || undefined,
        risk_level: filterRiskLevel || undefined,
      })
      return res.results || []
    },
  })

  // Prédiction à la demande : le serveur répond tout de suite (202) et
  // calcule en arrière-plan ; on suit la tâche jusqu'à son terme.
  const [jobId, setJobId] = useState<string | null>(null)

  const predictMutation = useMutation({
    mutationFn: () =>
      api.post<PredictionJob>('/api/ml/predict/', {
        region: runRegion || undefined,
        blood_group: runBloodGroup || undefined,
        days_ahead: runDaysAhead,
      }),
    onSuccess: (job) => setJobId(job.job_id),
    onError: (err: unknown) => {
      setRunMsg({
        type: 'danger',
        text: err instanceof Error ? err.message : 'Erreur lors de l’exécution du modèle.',
      })
    },
  })

  const { data: job } = useQuery<PredictionJob>({
    queryKey: [...QK.mlPredictJob, jobId],
    queryFn: async () => {
      const current = await api.get<PredictionJob>(`/api/ml/predict/${jobId}/`)
      // Fin de tâche : message, rafraîchissement des listes, arrêt du suivi.
      if (current.status === 'succeeded') {
        setRunMsg({
          type: 'success',
          text: `${current.predictions_count ?? 0} prévisions générées (modèle v${current.model_version ?? '?'}).`,
        })
        queryClient.invalidateQueries({ queryKey: QK.mlPredictionsList })
        queryClient.invalidateQueries({ queryKey: QK.predictionsSummary })
        setJobId(null)
      } else if (current.status === 'failed') {
        setRunMsg({ type: 'danger', text: current.message || 'Le calcul a échoué.' })
        setJobId(null)
      }
      return current
    },
    enabled: jobId !== null,
    refetchInterval: JOB_POLL_MS,
  })

  const isComputing = predictMutation.isPending || jobId !== null

  // Métriques d'évaluation réelles du modèle actif (période de test, voir ml/services/trainer.py).
  const metrics = (model?.metrics ?? {}) as Record<string, unknown>
  const metric = (key: string) => (typeof metrics[key] === 'number' ? (metrics[key] as number) : null)
  const coverage = metric('interval_coverage')
  const skill = metric('skill_vs_baseline')
  const baselineMae = metric('baseline_mae')
  const criticalRecall = metric('critical_recall')
  const series = metric('series')

  return (
    <div className="space-y-5">
      <PageHeader
        title="Prévisions de pénurie"
        description="Projection des stocks de sang par banque et par groupe, avec intervalle P10–P90 et jours de réserve."
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            isLoading={isRefetching}
            icon={<RefreshCw className="h-3.5 w-3.5" />}
          >
            Actualiser
          </Button>
        }
      />

      {model && (
        <section aria-label="Modèle actif">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              title="Couverture P10–P90"
              value={formatPercent(coverage, 1)}
              unit="cible 80 %"
              trend={coverage == null ? undefined : coverage >= 0.78 ? 'Calibré' : 'Sous la cible'}
              trendTone={coverage != null && coverage < 0.78 ? 'warning' : 'success'}
              description="Sur la période de test"
            />
            <StatCard
              title="Erreur moyenne (MAE)"
              value={formatNumber(model.mae, 2)}
              unit="poches"
              trend={skill == null ? undefined : `${skill >= 0 ? '−' : '+'}${formatPercent(Math.abs(skill))} vs persistance`}
              trendTone={skill != null && skill < 0 ? 'warning' : 'success'}
              description={baselineMae == null ? 'Référence indisponible' : `Persistance : ${formatNumber(baselineMae, 2)}`}
            />
            <StatCard
              title="Pénuries détectées"
              value={formatPercent(criticalRecall)}
              unit="rappel"
              description="Pénuries réelles signalées à l'avance"
            />
            <StatCard
              title="Modèle actif"
              value={`v${model.version}`}
              unit={model.algorithm}
              description={`${formatNumber(model.training_samples)} échantillons${series != null ? ` · ${series} séries` : ''}`}
            />
          </div>
          <p className="mt-2 text-2xs text-subtle">
            Entraîné le <span className="num">{formatDate(model.trained_at)}</span> · régression quantile conformelle
            (CQR) · conception El Hadji Massogui Diop
          </p>
        </section>
      )}

      <section className="rounded-md border border-line bg-surface">
        <div className="border-b border-line px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
            <Brain className="h-4 w-4 text-muted" aria-hidden="true" />
            Lancer une prévision
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            Les nouvelles prévisions sont diffusées en temps réel aux banques de sang.
          </p>
        </div>

        <div className="space-y-3 px-4 py-3">
          {isComputing && (
            <Alert tone="info">
              Calcul en cours sur le serveur ({job?.status === 'running' ? 'exécution' : 'en file d’attente'}).
              Vous pouvez continuer à travailler : les résultats s’afficheront ici.
            </Alert>
          )}
          {runMsg && !isComputing && (
            <Alert tone={runMsg.type} onClose={() => setRunMsg(null)}>
              {runMsg.text}
            </Alert>
          )}

          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-4">
            <Select label="Région" value={runRegion} onChange={(e) => setRunRegion(e.target.value)}>
              <option value="">Toutes</option>
              {REGIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
            <Select label="Groupe sanguin" value={runBloodGroup} onChange={(e) => setRunBloodGroup(e.target.value)}>
              <option value="">Tous</option>
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
            <Button
              variant="primary"
              className="w-full"
              isLoading={isComputing}
              onClick={() => {
                setRunMsg(null)
                predictMutation.mutate()
              }}
              icon={<Play className="h-3.5 w-3.5" />}
            >
              Calculer
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-fg">
              Prévisions <span className="num ml-1 font-normal text-muted">{predictions.length}</span>
            </h2>
            <p className="mt-0.5 text-xs text-muted">Stock estimé, intervalle P10–P90 et jours de réserve.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 lg:w-[28rem]">
            <Select label="Risque" value={filterRiskLevel} onChange={(e) => setFilterRiskLevel(e.target.value)}>
              <option value="">Tous</option>
              {RISK_LEVELS.map((rl) => (
                <option key={rl.value} value={rl.value}>
                  {rl.label}
                </option>
              ))}
            </Select>
            <Select label="Région" value={filterRegion} onChange={(e) => setFilterRegion(e.target.value)}>
              <option value="">Toutes</option>
              {REGIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
            <Select label="Groupe" value={filterBloodGroup} onChange={(e) => setFilterBloodGroup(e.target.value)}>
              <option value="">Tous</option>
              {BLOOD_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2 rounded-md border border-line bg-surface p-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : predictions.length === 0 ? (
          <EmptyState
            title="Aucune prévision"
            description="Aucune prévision pour ces critères. Lancez un calcul ci-dessus."
          />
        ) : (
          <div className="overflow-hidden rounded-md border border-line bg-surface">
            <div className="overflow-x-auto">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th scope="col">Banque</th>
                    <th scope="col">Groupe</th>
                    <th scope="col">Date</th>
                    <th scope="col" className="text-right">Stock estimé</th>
                    <th scope="col">Intervalle P10–P90</th>
                    <th scope="col" className="text-right">Réserve</th>
                    <th scope="col">Risque</th>
                  </tr>
                </thead>
                <tbody>
                  {predictions.map((p) => {
                    const level = p.risk_level
                    return (
                      <tr
                        key={p.id}
                        data-severity={level === 'CRITICAL' ? 'critical' : level === 'WARNING' ? 'warning' : undefined}
                      >
                        <td className="w-full max-w-0">
                          <div className="truncate font-medium text-fg">{p.center_name || '—'}</div>
                          <div className="truncate text-2xs text-muted">{p.region_display}</div>
                        </td>
                        <td className="num font-medium text-fg">{p.blood_group}</td>
                        <td className="num whitespace-nowrap text-muted">{formatDate(p.prediction_date)}</td>
                        <td className="num whitespace-nowrap text-right text-fg">
                          {formatNumber(p.predicted_units)}
                          <span className="ml-1 text-2xs text-muted">poches</span>
                        </td>
                        <td className="whitespace-nowrap">
                          <IntervalBar lower={p.lower_bound} upper={p.upper_bound} point={p.predicted_units} />
                        </td>
                        <td
                          className={`num whitespace-nowrap text-right ${
                            level === 'CRITICAL' ? 'text-critical' : level === 'WARNING' ? 'text-warning' : 'text-fg'
                          }`}
                        >
                          {p.days_of_supply !== null ? `${formatNumber(p.days_of_supply, 1)} j` : '—'}
                        </td>
                        <td>
                          <Badge tone={toneOf(RISK_LEVELS, level)} size="sm">
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
      </section>
    </div>
  )
}

/** Intervalle P10–P90 : bornes chiffrées et position de l'estimation centrale. */
const IntervalBar: React.FC<{ lower: number | null; upper: number | null; point: number }> = ({
  lower,
  upper,
  point,
}) => {
  if (lower === null || upper === null) return <span className="text-subtle">—</span>
  const span = upper - lower || 1
  const position = Math.min(100, Math.max(0, ((point - lower) / span) * 100))
  return (
    <div className="flex items-center gap-2">
      <span className="num w-8 text-right text-xs text-muted">{formatNumber(lower)}</span>
      <div className="relative h-1 w-20 rounded-full bg-raised" aria-hidden="true">
        <span
          className="absolute top-1/2 h-2.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg"
          style={{ left: `${position}%` }}
        />
      </div>
      <span className="num w-8 text-xs text-muted">{formatNumber(upper)}</span>
    </div>
  )
}
