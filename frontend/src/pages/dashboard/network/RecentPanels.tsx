import React from 'react'
import { Link } from 'react-router'
import { Ambulance, ArrowRight, BedDouble, Building2, Clock3, Droplets } from 'lucide-react'
import { EmptyNote, Panel } from '@/components/dash/Panel'
import { ACCENT_TILE, SIGNAL_DOT, SIGNAL_FILL, occupancySignal, type Accent, type Signal } from '@/components/dash/tones'
import { formatNumber, formatPercent, formatRelative } from '@/lib/format'
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
    .slice(0, 5)

  return (
    <Panel
      i={i}
      className={className}
      eyebrow="Journal"
      title={
        <span className="flex items-center gap-2">
          <Clock3 className="h-[1.125rem] w-[1.125rem] text-tint-blue" aria-hidden="true" />
          Activités récentes
        </span>
      }
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

interface FacilitiesPanelProps {
  capacities: BedCapacity[]
  loading: boolean
  canOpenFacilities: boolean
  i?: number
  className?: string
}

/** Établissements principaux : les plus grandes capacités déclarées et leur taux d'occupation. */
export const FacilitiesPanel: React.FC<FacilitiesPanelProps> = ({ capacities, loading, canOpenFacilities, i = 0, className = '' }) => {
  const byFacility = new Map<number, { name: string; region: string; total: number; occupied: number }>()
  for (const c of capacities) {
    if (!c.facility) continue
    const entry = byFacility.get(c.facility.id) ?? {
      name: c.facility.name,
      region: c.facility.region_display || c.facility.region,
      total: 0,
      occupied: 0,
    }
    entry.total += c.total_beds
    entry.occupied += c.occupied_beds
    byFacility.set(c.facility.id, entry)
  }
  const top = [...byFacility.entries()]
    .filter(([, f]) => f.total > 0)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 3)

  return (
    <Panel
      i={i}
      className={className}
      eyebrow="Réseau"
      title={
        <span className="flex items-center gap-2">
          <Building2 className="h-[1.125rem] w-[1.125rem] text-tint-blue" aria-hidden="true" />
          Établissements principaux
        </span>
      }
      subtitle="Plus grandes capacités déclarées · lits occupés"
      actions={
        canOpenFacilities && (
          <Link to="/facilities" className="inline-flex items-center gap-1 text-xs font-medium text-tint-blue hover:underline">
            Voir tout <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        )
      }
      bodyClassName="px-5 pb-5 pt-3"
    >
      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Chargement">
          {[0, 1, 2].map((k) => (
            <span key={k} className="skeleton block h-28" />
          ))}
        </div>
      ) : top.length === 0 ? (
        <EmptyNote title="Aucune capacité déclarée" />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {top.map(([id, f]) => {
            const rate = f.occupied / f.total
            const signal = occupancySignal(rate)
            return (
              <li key={id} className="overflow-hidden rounded-xl bg-raised ring-1 ring-inset ring-line">
                <div className="flex h-14 items-center gap-2.5 bg-gradient-to-r from-tint-blue-soft to-transparent px-3">
                  <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface text-tint-blue shadow-[0_1px_2px_rgb(16_24_40/0.08)]">
                    <Building2 className="h-4 w-4" />
                  </span>
                  <span className="truncate text-2xs font-medium text-muted">{f.region}</span>
                </div>
                <div className="px-3 pb-3 pt-2.5">
                  <p className="line-clamp-2 min-h-8 text-xs font-semibold leading-4 text-fg" title={f.name}>
                    {f.name}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <span
                      className="h-1.5 flex-1 overflow-hidden rounded-full bg-track"
                      role="meter"
                      aria-label={`Lits occupés, ${f.name}`}
                      aria-valuemin={0}
                      aria-valuemax={f.total}
                      aria-valuenow={f.occupied}
                    >
                      <span className={`bar-fill block h-full rounded-full ${SIGNAL_FILL[signal]}`} style={{ width: `${rate * 100}%` }} />
                    </span>
                    <span className="num text-xs font-bold text-fg">{formatPercent(rate)}</span>
                  </div>
                  <p className="num mt-1 text-2xs text-subtle">
                    {formatNumber(f.occupied)} / {formatNumber(f.total)} lits
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
