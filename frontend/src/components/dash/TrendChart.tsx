import React, { useId } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatNumber } from '@/lib/format'
import { useThemeColors } from '@/lib/useThemeColors'
import { useReducedMotion } from './useReducedMotion'

export interface TrendPoint {
  /** Libellé court de l'axe (« 12 oct. »). */
  label: string
  /** Libellé complet de l'infobulle. */
  fullLabel: string
  current: number | null
  previous: number | null
}

interface TrendChartProps {
  data: TrendPoint[]
  unit: string
  height?: number
  /** Nom de la série de comparaison dans l'infobulle. */
  previousLabel?: string
}

interface TipProps {
  active?: boolean
  payload?: { payload: TrendPoint }[]
  unit: string
  previousLabel: string
}

const TrendTooltip: React.FC<TipProps> = ({ active, payload, unit, previousLabel }) => {
  const point = active ? payload?.[0]?.payload : undefined
  if (!point) return null
  const delta = point.current != null && point.previous != null ? point.current - point.previous : null
  return (
    <div className="rounded-xl bg-surface px-3.5 py-2.5 text-fg shadow-[var(--shadow-raised)]">
      <p className="text-2xs text-muted">{point.fullLabel}</p>
      <p className="num mt-0.5 text-base font-semibold">
        {point.current == null ? 'Aucun relevé' : `${formatNumber(point.current)} ${unit}`}
      </p>
      {point.previous != null && (
        <p className="num text-2xs text-muted">
          {previousLabel} : {formatNumber(point.previous)}
          {delta !== null && delta !== 0 && ` · ${delta > 0 ? '+' : '−'}${formatNumber(Math.abs(delta))}`}
        </p>
      )}
    </div>
  )
}

/**
 * Courbe d'évolution : la période en cours en aire pleine, la période
 * précédente en pointillés pour situer la tendance. Infobulle blanche,
 * réticule vertical, axes réduits à l'essentiel.
 */
export const TrendChart: React.FC<TrendChartProps> = ({
  data,
  unit,
  height = 240,
  previousLabel = 'Période précédente',
}) => {
  const colors = useThemeColors()
  const reduced = useReducedMotion()
  const gradientId = `trend-${useId().replace(/:/g, '')}`
  const tickEvery = Math.max(1, Math.ceil(data.length / 6))

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 12, right: 8, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.vizBase} stopOpacity={0.16} />
              <stop offset="100%" stopColor={colors.vizBase} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={colors.line} strokeDasharray="3 5" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: colors.subtle, fontSize: 11 }}
            interval={tickEvery - 1}
            dy={6}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: colors.subtle, fontSize: 11 }}
            allowDecimals={false}
            width={44}
            tickFormatter={(v: number) => formatNumber(v)}
          />
          <Tooltip
            cursor={{ stroke: colors.vizBase, strokeDasharray: '3 4', strokeWidth: 1 }}
            content={<TrendTooltip unit={unit} previousLabel={previousLabel} />}
          />
          <Line
            type="monotone"
            dataKey="previous"
            stroke={colors.subtle}
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            activeDot={false}
            connectNulls
            isAnimationActive={!reduced}
            animationDuration={900}
          />
          <Area
            type="monotone"
            dataKey="current"
            stroke={colors.vizBase}
            strokeWidth={2.25}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 5, strokeWidth: 2.5, stroke: colors.vizBase, fill: colors.surface }}
            connectNulls={false}
            isAnimationActive={!reduced}
            animationDuration={1100}
            animationEasing="ease-out"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
