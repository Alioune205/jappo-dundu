import React from 'react'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { EmptyNote } from './Panel'

export interface PriorityItem {
  id: string
  severity: 'critical' | 'warning'
  /** Domaine concerné (« Sang », « Lits », « SAMU », « Prévisions »). */
  domain: string
  title: string
  meta: string
  to: string
}

/**
 * File « à traiter maintenant » : tout ce qui demande une intervention, du
 * plus grave au moins grave, chaque ligne menant à l'écran où agir. Le sens
 * tient dans une pastille auréolée et la couleur du domaine, sans filet.
 */
export const PriorityFeed: React.FC<{ items: PriorityItem[]; limit?: number }> = ({ items, limit = 6 }) => {
  if (items.length === 0) {
    return (
      <EmptyNote
        tone="calm"
        title="Aucune situation ne requiert d’intervention"
        hint="Pas d’urgence vitale ouverte, de mission en attente, de service saturé ni de pénurie critique prévue sur votre périmètre."
      />
    )
  }
  const shown = items.slice(0, limit)
  return (
    <>
      <ul className="space-y-0.5 px-2 pb-2">
        {shown.map((item, index) => {
          const critical = item.severity === 'critical'
          return (
            <li key={item.id} className="reveal" style={{ '--i': index + 2 } as React.CSSProperties}>
              <Link
                to={item.to}
                className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3.5 rounded-2xl px-3 py-3 transition-colors hover:bg-raised"
              >
                <span
                  aria-hidden="true"
                  className={`flex h-9 w-9 items-center justify-center rounded-full ${critical ? 'bg-critical/10' : 'bg-warning/10'}`}
                >
                  <span className={`h-2 w-2 rounded-full ${critical ? 'bg-critical' : 'bg-viz-warn'}`} />
                </span>
                <span className="min-w-0">
                  <span className={`block text-2xs font-medium ${critical ? 'text-critical' : 'text-warning'}`}>
                    {item.domain}
                    <span className="sr-only">{critical ? ' (critique)' : ' (vigilance)'}</span>
                  </span>
                  <span className="block truncate text-sm font-semibold text-fg">{item.title}</span>
                  <span className="block truncate text-xs text-muted">{item.meta}</span>
                </span>
                <ChevronRight
                  className="h-4 w-4 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg"
                  aria-hidden="true"
                />
              </Link>
            </li>
          )
        })}
      </ul>
      {items.length > limit && (
        <p className="px-5 pb-4 text-2xs text-muted">
          + {items.length - limit} autre{items.length - limit > 1 ? 's' : ''} point{items.length - limit > 1 ? 's' : ''}{' '}
          d’attention dans les modules.
        </p>
      )}
    </>
  )
}
