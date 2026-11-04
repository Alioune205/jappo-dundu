import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Clock, Droplet, Droplets, HeartHandshake, MapPin, Plus, TrendingDown, X } from 'lucide-react'
import { Link } from 'react-router'
import { api } from '@/lib/api'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { MetricTile } from '@/components/dash/MetricTile'
import { EmptyNote, Legend, LegendItem, Panel } from '@/components/dash/Panel'
import { ArcGauge } from '@/components/dash/ArcGauge'
import { CapsuleChart, type CapsuleDatum } from '@/components/dash/CapsuleChart'
import { TrendChart, type TrendPoint } from '@/components/dash/TrendChart'
import { SIGNAL_FILL, type Signal } from '@/components/dash/tones'
import { BLOOD_GROUPS } from '@/lib/constants'
import { useNow } from '@/lib/useNow'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import { BLOOD_REQUEST_EVENTS, RealtimeEvent } from '@/lib/realtimeEvents'
import { formatNumber, formatPercent, formatRelative, formatShortDate } from '@/lib/format'
import { QK } from '@/lib/queryKeys'
import type { BloodGroup, BloodRequest, BloodStockRecord, FacilitySummary, Prediction, RiskLevel } from '@/types/api'
import { formatDay, formatLongDay, groupLabel, plural } from './shared'

/** Horizon des alertes de pénurie affichées sur l'accueil. */
const OUTLOOK_DAYS = 7
/** Fenêtre de la courbe d'évolution (et de la période comparée). */
const TREND_DAYS = 30
/** Pages d'historique chargées au plus (50 relevés par page). */
const MAX_HISTORY_PAGES = 6
const RISK_RANK: Record<RiskLevel, number> = { CRITICAL: 0, WARNING: 1, NORMAL: 2 }
const URGENCY_RANK = { critical: 0, urgent: 1, normal: 2 } as const
const DAY_MS = 86_400_000

interface GroupOutlook {
  units: number | null
  risk: RiskLevel | null
  riskDate: string | null
  daysOfSupply: number | null
}

const riskSignal = (risk: RiskLevel | null): Signal =>
  risk === 'CRITICAL' ? 'critical' : risk === 'WARNING' ? 'warning' : 'ok'

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/**
 * Tableau de bord de l'administrateur du sang : demandes en cours de son
 * périmètre (le CNTS couvre sa région), réserves par groupe, évolution du
 * stock et pénuries prévues. Choisir un groupe filtre tout l'écran.
 */
export const BloodManagerDashboard: React.FC<{ facility: FacilitySummary }> = ({ facility }) => {
  const now = useNow()
  const [selectedGroup, setSelectedGroup] = useState<BloodGroup | null>(null)

  // 1. Demandes ouvertes (périmètre fixé par le serveur)
  const { data: requests = [], isPending: requestsPending } = useQuery<BloodRequest[]>({
    queryKey: [...QK.bloodRequests, 'open'],
    queryFn: async () =>
      (await api.get<{ results: BloodRequest[] }>('/api/sang/requests/', { status: 'open' })).results || [],
  })

  // 2. Dernier relevé de stock de la région (relevé de la veille au plus tard)
  const { data: stocks = [], isPending: stocksPending } = useQuery<BloodStockRecord[]>({
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
  const horizon = new Date(now + OUTLOOK_DAYS * DAY_MS).toISOString().slice(0, 10)
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

  const hasStock = BLOOD_GROUPS.some((g) => outlook.get(g)?.units != null)
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

  const capsules: CapsuleDatum[] = BLOOD_GROUPS.map((g) => {
    const o = outlook.get(g)!
    const requestsForGroup = open.filter((r) => r.blood_group === g).length
    return {
      key: g,
      label: groupLabel(g),
      value: o.units,
      signal: o.units === null ? 'neutral' : riskSignal(o.risk),
      valueText: o.units === null ? 'Pas de relevé' : `${formatNumber(o.units)} poches`,
      details: [
        o.risk && o.riskDate
          ? `${o.risk === 'CRITICAL' ? 'Critique' : 'Bas'} le ${formatShortDate(o.riskDate)}${
              o.daysOfSupply != null ? ` · ${formatNumber(o.daysOfSupply, 1)} j de stock` : ''
            }`
          : `Pas de risque prévu à ${OUTLOOK_DAYS} j`,
        requestsForGroup > 0 ? plural(requestsForGroup, 'demande ouverte', 'demandes ouvertes') : 'Aucune demande ouverte',
      ],
    }
  })

  // Groupe suivi par la courbe : celui choisi, sinon le plus exposé.
  const focusGroup: BloodGroup =
    selectedGroup ??
    BLOOD_GROUPS.find((g) => outlook.get(g)?.risk === 'CRITICAL') ??
    BLOOD_GROUPS.find((g) => outlook.get(g)?.risk === 'WARNING') ??
    'O-'

  // 4. Historique du groupe suivi (60 jours : période en cours et précédente)
  const { data: history = [], isPending: historyPending } = useQuery<BloodStockRecord[]>({
    queryKey: [...QK.bloodStocks, 'history', facility.region, focusGroup],
    queryFn: async () => {
      const records: BloodStockRecord[] = []
      for (let page = 1; page <= MAX_HISTORY_PAGES; page += 1) {
        const res = await api.get<{ results?: BloodStockRecord[]; next?: string | null }>('/api/ml/stocks/', {
          region: facility.region,
          blood_group: focusGroup,
          days: TREND_DAYS * 2,
          page,
        })
        records.push(...(res?.results ?? []))
        if (!res?.next) break
      }
      return records
    },
    staleTime: 10 * 60_000,
  })

  const trend = useMemo(() => {
    const byDay = new Map<string, number>()
    for (const r of history) byDay.set(r.date, (byDay.get(r.date) ?? 0) + r.units_available)
    const days = [...byDay.keys()].sort()
    if (days.length === 0) return null
    // Fenêtre ancrée sur le dernier relevé : une donnée ancienne est datée, jamais présentée comme actuelle.
    const anchor = new Date(`${days[days.length - 1]}T00:00:00Z`).getTime()
    const points: TrendPoint[] = []
    for (let k = TREND_DAYS - 1; k >= 0; k -= 1) {
      const day = isoDay(anchor - k * DAY_MS)
      const before = isoDay(anchor - (k + TREND_DAYS) * DAY_MS)
      points.push({
        label: formatDay(day),
        fullLabel: formatLongDay(day),
        current: byDay.get(day) ?? null,
        previous: byDay.get(before) ?? null,
      })
    }
    const lastDay = days[days.length - 1]
    const current = points.filter((p) => p.current != null).map((p) => p.current as number)
    const previous = points.filter((p) => p.previous != null).map((p) => p.previous as number)
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
    return {
      points,
      lastDay,
      staleDays: Math.floor((now - new Date(`${lastDay}T23:59:59Z`).getTime()) / DAY_MS),
      currentMean: mean(current),
      previousMean: mean(previous),
      last: current.length ? current[current.length - 1] : null,
    }
  }, [history, now])

  const coverage = neededUnits > 0 ? collectedUnits / neededUnits : null
  const meanDelta =
    trend?.currentMean != null && trend.previousMean != null && trend.previousMean > 0
      ? (trend.currentMean - trend.previousMean) / trend.previousMean
      : null

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <>
            <span>Jappo Sang</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              Région de {facility.region_display}
            </span>
          </>
        }
        title={facility.name}
        description="Demandes en cours, réserves par groupe et pénuries prévues de votre région."
        actions={
          <Link
            to="/blood"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-brand px-4 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-strong"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Nouvelle demande
          </Link>
        }
      />

      {criticalGroups.length > 0 && (
        <Alert tone="danger" title="Pénurie prévue">
          Stock critique prévu d’ici {OUTLOOK_DAYS} jours pour {criticalGroups.map(groupLabel).join(', ')} dans la
          région. Pensez à lancer une collecte ou une demande ciblée.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          i={0}
          variant="featured"
          icon={Droplets}
          to="/blood"
          label="Demandes ouvertes"
          loading={requestsPending}
          value={open.length}
          badge={vital.length > 0 ? { label: plural(vital.length, 'vitale'), signal: 'critical' } : undefined}
          status={
            vital.length > 0
              ? { text: 'Urgence vitale en cours', signal: 'critical' }
              : { text: 'Aucune urgence vitale', signal: 'ok' }
          }
          hint={`${urgentReqs.length} urgente${urgentReqs.length > 1 ? 's' : ''} · ${normalReqs.length} normale${normalReqs.length > 1 ? 's' : ''}`}
        />
        <MetricTile
          i={1}
          icon={Droplet}
          label="Poches manquantes"
          loading={requestsPending}
          value={missingUnits}
          unit="poches"
          meter={
            neededUnits > 0
              ? { value: collectedUnits, max: neededUnits, signal: missingUnits > 0 ? 'warning' : 'ok', label: 'Poches collectées' }
              : undefined
          }
          status={{ text: `${formatNumber(collectedUnits)} collectées sur ${formatNumber(neededUnits)}`, signal: 'neutral' }}
        />
        <MetricTile
          i={2}
          icon={HeartHandshake}
          label="Donneurs en route"
          loading={requestsPending}
          value={donorsComing}
          status={
            donorsComing > 0
              ? { text: 'Ont accepté de venir', signal: 'ok' }
              : { text: 'Aucun donneur annoncé', signal: 'neutral' }
          }
          hint="Réponses aux alertes"
        />
        <MetricTile
          i={3}
          icon={TrendingDown}
          to="/ml"
          label="Groupes en pénurie"
          value={criticalGroups.length}
          unit={`/ ${BLOOD_GROUPS.length}`}
          status={{
            text: `Prévision à ${OUTLOOK_DAYS} jours`,
            signal: criticalGroups.length > 0 ? 'critical' : 'ok',
          }}
          hint="Modèle quantile CQR"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Panel
          i={2}
          className="xl:col-span-7"
          title="Réserves par groupe sanguin"
          subtitle={
            <>
              {latestDate ? `Relevé du ${formatShortDate(latestDate)}` : 'Aucun relevé récent'} · poches disponibles dans la
              région · couleur = risque à {OUTLOOK_DAYS} j
              {simulated ? ' · données simulées (en attente de l’historique du CNTS)' : ''}
            </>
          }
          actions={
            selectedGroup && (
              <button
                type="button"
                onClick={() => setSelectedGroup(null)}
                className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full bg-brand-soft pl-3 pr-2 text-xs font-semibold text-fg transition-colors hover:bg-track"
              >
                Filtre : {groupLabel(selectedGroup)} <X className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">(retirer le filtre)</span>
              </button>
            )
          }
          footer={
            hasStock && (
              <>
                <Legend>
                  <LegendItem className={SIGNAL_FILL.ok}>Stable</LegendItem>
                  <LegendItem className={SIGNAL_FILL.warning}>Vigilance</LegendItem>
                  <LegendItem className={SIGNAL_FILL.critical}>Critique à {OUTLOOK_DAYS} j</LegendItem>
                  <LegendItem kind="dashed">Pas de relevé</LegendItem>
                </Legend>
                <span>Choisissez un groupe pour filtrer l’écran</span>
              </>
            )
          }
          bodyClassName="px-5 pb-5 pt-12"
        >
          {stocksPending ? (
            <div className="flex h-[13.5rem] items-end gap-4" aria-label="Chargement">
              {BLOOD_GROUPS.map((g, k) => (
                <span key={g} className="skeleton block flex-1 rounded-full" style={{ height: `${35 + ((k * 23) % 50)}%` }} />
              ))}
            </div>
          ) : !hasStock ? (
            <EmptyNote
              className="min-h-[13.5rem]"
              title="Aucun relevé de stock récent dans la région"
              hint={
                trend
                  ? `Dernier relevé connu : ${formatShortDate(trend.lastDay)} (il y a ${trend.staleDays} jours). La courbe d’évolution ci-dessous montre cet historique.`
                  : 'Les réserves apparaîtront dès que les centres de la région transmettront leur relevé quotidien.'
              }
            />
          ) : (
            <CapsuleChart
              mode="scale"
              data={capsules}
              height={190}
              selectedKey={selectedGroup}
              onSelect={(key) => setSelectedGroup((cur) => (cur === key ? null : (key as BloodGroup)))}
              ariaLabel="Réserves de la région par groupe sanguin"
            />
          )}
        </Panel>

        <Panel
          i={3}
          className="xl:col-span-5"
          title="Couverture des demandes"
          subtitle="Poches collectées sur poches demandées"
          actions={
            <Badge tone={vital.length > 0 ? 'danger' : 'success'} size="sm">
              {vital.length > 0 ? 'Priorité vitale' : 'Nominal'}
            </Badge>
          }
          bodyClassName="flex flex-col px-5 pb-5 pt-4"
        >
          {open.length === 0 ? (
            <EmptyNote tone="calm" title="Aucune demande ouverte" hint="Toutes les demandes de votre périmètre sont satisfaites." />
          ) : (
            <>
              <ArcGauge
                size={280}
                legend={false}
                centerValue={formatPercent(coverage)}
                centerLabel="des poches demandées sont collectées"
                segments={[
                  { label: 'Collectées', value: collectedUnits, color: 'var(--viz-base)', unit: 'poches' },
                  { label: 'Manquantes', value: missingUnits, rest: true, unit: 'poches' },
                ]}
              />
              <dl className="mt-6 grid grid-cols-3 gap-2">
                {[
                  { label: 'Vitales', value: vital.length, dot: 'bg-critical' },
                  { label: 'Urgentes', value: urgentReqs.length, dot: 'bg-viz-warn' },
                  { label: 'Normales', value: normalReqs.length, dot: 'bg-info' },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl bg-raised px-3 py-3 text-center">
                    <dt className="flex items-center justify-center gap-1.5 text-2xs text-muted">
                      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${item.dot}`} />
                      {item.label}
                    </dt>
                    <dd className="num mt-0.5 text-xl font-semibold text-fg">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Panel
          i={4}
          className="xl:col-span-8"
          title={
            <>
              Évolution du stock · <span className="num">{groupLabel(focusGroup)}</span>
              {!selectedGroup && focusGroup !== 'O-' && (
                <span className="ml-2 align-middle text-2xs font-medium text-muted">groupe le plus exposé</span>
              )}
            </>
          }
          subtitle={
            trend
              ? `Poches disponibles par jour, région de ${facility.region_display} · ${TREND_DAYS} jours jusqu’au ${formatShortDate(trend.lastDay)}, comparés aux ${TREND_DAYS} précédents`
              : `Poches disponibles par jour · région de ${facility.region_display}`
          }
          actions={
            trend && (
              <Legend>
                <LegendItem kind="line" className="bg-viz-base">
                  {TREND_DAYS} derniers jours
                </LegendItem>
                <LegendItem kind="dashline">Période précédente</LegendItem>
              </Legend>
            )
          }
          footer={
            trend && (
              <>
                <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span>
                    Dernier relevé : <strong className="num font-semibold text-fg">{formatNumber(trend.last)} poches</strong>
                  </span>
                  <span>
                    Moyenne : <strong className="num font-semibold text-fg">{formatNumber(trend.currentMean, 1)}</strong>
                    {meanDelta !== null && (
                      <span className={`num ml-1 ${meanDelta < 0 ? 'text-warning' : 'text-ok'}`}>
                        ({meanDelta > 0 ? '+' : '−'}
                        {formatPercent(Math.abs(meanDelta))} vs période précédente)
                      </span>
                    )}
                  </span>
                </span>
                {trend.staleDays > 1 && (
                  <span className="inline-flex items-center gap-1.5 font-medium text-warning">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    Données anciennes : dernier relevé il y a {trend.staleDays} jours
                  </span>
                )}
              </>
            )
          }
          bodyClassName="px-3 pb-2 pt-3"
        >
          {historyPending ? (
            <div className="px-2 pb-2" aria-label="Chargement">
              <span className="skeleton block h-[15rem] w-full rounded-2xl" />
            </div>
          ) : !trend ? (
            <EmptyNote
              title={`Aucun relevé de stock ${groupLabel(focusGroup)} sur ${TREND_DAYS * 2} jours`}
              hint="La courbe apparaîtra dès que les centres de la région auront transmis leurs relevés quotidiens."
            />
          ) : (
            <TrendChart data={trend.points} unit="poches" height={250} />
          )}
        </Panel>

        <Panel
          i={5}
          className="xl:col-span-4"
          title={`Pénuries prévues à ${OUTLOOK_DAYS} jours`}
          subtitle={
            selectedGroup
              ? `Groupe ${groupLabel(selectedGroup)} · par centre, d’après le modèle de prévision`
              : 'Par centre et par groupe sanguin'
          }
          bodyClassName="pt-2"
        >
          {alerts.length === 0 ? (
            <EmptyNote tone="calm" title="Aucun risque prévu" hint={`Pas de pénurie annoncée dans la région d’ici ${OUTLOOK_DAYS} jours.`} />
          ) : (
            <ul className="divide-y divide-line">
              {alerts.map((p, index) => (
                <li
                  key={p.id}
                  className="reveal flex items-center justify-between gap-3 px-5 py-3"
                  style={{ '--i': index + 2 } as React.CSSProperties}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="num inline-flex h-9 w-10 shrink-0 items-center justify-center rounded-xl bg-sunken text-sm font-semibold text-fg">
                      {groupLabel(p.blood_group)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-fg">{p.center_name}</p>
                      <p className="text-xs text-muted">
                        Le {formatShortDate(p.prediction_date)} ·{' '}
                        {p.days_of_supply != null ? `${formatNumber(p.days_of_supply, 1)} j de stock` : 'stock bas'}
                      </p>
                    </div>
                  </div>
                  <Badge size="sm" tone={p.risk_level === 'CRITICAL' ? 'danger' : 'warning'}>
                    {p.risk_level === 'CRITICAL' ? 'Critique' : 'Vigilance'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        i={6}
        title={
          <>
            Demandes en cours <span className="num ml-1 font-normal text-muted">{filteredOpen.length}</span>
          </>
        }
        subtitle={
          selectedGroup
            ? `Groupe ${groupLabel(selectedGroup)} · urgences vitales d’abord`
            : 'Urgences vitales d’abord, puis par échéance'
        }
        actions={
          <Link to="/blood" className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-fg">
            Gérer <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        }
        bodyClassName="pt-2"
      >
        {requestsPending ? (
          <div className="space-y-3 px-5 pb-5" aria-label="Chargement">
            {[0, 1, 2].map((k) => (
              <span key={k} className="skeleton block h-12 w-full" />
            ))}
          </div>
        ) : filteredOpen.length === 0 ? (
          <EmptyNote
            tone="calm"
            title={selectedGroup ? `Aucune demande ouverte pour ${groupLabel(selectedGroup)}` : 'Aucune demande ouverte'}
          />
        ) : (
          <ul className="grid grid-cols-1 divide-y divide-line lg:grid-cols-2 lg:divide-y-0">
            {filteredOpen.slice(0, 6).map((r, index) => {
              const pct = r.units_needed > 0 ? (r.units_collected / r.units_needed) * 100 : 0
              const accepted = r.response_counts?.accepted ?? 0
              return (
                <li
                  key={r.id}
                  className="reveal grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-5 py-3.5"
                  style={{ '--i': index + 2 } as React.CSSProperties}
                >
                  <span
                    className={`num flex h-11 w-12 items-center justify-center rounded-2xl text-sm font-semibold ${
                      r.urgency === 'critical' ? 'bg-critical/10 text-critical' : 'bg-sunken text-fg'
                    }`}
                  >
                    {groupLabel(r.blood_group)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-fg">{r.facility?.name}</p>
                    <p className="text-xs text-muted">
                      <span className="num">
                        {r.units_collected} / {r.units_needed}
                      </span>{' '}
                      poches · {plural(accepted, 'donneur')} en route
                    </p>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-track" aria-hidden="true">
                      <div className="bar-fill h-full rounded-full bg-viz-base" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge size="sm" tone={r.urgency === 'critical' ? 'danger' : r.urgency === 'urgent' ? 'warning' : 'info'}>
                      {r.urgency === 'critical' ? 'Vitale' : r.urgency_display}
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
      </Panel>
    </div>
  )
}
