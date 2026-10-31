import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { formatNumber } from '@/lib/format'

/** Indicateurs de pilotage (GET /api/supervision/kpis/). */
export interface KpiReport {
  days: number
  region: string | null
  generated_at: string
  volumes: Record<string, number>
  indicators: {
    key: string
    label: string
    value: number | null
    unit: string
    target: number
    status: 'ok' | 'warning' | 'critical' | 'no_data'
  }[]
}

export const formatKpi = (value: number | null, unit: string) =>
  value === null
    ? '—'
    : unit === '%'
      ? `${Math.round(value * 100)} %`
      : `${formatNumber(value, 1)}${unit ? ` ${unit}` : ''}`

export function useKpis(days: number, region?: string) {
  return useQuery<KpiReport>({
    queryKey: ['network-kpis', days, region ?? ''],
    queryFn: () => api.get<KpiReport>('/api/supervision/kpis/', { days, region: region || undefined }),
    staleTime: 5 * 60_000,
  })
}
