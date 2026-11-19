import React, { useId, useState } from 'react'
import { Area, ComposedChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Panel, Legend, LegendItem } from '@/components/dash/Panel'
import { Segmented } from '@/components/dash/Segmented'
import { useReducedMotion } from '@/components/dash/useReducedMotion'
import { formatNumber, formatPercent } from '@/lib/format'
import type { ActivityPeriod, ActivitySeries } from './useActivitySeries'

type SeriesKey = 'requests' | 'donations' | 'missions'

const SERIES: { key: SeriesKey; label: string; unit: [string, string] }[] = [
  { key: 'requests', label: 'Demandes de sang', unit: ['demande', 'demandes'] },
  { key: 'donations', label: 'Dons enregistrés', unit: ['don', 'dons'] },
  { key: 'missions', label: 'Missions SAMU', unit: ['mission', 'missions'] },
]

const weekday = new Intl.DateTimeFormat('fr-SN', { weekday: 'short', timeZone: 'UTC' })
const shortDay = new Intl.DateTimeFormat('fr-SN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const fullDay = new Intl.DateTimeFormat('fr-SN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const asDate = (day: string) => new Date(`${day}T00:00:00Z`)

interface Point {
  day: string
  prevDay: string
  value: number
  prev: number | null
}

interface TipProps {
  active?: boolean
  payload?: { payload: Point }[]
  unit: [string, string]
}

/** Infobulle sombre : le jour, sa valeur, et le jour correspondant de la période précédente. */
const ChartTip: React.FC<TipProps> = ({ active, payload, unit }) => {
  const point = active ? payload?.[0]?.payload : undefined
  if (!point) return null
  const word = (n: number) => (n > 1 ? unit[1] : unit[0])
  return (
    <div className="rounded-xl bg-inverse px-3 py-2.5 text-xs text-on-inverse shadow-[var(--shadow-raised)]">
      <p className="font-medium opacity-70 first-letter:uppercase">{fullDay.format(asDate(point.day))}</p>
      <p className="num mt-0.5 text-base font-semibold leading-tight">
        {formatNumber(point.value)} {word(point.value)}
      </p>
      {point.prev !== null && (
        <p className="num mt-0.5 opacity-70">
          {shortDay.format(asDate(point.prevDay))} : {formatNumber(point.prev)}
        </p>
      )}
    </div>
  )
}

interface ActivityPanelProps {
  period: ActivityPeriod
  onPeriodChange: (period: ActivityPeriod) => void
  data: ActivitySeries | undefined
  loading: boolean
  i?: number
  className?: string
}

/**
 * Activité du réseau : une série à la fois (demandes de sang, dons, missions
 * SAMU), comptée jour par jour sur les enregistrements réels, comparée à la
 * période précédente de même durée (pointillé). Les onglets donnent le total
 * de chaque série et son écart, sans avoir à ouvrir le graphique.
 */
export const ActivityPanel: React.FC<ActivityPanelProps> = ({ period, onPeriodChange, data, loading, i = 0, className = '' }) => {
  const reduced = useReducedMotion()
  const gradientId = useId().replace(/:/g, '')
  const series = SERIES.filter((s) => data?.available[s.key])
  const [picked, setPicked] = useState<SeriesKey | null>(null)
  const active = series.find((s) => s.key === picked) ?? series[0]
  const comparable = data ? !data.previousPartial : false

  const totals = (key: SeriesKey) => {
    const now = data ? data.days.reduce((a, d) => a + d[key], 0) : 0
    const before = data ? data.previous.reduce((a, d) => a + d[key], 0) : 0
    return { now, before, delta: comparable && before > 0 ? (now - before) / before : null }
  }

  const points: Point[] =
    data && active
      ? data.days.map((d, index) => ({
          day: d.day,
          prevDay: data.previous[index]?.day ?? '',
          value: d[active.key],
          prev: comparable ? (data.previous[index]?.[active.key] ?? null) : null,
        }))
      : []

  const tickFormatter = (day: string) =>
    period === 7 ? weekday.format(asDate(day)).replace('.', '') : shortDay.format(asDate(day))

  return (
    <Panel
      i={i}
      className={className}
      title="Activité du réseau"
      subtitle={`Enregistrements par jour · ${period} derniers jours, comparés aux ${period} précédents`}
      actions={
        <Segmented
          ariaLabel="Période"
          value={String(period)}
          onChange={(v) => onPeriodChange(Number(v) as ActivityPeriod)}
          options={[
            { value: '7', label: '7 j' },
            { value: '30', label: '30 j' },
            { value: '90', label: '90 j' },
          ]}
        />
      }
      footer={
        data && active ? (
          <>
            <Legend>
              <LegendItem kind="line" className="bg-viz-base">
                {period} derniers jours
              </LegendItem>
              {comparable && <LegendItem kind="dashline">{period} jours précédents</LegendItem>}
            </Legend>
            {(data.partial || data.previousPartial) && (
              <span className="text-warning">
                {data.partial ? 'Période partiellement chargée' : 'Période précédente incomplète : comparaison masquée'}
              </span>
            )}
          </>
        ) : undefined
      }
      bodyClassName="pb-2 pt-3"
    >
      {loading || !data ? (
        <div className="space-y-4 px-5" aria-label="Chargement">
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((k) => (
              <span key={k} className="skeleton block h-16" />
            ))}
          </div>
          <div className="skeleton h-[220px]" />
        </div>
      ) : !active ? (
        <p className="px-5 py-16 text-center text-sm text-muted">Aucune série d’activité n’est accessible avec votre rôle.</p>
      ) : (
        <>
          {/* Onglets chiffrés : total de chaque série et écart avec la période précédente. */}
          <div role="tablist" aria-label="Série affichée" className="mx-5 grid border-b border-line" style={{ gridTemplateColumns: `repeat(${series.length}, minmax(0, 1fr))` }}>
            {series.map((s) => {
              const t = totals(s.key)
              const selected = s.key === active.key
              const up = t.delta !== null && t.delta > 0
              return (
                <button
                  key={s.key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setPicked(s.key)}
                  className={`group relative cursor-pointer px-1 pb-3 pt-1 text-left transition-colors ${selected ? '' : 'opacity-60 hover:opacity-100'}`}
                >
                  <span className="block truncate text-xs font-medium text-muted">{s.label}</span>
                  <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
                    <span className="num text-[1.375rem] font-bold leading-tight tracking-[-0.02em] text-fg">{formatNumber(t.now)}</span>
                    <span className={`num text-2xs font-semibold ${t.delta === null ? 'text-subtle' : 'text-muted'}`}>
                      {t.delta === null ? '—' : `${up ? '+' : t.delta < 0 ? '−' : ''}${formatPercent(Math.abs(t.delta))}`}
                      <span className="sr-only"> par rapport à la période précédente</span>
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={`absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-ink transition-transform duration-300 ${selected ? 'scale-x-100' : 'scale-x-0'}`}
                  />
                </button>
              )
            })}
          </div>

          <div
            className="h-[230px] px-2 pt-4"
            role="img"
            aria-label={`${active.label} par jour sur ${period} jours : ${formatNumber(totals(active.key).now)} au total${
              comparable ? `, contre ${formatNumber(totals(active.key).before)} sur la période précédente` : ''
            }`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={points} margin={{ top: 8, right: 14, left: -14, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--viz-base)" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="var(--viz-base)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis
                  dataKey="day"
                  tickFormatter={tickFormatter}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'var(--fg-subtle)', fontSize: 12 }}
                  minTickGap={22}
                  dy={8}
                />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: 'var(--fg-subtle)', fontSize: 12 }} width={40} />
                <Tooltip
                  content={<ChartTip unit={active.unit} />}
                  cursor={{ stroke: 'var(--fg-subtle)', strokeDasharray: '3 4' }}
                />
                {comparable && (
                  <Line
                    type="monotone"
                    dataKey="prev"
                    stroke="var(--fg-subtle)"
                    strokeWidth={1.5}
                    strokeDasharray="4 5"
                    dot={false}
                    activeDot={false}
                    isAnimationActive={!reduced}
                  />
                )}
                <Area
                  key={`${active.key}-${period}`}
                  type="monotone"
                  dataKey="value"
                  stroke="var(--viz-base)"
                  strokeWidth={2.25}
                  fill={`url(#${gradientId})`}
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 2.5, stroke: 'var(--surface)', fill: 'var(--viz-base)' }}
                  isAnimationActive={!reduced}
                  animationDuration={700}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Panel>
  )
}
