import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Gauge } from 'lucide-react'
import { api } from '@/lib/api'
import type { FacilitySummary } from '@/types/api'

interface TensionRow {
  facility: FacilitySummary
  level: 1 | 2 | 3 | 4
  label: string
  action: string
  occupancy_rate: number
  reasons: string[]
}

const TENSION_STYLE: Record<TensionRow['level'], string> = {
  1: 'border-ok/40 bg-ok/5 text-ok',
  2: 'border-warning/40 bg-warning/5 text-warning',
  3: 'border-critical/40 bg-critical/5 text-critical',
  4: 'border-critical bg-critical text-white',
}

/** Niveau de tension de l'établissement (1 à 4) et la consigne qui va avec. */
export const TensionBanner: React.FC<{ facility: FacilitySummary }> = ({ facility }) => {
  const { data } = useQuery<TensionRow[]>({
    queryKey: ['bed-tension', facility.id],
    queryFn: () => api.get<TensionRow[]>('/api/lits/capacities/tension/', { facility: facility.id }),
    refetchInterval: 60_000,
  })
  const row = data?.[0]
  if (!row) return null
  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border px-4 py-3 ${TENSION_STYLE[row.level]}`}
      role="status"
    >
      <span className="flex items-center gap-2 text-sm font-bold">
        <Gauge className="h-4 w-4" aria-hidden="true" />
        Niveau {row.level} · {row.label}
      </span>
      <span className={`text-xs ${row.level === 4 ? 'text-white' : 'text-fg'}`}>{row.action}</span>
      {row.reasons.length > 0 && (
        <span className={`text-xs ${row.level === 4 ? 'text-white/80' : 'text-muted'}`}>
          ({row.reasons.join(', ')})
        </span>
      )}
    </div>
  )
}
