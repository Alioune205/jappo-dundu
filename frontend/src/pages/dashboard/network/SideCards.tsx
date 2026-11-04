import React, { useContext } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, BellRing, CircleCheck, TriangleAlert } from 'lucide-react'
import { api } from '@/lib/api'
import { formatTime } from '@/lib/format'
import { AssistantContext } from '@/components/ai/useAssistant'
import { JappoEmblem } from '@/components/ai/JappoEmblem'
import { PriorityFeed, type PriorityItem } from '@/components/dash/PriorityFeed'

/** Alertes prioritaires : bandeau rouge, puis la file « à traiter » (les plus graves d'abord). */
export const AlertsCard: React.FC<{ items: PriorityItem[]; i?: number }> = ({ items, i = 0 }) => (
  <section
    className="panel reveal overflow-hidden"
    style={{ '--i': i } as React.CSSProperties}
    aria-labelledby="alerts-card-title"
  >
    <header className="flex items-center justify-between gap-3 bg-gradient-to-r from-[#e5484d] to-[#f0646b] px-5 py-3.5 text-white">
      <h2 id="alerts-card-title" className="flex items-center gap-2 text-[0.9375rem] font-bold">
        <BellRing className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
        Alertes prioritaires
      </h2>
      <span className="num flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-1.5 text-xs font-bold text-[#d92d20]">
        {items.length}
        <span className="sr-only"> alerte{items.length > 1 ? 's' : ''}</span>
      </span>
    </header>
    <div className="pt-4">
      <PriorityFeed items={items} limit={4} />
    </div>
  </section>
)

/** Carte d'encre : fond bleu nuit, halo et symbole du logo en filigrane. */
const InkCard: React.FC<{ children: React.ReactNode; i?: number; labelledBy?: string; decor?: boolean }> = ({
  children,
  i = 0,
  labelledBy,
  decor = true,
}) => (
  <section
    className="ink-card reveal relative isolate overflow-hidden rounded-[1.125rem] p-5 text-white"
    style={{ '--i': i } as React.CSSProperties}
    aria-labelledby={labelledBy}
  >
    {decor && (
      <img
        src="/logo-mark-dark.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-6 -right-6 -z-10 h-32 w-32 opacity-25"
      />
    )}
    {children}
  </section>
)

/** Appel à l'action : organiser une collecte (module des collectes de sang). */
export const DriveCard: React.FC<{ i?: number }> = ({ i = 0 }) => (
  <InkCard i={i} labelledBy="drive-card-title">
    <h2 id="drive-card-title" className="max-w-[13rem] text-base font-bold leading-snug">
      Donner son sang, c’est sauver des vies.
    </h2>
    <Link
      to="/blood"
      className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-semibold text-[#0b1d4a] transition-colors hover:bg-white/90"
    >
      Organiser une collecte <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  </InkCard>
)

/** Jappo IA : une question sur le réseau, réponse chiffrée à partir des données. */
export const AssistantCard: React.FC<{ i?: number }> = ({ i = 0 }) => {
  // Hors de la coque de l'application (tests isolés), la carte n'a rien à ouvrir.
  const assistant = useContext(AssistantContext)
  if (!assistant) return null
  return (
    <InkCard i={i} labelledBy="assistant-card-title">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 ring-1 ring-inset ring-white/15">
        <JappoEmblem className="h-5 w-5 text-white" pulseClassName="text-critical-on-ink" />
      </span>
      <h2 id="assistant-card-title" className="mt-3 max-w-[14rem] text-base font-bold leading-snug">
        Une question sur le réseau ?
      </h2>
      <p className="mt-1 max-w-[15rem] text-2xs leading-relaxed text-white/70">
        Lits, sang, SAMU : Jappo IA répond à partir des données de la plateforme.
      </p>
      <button
        type="button"
        onClick={assistant.open}
        aria-haspopup="dialog"
        className="mt-4 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full bg-white px-3 text-xs font-semibold text-[#0b1d4a] transition-colors hover:bg-white/90"
      >
        Demander à Jappo IA <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </InkCard>
  )
}

interface StatusPayload {
  status: 'healthy' | 'degraded'
  checks: Record<string, { status: string }>
}

/** Ce qu'une panne change pour l'utilisateur (pas le détail technique). */
const CHECK_IMPACT: Record<string, string> = {
  database: 'Données momentanément inaccessibles.',
  channel_layer: 'Mises à jour en direct interrompues.',
  ml_model: 'Prévisions de pénurie indisponibles.',
}

/**
 * Statut système : sonde réelle de l'API (base, temps réel, modèle), relue
 * chaque minute. Une phrase seulement : ce qui marche, ou ce qui ne marche pas
 * pour l'utilisateur ; le détail technique reste dans /api/status/.
 */
export const SystemStatusCard: React.FC<{ i?: number }> = ({ i = 0 }) => {
  const query = useQuery<StatusPayload>({
    queryKey: ['system-status'],
    queryFn: () => api.get<StatusPayload>('/api/status/'),
    refetchInterval: 60_000,
  })
  const checks = Object.entries(query.data?.checks ?? {})
  const failing = checks.filter(([, c]) => c.status !== 'up')
  const healthy = query.data && failing.length === 0

  return (
    <InkCard i={i} labelledBy="status-card-title" decor={false}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            query.isError ? 'bg-white/15' : healthy ? 'bg-[#12b76a]' : 'bg-[#f79009]'
          }`}
        >
          {healthy ? <CircleCheck className="h-5 w-5" /> : <TriangleAlert className="h-5 w-5" />}
        </span>
        <div className="min-w-0">
          <h2 id="status-card-title" className="text-[0.9375rem] font-bold">
            Statut système
          </h2>
          <p className="mt-0.5 text-2xs leading-relaxed text-white/75">
            {query.isPending
              ? 'Vérification en cours…'
              : query.isError
                ? 'État des services indisponible.'
                : healthy
                  ? 'Tous les services fonctionnent normalement.'
                  : failing.map(([key]) => CHECK_IMPACT[key] ?? 'Un service est à surveiller.').join(' ')}
          </p>
        </div>
      </div>

      {/* Le tracé de pouls reprend le motif du logo : purement décoratif. */}
      <svg viewBox="0 0 120 24" aria-hidden="true" className="pointer-events-none mt-3 h-6 w-full text-ok-on-ink/70">
        <path d="M0 14h46l5-9 6 17 5-12 4 4h54" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {query.dataUpdatedAt > 0 && (
        <p className="num text-2xs text-white/60">Dernière vérification : {formatTime(new Date(query.dataUpdatedAt))}</p>
      )}
    </InkCard>
  )
}
