import React, { useId } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BarChart3 } from 'lucide-react'
import { Panel, Legend, LegendItem } from '@/components/dash/Panel'
import { Segmented } from '@/components/dash/Segmented'
import { useReducedMotion } from '@/components/dash/useReducedMotion'
import { formatNumber } from '@/lib/format'
import type { ActivityPeriod, ActivitySeries } from './useActivitySeries'

const SERIES = [
  { key: 'donations', label: 'Dons de sang', color: 'var(--tint-red)', available: 'donations' },
  { key: 'requests', label: 'Demandes de sang', color: 'var(--tint-blue)', available: 'requests' },
  { key: 'missions', label: 'Missions SAMU', color: 'var(--tint-green)', available: 'missions' },
] as const

const weekday = new Intl.DateTimeFormat('fr-SN', { weekday: 'short', timeZone: 'UTC' })
const shortDay = new Intl.DateTimeFormat('fr-SN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const fullDay = new Intl.DateTimeFormat('fr-SN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

interface TipProps {
  active?: boolean
  label?: string
  payload?: { dataKey: string; value: number; color: string; name: string }[]
}

const ChartTip: React.FC<TipProps> = ({ active, label, payload }) => {
  if (!active || !payload?.length || !label) return null
  return (
    <div className="rounded-xl bg-inverse px-3 py-2 text-xs text-on-inverse shadow-[var(--shadow-raised)]">
      <p className="mb-1 font-semibold first-letter:uppercase">{fullDay.format(new Date(`${label}T00:00:00Z`))}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2">
          <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name} <span className="num ml-auto pl-3 font-semibold">{formatNumber(p.value)}</span>
        </p>
      ))}
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
 * Activité globale : nombre d'enregistrements par jour (demandes de sang
 * créées, dons enregistrés, missions SAMU créées). Une série hors du rôle de
 * l'utilisateur n'est pas tracée plutôt que d'apparaître à zéro.
 */
export const ActivityPanel: React.FC<ActivityPanelProps> = ({ period, onPeriodChange, data, loading, i = 0, className = '' }) => {
  const reduced = useReducedMotion()
  const gradientId = useId().replace(/:/g, '')
  const series = SERIES.filter((s) => data?.available[s.available])
  const total = data ? data.days.reduce((acc, d) => acc + series.reduce((a, s) => a + d[s.key], 0), 0) : 0
  const tickFormatter = (day: string) => {
    const date = new Date(`${day}T00:00:00Z`)
    return period === 7 ? weekday.format(date).replace('.', '') : shortDay.format(date)
  }

  return (
    <Panel
      i={i}
      className={className}
      eyebrow="Performance"
      title={
        <span className="flex items-center gap-2">
          <BarChart3 className="h-[1.125rem] w-[1.125rem] text-tint-blue" aria-hidden="true" />
          Activité globale
        </span>
      }
      subtitle={`Enregistrements par jour · ${period} derniers jours`}
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
        <>
          <Legend>
            {series.map((s) => (
              <LegendItem key={s.key} kind="line" className="" >
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
              </LegendItem>
            ))}
          </Legend>
          {data && (
            <span className="num font-medium text-fg">
              {total === 0 ? 'Aucun enregistrement sur la période' : `${formatNumber(total)} enregistrements`}
              {data.partial && <span className="font-normal text-warning"> · période partiellement chargée</span>}
            </span>
          )}
        </>
      }
      bodyClassName="px-3 pb-2 pt-4"
    >
      {loading || !data ? (
        <div className="skeleton mx-2 h-[230px]" aria-label="Chargement" />
      ) : series.length === 0 ? (
        <p className="px-2 py-16 text-center text-sm text-muted">Aucune série d’activité n’est accessible avec votre rôle.</p>
      ) : (
        <div className="h-[230px]" role="img" aria-label={`Activité par jour sur ${period} jours : ${series.map((s) => `${s.label} ${formatNumber(data.days.reduce((a, d) => a + d[s.key], 0))}`).join(', ')}`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.days} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
              <defs>
                {series.map((s) => (
                  <linearGradient key={s.key} id={`${gradientId}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.color} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis
                dataKey="day"
                tickFormatter={tickFormatter}
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--fg-subtle)', fontSize: 12 }}
                minTickGap={18}
                dy={8}
              />
              <YAxis
                allowDecimals={false}
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--fg-subtle)', fontSize: 12 }}
                width={44}
              />
              <Tooltip content={<ChartTip />} cursor={{ stroke: 'var(--line-strong)' }} />
              {series.map((s) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2.5}
                  fill={`url(#${gradientId}-${s.key})`}
                  dot={period === 7 ? { r: 3.5, strokeWidth: 2, fill: 'var(--surface)' } : false}
                  activeDot={{ r: 5 }}
                  isAnimationActive={!reduced}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  )
}
