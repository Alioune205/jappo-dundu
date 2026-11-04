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
 * plus grave au moins grave, chaque ligne menant à l'écran où agir. Chaque
 * ligne est une carte d'alerte : fond et pictogramme teintés selon la
 * gravité, pictogramme selon le domaine.
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
      <ul className="space-y-2 px-5 pb-5">
        {shown.map((item, index) => {
          const critical = item.severity === 'critical'
          const Icon = domainIcon(item.domain)
          return (
            <li key={item.id} className="reveal" style={{ '--i': index + 2 } as React.CSSProperties}>
              <Link
                to={item.to}
                className={`group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[0.625rem] border px-3 py-2.5 transition-colors ${
                  critical
                    ? 'border-critical/15 bg-critical/[0.035] hover:bg-critical/[0.07]'
                    : 'border-warning/15 bg-warning/[0.035] hover:bg-warning/[0.07]'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-9 w-9 items-center justify-center rounded-lg ${critical ? 'bg-critical/10 text-critical' : 'bg-warning/10 text-warning'}`}
                >
                  <Icon className="h-[1.125rem] w-[1.125rem]" strokeWidth={1.9} />
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
