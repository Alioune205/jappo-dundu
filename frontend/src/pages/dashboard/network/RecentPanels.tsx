import React from 'react'
import { Link } from 'react-router'
import { Ambulance, BedDouble, Droplets } from 'lucide-react'
import { EmptyNote, Panel } from '@/components/dash/Panel'
import { ACCENT_TILE, SIGNAL_DOT, occupancySignal, type Accent, type Signal } from '@/components/dash/tones'
import { formatRelative } from '@/lib/format'
import type { BedCapacity, BloodRequest, Mission } from '@/types/api'
import { groupLabel, shortCategory } from '../shared'

interface ActivityItem {
  id: string
  icon: React.ElementType
  accent: Accent
  title: string
  where: string
  at: string
  signal: Signal
  to: string
}

interface RecentActivityProps {
  requests: BloodRequest[]
  missions: Mission[]
  capacities: BedCapacity[]
  now: number
  loading: boolean
  /** Nombre de lignes affichées. */
  limit?: number
  i?: number
  className?: string
}

/**
 * Activités récentes : les derniers enregistrements des trois modules
 * (demandes de sang ouvertes, missions en cours, lits déclarés), datés.
 */
export const RecentActivityPanel: React.FC<RecentActivityProps> = ({
  requests,
  missions,
  capacities,
  now,
  loading,
  limit = 5,
  i = 0,
  className = '',
}) => {
  const items: ActivityItem[] = [
    ...requests.map((r) => ({
      id: `r-${r.id}`,
      icon: Droplets,
      accent: 'red' as const,
      title: `Demande de sang ${groupLabel(r.blood_group)}`,
      where: r.facility?.name ?? 'Établissement',
      at: r.created_at,
      signal: (r.urgency === 'critical' ? 'critical' : r.urgency === 'urgent' ? 'warning' : 'info') as Signal,
      to: '/blood',
    })),
    ...missions.map((m) => ({
      id: `m-${m.id}`,
      icon: Ambulance,
      accent: 'green' as const,
      title: `Mission SAMU · ${m.status_display}`,
      where: m.pickup_address || m.region_display,
      at: m.created_at,
      signal: (m.status === 'pending' ? 'warning' : 'ok') as Signal,
      to: '/ambulances',
    })),
    ...capacities.map((c) => ({
      id: `c-${c.id}`,
      icon: BedDouble,
      accent: 'blue' as const,
      title: `Lits déclarés · ${shortCategory(c.category, c.category_display)}`,
      where: c.facility?.name ?? 'Établissement',
      at: c.updated_at,
      signal: occupancySignal(c.total_beds > 0 ? c.occupied_beds / c.total_beds : null),
      to: '/beds',
    })),
  ]
    .filter((item) => item.at)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit)

  return (
    <Panel
      i={i}
      className={className}
      title="Journal"
      subtitle="Derniers enregistrements des trois modules"
      bodyClassName="pb-3 pt-2"
    >
      {loading ? (
        <div className="space-y-3 px-5 pb-3" aria-label="Chargement">
          {[0, 1, 2].map((k) => (
            <span key={k} className="skeleton block h-10 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyNote title="Aucune activité récente" />
      ) : (
        <ul className="divide-y divide-line px-2">
          {items.map((item) => {
            const Icon = item.icon
            return (
              <li key={item.id}>
                <Link
                  to={item.to}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-raised"
                >
                  <span aria-hidden="true" className={`flex h-8 w-8 items-center justify-center rounded-lg ${ACCENT_TILE[item.accent]}`}>
                    <Icon className="h-4 w-4" strokeWidth={1.9} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-fg">{item.title}</span>
                    <span className="block truncate text-2xs text-muted">{item.where}</span>
                  </span>
                  <span className="num whitespace-nowrap text-2xs text-subtle">{formatRelative(item.at, now)}</span>
                  <span aria-hidden="true" className={`h-2 w-2 rounded-full ${SIGNAL_DOT[item.signal]}`} />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
