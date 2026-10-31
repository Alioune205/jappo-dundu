import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  ArrowRight,
  BarChart3,
  BrainCircuit,
  Clock,
  Droplets,
  HeartHandshake,
  MapPin,
  Plus,
  Users,
} from 'lucide-react'
import { Link } from 'react-router'
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
import { api } from '@/lib/api'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { StatCard } from '@/components/ui/StatCard'
import { RadialGauge } from '@/components/ui/RadialGauge'
import { PageHeader } from '@/components/ui/PageHeader'
import { BLOOD_GROUPS } from '@/lib/constants'
import { useNow } from '@/lib/useNow'
import { useThemeColors } from '@/lib/useThemeColors'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import { BLOOD_REQUEST_EVENTS, RealtimeEvent } from '@/lib/realtimeEvents'
import { formatNumber, formatRelative, formatShortDate } from '@/lib/format'
import { QK } from '@/lib/queryKeys'
import type { BloodGroup, BloodRequest, BloodStockRecord, FacilitySummary, Prediction, RiskLevel } from '@/types/api'

/** Horizon des alertes de pénurie affichées sur l'accueil. */
const OUTLOOK_DAYS = 7
const RISK_RANK: Record<RiskLevel, number> = { CRITICAL: 0, WARNING: 1, NORMAL: 2 }
const URGENCY_RANK = { critical: 0, urgent: 1, normal: 2 } as const

interface GroupOutlook {
  units: number | null
  risk: RiskLevel | null
  riskDate: string | null
  daysOfSupply: number | null
}

/**
 * Tableau de bord de l'administrateur du sang : demandes en cours de son
 * périmètre (le CNTS couvre sa région), stocks par groupe, visualisations
 * analytiques et pénuries prévues.
 */
export const BloodManagerDashboard: React.FC<{ facility: FacilitySummary }> = ({ facility }) => {
  const now = useNow()
  const colors = useThemeColors()
  const [selectedGroup, setSelectedGroup] = useState<BloodGroup | null>(null)

  // 1. Demandes ouvertes (périmètre fixé par le serveur)
  const { data: requests = [], isLoading } = useQuery<BloodRequest[]>({
    queryKey: [...QK.bloodRequests, 'open'],
    queryFn: async () =>
      (await api.get<{ results: BloodRequest[] }>('/api/sang/requests/', { status: 'open' })).results || [],
  })

  // 2. Dernier relevé de stock de la région (relevé de la veille au plus tard)
  const { data: stocks = [] } = useQuery<BloodStockRecord[]>({
    queryKey: [...QK.bloodStocks, facility.region],
    queryFn: async () =>
      (await api.get<{ results: BloodStockRecord[] }>('/api/ml/stocks/', { region: facility.region, days: 1 }))
        .results || [],
  })

  // 3. Pénuries prévues dans la région (critiques, puis en vigilance)
  const { data: risks = [] } = useQuery<Prediction[]>({
    queryKey: [...QK.mlPredictionsList, 'outlook', facility.region],
    queryFn: async () => {
      const [critical, warning] = await Promise.all(
        (['CRITICAL', 'WARNING'] as const).map(
          async (risk_level) =>
            (
              await api.get<{ results: Prediction[] }>('/api/ml/predictions/', {
                region: facility.region,
                risk_level,
              })
            ).results || []
        )
      )
      return [...critical, ...warning]
    },
  })

  useRealtimeRefresh([
    { events: BLOOD_REQUEST_EVENTS, queryKeys: [QK.bloodRequests] },
    { events: [RealtimeEvent.predictionUpdate], queryKeys: [QK.mlPredictionsList] },
  ])

  const open = useMemo(
    () =>
      [...requests].sort(
        (a, b) =>
          URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] ||
          (a.needed_by ?? '9999').localeCompare(b.needed_by ?? '9999')
      ),
    [requests]
  )
  const vital = open.filter((r) => r.urgency === 'critical')
  const urgentReqs = open.filter((r) => r.urgency === 'urgent')
  const normalReqs = open.filter((r) => r.urgency === 'normal')
  const missingUnits = open.reduce((acc, r) => acc + r.units_remaining, 0)
  const collectedUnits = open.reduce((acc, r) => acc + r.units_collected, 0)
  const neededUnits = open.reduce((acc, r) => acc + r.units_needed, 0)
  const donorsComing = open.reduce((acc, r) => acc + (r.response_counts?.accepted ?? 0), 0)

  // Stocks et risques par groupe sanguin
  const latestDate = stocks.reduce<string | null>((max, s) => (!max || s.date > max ? s.date : max), null)
  const simulated = stocks.some((s) => s.source === 'synthetic')
  const horizon = new Date(now + OUTLOOK_DAYS * 86_400_000).toISOString().slice(0, 10)
  const outlook = useMemo(() => {
    const byGroup = new Map<BloodGroup, GroupOutlook>(
      BLOOD_GROUPS.map((g) => [g, { units: null, risk: null, riskDate: null, daysOfSupply: null }])
    )
    for (const s of stocks) {
      if (s.date !== latestDate) continue
      const entry = byGroup.get(s.blood_group)!
      entry.units = (entry.units ?? 0) + s.units_available
    }
    for (const p of risks) {
      if (p.prediction_date > horizon) continue
      const entry = byGroup.get(p.blood_group)!
      const worse = !entry.risk || RISK_RANK[p.risk_level] < RISK_RANK[entry.risk]
      const sooner = entry.risk === p.risk_level && entry.riskDate !== null && p.prediction_date < entry.riskDate
      if (worse || sooner) {
        entry.risk = p.risk_level
        entry.riskDate = p.prediction_date
        entry.daysOfSupply = p.days_of_supply
      }
    }
    return byGroup
  }, [stocks, risks, latestDate, horizon])

  const maxStockUnits = useMemo(() => {
    let max = 1
    for (const g of BLOOD_GROUPS) {
      const u = outlook.get(g)?.units ?? 0
      if (u > max) max = u
    }
    return max
  }, [outlook])

  const stockChartData = useMemo(
    () =>
      BLOOD_GROUPS.map((g) => {
        const o = outlook.get(g)!
        return {
          group: g.replace('-', '−'),
          rawGroup: g,
          units: o.units ?? 0,
          risk: o.risk,
          days: o.daysOfSupply,
        }
      }),
    [outlook]
  )

  const criticalGroups = BLOOD_GROUPS.filter((g) => outlook.get(g)?.risk === 'CRITICAL')
  const filteredOpen = selectedGroup ? open.filter((r) => r.blood_group === selectedGroup) : open
  const alerts = useMemo(
    () =>
      risks
        .filter((p) => p.prediction_date <= horizon && (!selectedGroup || p.blood_group === selectedGroup))
        .sort(
          (a, b) =>
            RISK_RANK[a.risk_level] - RISK_RANK[b.risk_level] || a.prediction_date.localeCompare(b.prediction_date)
        )
        .slice(0, 6),
    [risks, horizon, selectedGroup]
  )

  const barColorForRisk = (risk: RiskLevel | null) =>
    risk === 'CRITICAL' ? colors.critical : risk === 'WARNING' ? colors.warning : colors.ok

  return (
    <div className="space-y-6">
      <PageHeader
        title={facility.name}
        description={
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            Région de {facility.region_display}
          </span>
        }
        actions={
          <Link
            to="/blood"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-brand px-4 text-sm font-semibold text-on-brand shadow-sm transition-all hover:bg-brand-strong"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Nouvelle demande
          </Link>
        }
      />

      {criticalGroups.length > 0 && (
        <Alert tone="danger" title="Pénurie prévue">
          Stock critique prévu d’ici {OUTLOOK_DAYS} jours pour {criticalGroups.join(', ')} dans la région. Pensez à
          lancer une collecte ou une demande ciblée.
        </Alert>
      )}

      {/* Rangée KPI Bento : Carte Hero rouge sang + 3 indicateurs clés */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Demandes ouvertes"
          accent="red"
          variant="hero"
          stagger={0}
          icon={<Droplets className="h-5 w-5" />}
          value={open.length}
          badge={vital.length > 0 ? `${vital.length} vitale${vital.length > 1 ? 's' : ''}` : undefined}
          badgeTone="danger"
          trend={vital.length > 0 ? 'Urgence vitale en cours' : 'Aucune urgence vitale'}
          trendTone={vital.length > 0 ? 'danger' : 'success'}
        />
        <StatCard
          title="Poches manquantes"
          accent="yellow"
          stagger={1}
          icon={<HeartHandshake className="h-5 w-5" />}
          value={formatNumber(missingUnits)}
          unit="poches"
          progress={
            neededUnits > 0
              ? {
                  value: collectedUnits,
                  max: neededUnits,
                  tone: missingUnits > 0 ? 'warning' : 'success',
                }
              : undefined
          }
          description="Sur l’ensemble des demandes ouvertes"
        />
        <StatCard
          title="Donneurs en route"
          accent="green"
          stagger={2}
          icon={<Users className="h-5 w-5" />}
          value={donorsComing}
          trend={donorsComing > 0 ? 'Ont accepté de venir' : 'Aucun donneur annoncé'}
          trendTone={donorsComing > 0 ? 'success' : 'neutral'}
        />
        <StatCard
          title="Groupes en pénurie"
          accent="blue"
          stagger={3}
          icon={<BrainCircuit className="h-5 w-5" />}
          value={criticalGroups.length}
          unit={`/ ${BLOOD_GROUPS.length}`}
          trend={`Prévision à ${OUTLOOK_DAYS} jours`}
          trendTone={criticalGroups.length > 0 ? 'danger' : 'success'}
        />
      </div>

      {/* Matrice interactive des stocks par groupe sanguin */}
      <section className="panel dash-panel-in overflow-hidden" style={{ '--stagger': 1 } as React.CSSProperties}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-fg">Stock de la région par groupe</h2>
            <p className="text-xs text-muted">
              {latestDate ? `Relevé du ${formatShortDate(latestDate)}` : 'Aucun relevé récent'}
              {simulated ? ' · données simulées (en attente de l’historique du CNTS)' : ''}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {selectedGroup && (
              <button
                type="button"
                onClick={() => setSelectedGroup(null)}
                className="cursor-pointer rounded-full border border-brand/30 bg-brand-soft px-2.5 py-0.5 text-2xs font-semibold text-brand"
              >
                Filtre : {selectedGroup} ✕
              </button>
            )}
            <Link to="/ml" className="flex items-center gap-1 text-xs font-medium text-muted hover:text-fg">
              Prévisions <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
        <ul className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
          {BLOOD_GROUPS.map((group) => {
            const o = outlook.get(group)!
            const fillPct = o.units != null ? Math.min(100, Math.max(6, Math.round((o.units / maxStockUnits) * 100))) : 0
            const isSelected = selectedGroup === group
            const barTone =
              o.risk === 'CRITICAL' ? 'bg-critical' : o.risk === 'WARNING' ? 'bg-warning' : 'bg-ok'

            return (
              <li
                key={group}
                onClick={() => setSelectedGroup((cur) => (cur === group ? null : group))}
                className={`flex cursor-pointer flex-col gap-1.5 bg-surface px-5 py-4 transition-colors hover:bg-raised/50 ${
                  isSelected ? 'ring-2 ring-inset ring-brand' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="num text-lg font-bold text-fg">{group.replace('-', '−')}</span>
                  {o.risk === 'CRITICAL' ? (
                    <Badge tone="danger" size="sm">
                      Critique
                    </Badge>
                  ) : o.risk === 'WARNING' ? (
                    <Badge tone="warning" size="sm">
                      Vigilance
                    </Badge>
                  ) : (
                    <Badge tone="success" size="sm">
                      Stable
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted">
                  <span className="num text-base font-semibold text-fg">
                    {o.units === null ? '—' : formatNumber(o.units)}
                  </span>{' '}
                  poches
                </p>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-raised" aria-hidden="true">
                  <div className={`bar-origin-left h-full rounded-full ${barTone}`} style={{ width: `${fillPct}%` }} />
                </div>
                <p className="text-2xs text-muted">
                  {o.risk && o.riskDate
                    ? `${o.risk === 'CRITICAL' ? 'Critique' : 'Bas'} le ${formatShortDate(o.riskDate)}${
                        o.daysOfSupply != null ? ` · ${formatNumber(o.daysOfSupply, 1)} j de stock` : ''
                      }`
                    : `Pas de risque prévu à ${OUTLOOK_DAYS} j`}
                </p>
              </li>
            )
          })}
        </ul>
      </section>

      {/* Section Data Visualization : Profil des stocks par groupe + Couverture des urgences */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <section
          className="panel dash-panel-in flex flex-col justify-between xl:col-span-7"
          style={{ '--stagger': 2 } as React.CSSProperties}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
                <BarChart3 className="h-4 w-4 text-accent-red" aria-hidden="true" />
                Niveau des réserves par groupe sanguin
              </h2>
              <p className="text-2xs text-muted">
                Unités disponibles dans la région de {facility.region_display} colorées selon le risque à {OUTLOOK_DAYS} j
              </p>
            </div>
            <span className="text-2xs text-muted">Unité : poches</span>
          </div>

          <div className="h-60 w-full px-3 pb-2 pt-4">
            {stocks.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-muted">
                Aucun relevé de stock disponible pour tracer la répartition.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stockChartData} margin={{ top: 8, right: 12, left: -16, bottom: 4 }}>
                  <CartesianGrid stroke={colors.line} strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="group"
                    tick={{ fill: colors.fg, fontWeight: 600 }}
                    tickLine={false}
                    axisLine={{ stroke: colors.line }}
                    fontSize={11}
                  />
                  <YAxis
                    tick={{ fill: colors.muted }}
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    allowDecimals={false}
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
                    formatter={(val) => [`${val ?? 0} poches`, 'Stock régional']}
                  />
                  <Bar dataKey="units" radius={[8, 8, 0, 0]} maxBarSize={36}>
                    {stockChartData.map((entry) => (
                      <Cell key={entry.rawGroup} fill={barColorForRisk(entry.risk)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-raised/35 px-5 py-2.5 text-2xs text-muted">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-critical" /> Critique à 7 j
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-warning" /> Vigilance
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-ok" /> Stable
              </span>
            </div>
            <span>Cliquez sur une carte de groupe ci-dessus pour filtrer</span>
          </div>
        </section>

        <section
          className="panel dash-panel-in flex flex-col justify-between xl:col-span-5"
          style={{ '--stagger': 3 } as React.CSSProperties}
        >
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
                <Activity className="h-4 w-4 text-brand" aria-hidden="true" />
                Structure des demandes actives
              </h2>
              <p className="text-2xs text-muted">Répartition par degré d’urgence clinique</p>
            </div>
            <Badge tone={vital.length > 0 ? 'danger' : 'success'} size="sm">
              {vital.length > 0 ? 'Priorité vitale' : 'Nominal'}
            </Badge>
          </div>

          <div className="flex flex-1 flex-col justify-center p-5">
            {open.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted">Aucune demande active à analyser.</p>
            ) : (
              <RadialGauge
                mode="donut"
                size={136}
                centerValue={`${neededUnits > 0 ? Math.round((collectedUnits / neededUnits) * 100) : 0} %`}
                centerLabel="Taux couvert"
                segments={[
                  { label: 'Urgence vitale', value: vital.length, color: colors.critical, unit: 'dem.' },
                  { label: 'Urgente', value: urgentReqs.length, color: colors.warning, unit: 'dem.' },
                  { label: 'Normale', value: normalReqs.length, color: colors.info, unit: 'dem.' },
                ]}
              />
            )}
          </div>

          <div className="flex items-center justify-between border-t border-line bg-raised/35 px-5 py-2.5 text-2xs text-muted">
            <span>Poches collectées sur les demandes ouvertes</span>
            <span className="num font-semibold text-fg">{`${collectedUnits} collectées / ${neededUnits} demandées`}</span>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.5fr_1fr]">
        {/* Demandes en cours */}
        <section className="panel dash-panel-in" style={{ '--stagger': 4 } as React.CSSProperties}>
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h2 className="text-sm font-semibold text-fg">
              Demandes en cours <span className="num ml-1 font-normal text-muted">{filteredOpen.length}</span>
            </h2>
            <Link to="/blood" className="flex items-center gap-1 text-xs font-medium text-muted hover:text-fg">
              Gérer <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {isLoading ? (
            <p className="px-5 py-10 text-center text-xs text-muted">Chargement des demandes…</p>
          ) : filteredOpen.length === 0 ? (
            <p className="px-5 py-10 text-center text-xs text-muted">Aucune demande ouverte.</p>
          ) : (
            <ul className="divide-y divide-line">
              {filteredOpen.slice(0, 6).map((r) => {
                const pct = r.units_needed > 0 ? Math.round((r.units_collected / r.units_needed) * 100) : 0
                return (
                  <li key={r.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-3.5 transition-colors hover:bg-raised/35">
                    <span className="num flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-red/10 text-sm font-bold text-accent-red">
                      {r.blood_group.replace('-', '−')}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-fg">{r.facility?.name}</p>
                      <p className="text-xs text-muted">
                        <span className="num">
                          {r.units_collected} / {r.units_needed}
                        </span>{' '}
                        poches · {r.response_counts?.accepted ?? 0} donneur
                        {(r.response_counts?.accepted ?? 0) > 1 ? 's' : ''} en route
                      </p>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-raised">
                        <div className="bar-origin-left h-full rounded-full bg-accent-green" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge
                        size="sm"
                        tone={r.urgency === 'critical' ? 'danger' : r.urgency === 'urgent' ? 'warning' : 'info'}
                      >
                        {r.urgency_display}
                      </Badge>
                      <span className="inline-flex items-center gap-1 text-2xs text-muted">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        {formatRelative(r.created_at, now)}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* Pénuries prévues */}
        <section className="panel dash-panel-in h-fit" style={{ '--stagger': 5 } as React.CSSProperties}>
          <div className="border-b border-line px-5 py-3.5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
              <BrainCircuit className="h-4 w-4 text-muted" aria-hidden="true" />
              Pénuries prévues à {OUTLOOK_DAYS} jours
            </h2>
            <p className="text-xs text-muted">Par centre et par groupe, d’après le modèle de prévision.</p>
          </div>
          {alerts.length === 0 ? (
            <p className="px-5 py-10 text-center text-xs text-muted">Aucun risque prévu dans la région.</p>
          ) : (
            <ul className="divide-y divide-line">
              {alerts.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-raised/35">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-fg">
                      <span className="num font-bold">{p.blood_group.replace('-', '−')}</span> · {p.center_name}
                    </p>
                    <p className="text-xs text-muted">
                      Le {formatShortDate(p.prediction_date)} ·{' '}
                      {p.days_of_supply != null ? `${formatNumber(p.days_of_supply, 1)} j de stock` : 'stock bas'}
                    </p>
                  </div>
                  <Badge size="sm" tone={p.risk_level === 'CRITICAL' ? 'danger' : 'warning'}>
                    {p.risk_level === 'CRITICAL' ? 'Critique' : 'Vigilance'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
