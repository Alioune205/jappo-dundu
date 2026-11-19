import React from 'react'
import { Link } from 'react-router'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { Panel } from './Panel'

export interface UrgentItem {
  severity: 'critical' | 'warning'
  /** Nature du point (« Demande vitale », « Sans ambulance »). */
  tag: string
  /** Lieu ou établissement concerné. */
  heading: string
  /** Chiffre qui compte (« 5 poches »), avec sa précision (« de sang O− »). */
  big?: string
  bigNote?: string
  meta?: string
  /** Avancement (poches réunies sur poches demandées). */
  progress?: { done: number; total: number; left: string; right: string }
  /** Complément libre : chronomètre, donneurs en route, boutons d'action. */
  extra?: React.ReactNode
  /** Une seule action, qui mène à l'écran où traiter le point. */
  action?: { to: string; label: string }
}

interface UrgentCardProps {
  i?: number
  className?: string
  title?: string
  subtitle?: string
  loading?: boolean
  /** Le point le plus pressant ; `null` : rien d'urgent. */
  item: UrgentItem | null
  /** Autres points en attente, derrière celui-ci. */
  more?: { count: number; to: string }
  /** Phrase de l'état calme. */
  calm?: string
}

/**
 * « À traiter maintenant » : un seul point, le plus pressant, avec ce qu'il
 * faut savoir et un seul bouton. Quand il n'y a rien d'urgent, la carte le dit
 * calmement au lieu de disparaître : la page garde sa forme.
 */
export const UrgentCard: React.FC<UrgentCardProps> = ({
  i = 1,
  className = '',
  title = 'À traiter maintenant',
  subtitle,
  loading = false,
  item,
  more,
  calm = 'Rien d’urgent pour le moment.',
}) => {
  const critical = item?.severity === 'critical'
  const pct = item?.progress && item.progress.total > 0 ? Math.min(100, (item.progress.done / item.progress.total) * 100) : 0
  return (
    <Panel i={i} className={className} title={title} subtitle={subtitle} bodyClassName="flex flex-col px-5 pb-5 pt-3">
      {loading ? (
        <div className="space-y-3" aria-label="Chargement">
          <span className="skeleton block h-6 w-28" />
          <span className="skeleton block h-8 w-44" />
          <span className="skeleton block h-2 w-full" />
        </div>
      ) : !item ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ok/10 text-ok">
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="max-w-[16rem] text-sm text-muted">{calm}</p>
        </div>
      ) : (
        <>
          <span
            className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
              critical ? 'bg-critical/10 text-critical' : 'bg-warning/10 text-warning'
            }`}
          >
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${critical ? 'live-pulse bg-critical' : 'bg-warning'}`} />
            {item.tag}
          </span>

          <p className="mt-3 text-lg font-bold leading-tight tracking-[-0.02em] text-fg">{item.heading}</p>

          {item.big && (
            <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
              <span className="num text-[1.75rem] font-extrabold leading-none tracking-[-0.03em] text-fg">{item.big}</span>
              {item.bigNote && <span className="text-sm text-muted">{item.bigNote}</span>}
            </p>
          )}
          {item.meta && <p className="mt-1.5 text-xs text-muted">{item.meta}</p>}

          {item.progress && (
            <div className="mt-4">
              <div
                className="h-2 overflow-hidden rounded-full bg-track"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={item.progress.total}
                aria-valuenow={item.progress.done}
                aria-label={`${item.progress.left} · ${item.progress.right}`}
              >
                <span className={`block h-full rounded-full ${critical ? 'bg-viz-crit' : 'bg-viz-warn'}`} style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1.5 flex justify-between text-2xs text-muted">
                <span>{item.progress.left}</span>
                <span>{item.progress.right}</span>
              </p>
            </div>
          )}

          {item.extra && <div className="mt-4">{item.extra}</div>}

          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-5">
            {item.action ? (
              <Link
                to={item.action.to}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-brand px-4 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-strong"
              >
                {item.action.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            ) : (
              <span />
            )}
            {more && more.count > 0 && (
              <Link to={more.to} className="text-xs font-medium text-muted underline-offset-4 hover:text-fg hover:underline">
                {more.count === 1 ? '1 autre point' : `${more.count} autres points`}
              </Link>
            )}
          </div>
        </>
      )}
    </Panel>
  )
}
