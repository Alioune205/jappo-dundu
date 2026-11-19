import React from 'react'
import { Link } from 'react-router'
import { ArrowRight } from 'lucide-react'
import { useNow } from '@/lib/useNow'
import { PriorityFeed, type PriorityItem } from '@/components/dash/PriorityFeed'
import type { Mission } from '@/types/api'
import { ASSIGN_TARGET_MINUTES } from './status'

/** File « à traiter maintenant » : les plus graves d'abord, chaque ligne mène à l'écran où agir. */
export const AlertsCard: React.FC<{ items: PriorityItem[]; i?: number; limit?: number }> = ({ items, i = 0, limit = 5 }) => {
  const critical = items.filter((item) => item.severity === 'critical').length
  return (
    <section className="panel reveal flex flex-col" style={{ '--i': i } as React.CSSProperties} aria-labelledby="alerts-card-title">
      <header className="flex items-start justify-between gap-3 px-5 pb-2 pt-5">
        <div>
          <h2 id="alerts-card-title" className="text-[0.9375rem] font-bold leading-6 tracking-[-0.01em] text-fg">
            À traiter maintenant
          </h2>
          <p className="mt-0.5 text-xs text-subtle">
            {items.length === 0
              ? 'Rien en attente sur votre périmètre'
              : `${critical} critique${critical > 1 ? 's' : ''} · ${items.length - critical} en vigilance`}
          </p>
        </div>
        <span
          className={`num flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-bold ${
            critical > 0 ? 'bg-critical text-on-critical' : items.length > 0 ? 'bg-warning/10 text-warning' : 'bg-sunken text-muted'
          }`}
        >
          {items.length}
          <span className="sr-only"> point{items.length > 1 ? 's' : ''} à traiter</span>
        </span>
      </header>
      <PriorityFeed items={items} limit={limit} />
    </section>
  )
}

const two = (n: number) => String(n).padStart(2, '0')

/**
 * Attente en cours : la plus ancienne mission SAMU encore sans ambulance,
 * chronométrée en direct face au délai cible d'affectation. C'est le seul
 * chiffre qui change à la seconde sur l'écran : il a sa carte d'encre.
 */
export const WaitCard: React.FC<{ missions: Mission[]; i?: number; loading?: boolean }> = ({ missions, i = 0, loading = false }) => {
  const now = useNow(1000)
  const pending = missions
    .filter((m) => m.status === 'pending')
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  const oldest = pending[0]
  const waited = oldest ? Math.max(0, Math.floor((now - new Date(oldest.created_at).getTime()) / 1000)) : 0
  const late = waited >= ASSIGN_TARGET_MINUTES * 60
  const ratio = Math.min(1, waited / (ASSIGN_TARGET_MINUTES * 60))
  const hours = Math.floor(waited / 3600)
  const clock = `${hours > 0 ? `${two(hours)}:` : ''}${two(Math.floor((waited % 3600) / 60))}:${two(waited % 60)}`

  return (
    <section
      className="ink-card ink-lines reveal relative isolate overflow-hidden rounded-[1.125rem] p-5 text-white"
      style={{ '--i': i } as React.CSSProperties}
      aria-labelledby="wait-card-title"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="wait-card-title" className="text-[0.9375rem] font-semibold">
          Attente sans ambulance
        </h2>
        {pending.length > 1 && (
          <span className="num rounded-full bg-white/10 px-2 py-0.5 text-2xs font-semibold ring-1 ring-inset ring-white/15">
            {pending.length} en attente
          </span>
        )}
      </div>

      {loading ? (
        <span className="mt-4 block h-12 w-40 animate-pulse rounded-lg bg-white/10" aria-label="Chargement" />
      ) : !oldest ? (
        <>
          <p className="num mt-3 text-[2.75rem] font-semibold leading-none tracking-[-0.03em] text-white/35" aria-hidden="true">
            00:00
          </p>
          <p className="mt-3 text-xs text-on-ink-muted">Aucune mission en attente : toutes ont une ambulance.</p>
        </>
      ) : (
        <>
          <p
            className={`num mt-3 text-[2.75rem] font-semibold leading-none tracking-[-0.03em] ${late ? 'text-critical-on-ink' : 'text-white'}`}
            role="timer"
            aria-label={`Attente de ${Math.floor(waited / 60)} minutes`}
          >
            {clock}
          </p>
          <p className="mt-2 truncate text-xs text-on-ink-muted">
            {oldest.priority_display} · {oldest.pickup_address || oldest.region_display}
          </p>
          <div className="mt-4">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/12" aria-hidden="true">
              <div
                className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${late ? 'bg-critical-on-ink' : 'bg-white'}`}
                style={{ width: `${ratio * 100}%` }}
              />
            </div>
            <p className="mt-1.5 flex justify-between text-2xs text-on-ink-muted">
              <span>{late ? 'Délai cible dépassé' : 'Délai cible d’affectation'}</span>
              <span className="num">{ASSIGN_TARGET_MINUTES} min</span>
            </p>
          </div>
          <Link
            to="/ambulances"
            className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-xs font-semibold text-[#0b1d4a] transition-colors hover:bg-white/90"
          >
            Affecter une ambulance <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </>
      )}
    </section>
  )
}
