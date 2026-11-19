import React from 'react'
import { Ambulance, BedDouble, BrainCircuit, ChevronRight, Droplets, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'
import { EmptyNote } from './Panel'

/** Pictogramme selon le domaine annoncé en tête du libellé (« Sang · … »). */
function domainIcon(domain: string): React.ElementType {
  const key = domain.split('·')[0].trim().toLowerCase()
  if (key.startsWith('sang')) return Droplets
  if (key.startsWith('lit')) return BedDouble
  if (key.startsWith('samu')) return Ambulance
  if (key.startsWith('prévision')) return BrainCircuit
  return TriangleAlert
}

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
 * plus grave au moins grave, chaque ligne menant à l'écran où agir. Un filet
 * de gravité à gauche, le domaine en petit, le titre en entier (jamais
 * tronqué : c'est lui qu'on doit lire).
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
      <ul className="px-3 pb-2">
        {shown.map((item, index) => {
          const critical = item.severity === 'critical'
          const Icon = domainIcon(item.domain)
          return (
            <li key={item.id} className="reveal border-t border-line first:border-t-0" style={{ '--i': index + 2 } as React.CSSProperties}>
              <Link
                to={item.to}
                className="group grid grid-cols-[3px_minmax(0,1fr)_auto] items-stretch gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-raised"
              >
                <span aria-hidden="true" className={`rounded-full ${critical ? 'bg-critical' : 'bg-viz-warn'}`} />
                <span className="min-w-0">
                  <span className={`flex items-center gap-1.5 text-2xs font-semibold ${critical ? 'text-critical' : 'text-warning'}`}>
                    <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                    {item.domain}
                    <span className="sr-only">{critical ? ' (critique)' : ' (vigilance)'}</span>
                  </span>
                  <span className="mt-0.5 block text-sm font-semibold leading-snug text-fg">{item.title}</span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted">{item.meta}</span>
                </span>
                <ChevronRight
                  className="h-4 w-4 self-center text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg"
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
