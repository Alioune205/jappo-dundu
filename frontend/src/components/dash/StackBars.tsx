import React from 'react'

export interface StackPart {
  label: string
  value: number
  /** Classe de remplissage (bg-…) ; ignorée pour le reste. */
  className?: string
  /** Ce qui reste (lits libres) : laissé sur la piste pâle. */
  rest?: boolean
}

export interface StackRow {
  key: string
  label: string
  parts: StackPart[]
  /** Texte de droite (valeur résumée). */
  valueText: string
  /** Mise en avant de la ligne (ex. la plus tendue). */
  emphasis?: boolean
}

interface StackBarsProps {
  rows: StackRow[]
  /** Toutes les barres à la même longueur (parts en %), ou proportionnelles au total. */
  normalize?: boolean
  ariaLabel: string
  className?: string
}

/**
 * Barres horizontales empilées, une par ligne : comparer des régions ou des
 * établissements d'un coup d'œil. Chaque ligne est décrite en toutes lettres
 * pour les lecteurs d'écran.
 */
export const StackBars: React.FC<StackBarsProps> = ({ rows, normalize = true, ariaLabel, className = '' }) => {
  const maxTotal = Math.max(1, ...rows.map((r) => r.parts.reduce((acc, p) => acc + p.value, 0)))

  return (
    <ul className={`space-y-3 ${className}`} aria-label={ariaLabel}>
      {rows.map((row, index) => {
        const total = row.parts.reduce((acc, p) => acc + p.value, 0)
        const width = normalize ? 100 : (total / maxTotal) * 100
        return (
          <li
            key={row.key}
            className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_auto] items-center gap-3 text-xs"
            aria-label={`${row.label} : ${row.parts.map((p) => `${p.label} ${p.value}`).join(', ')}`}
          >
            <span className={`truncate ${row.emphasis ? 'font-semibold text-fg' : 'text-fg/80'}`} title={row.label}>
              {row.label}
            </span>
            <span className="relative block h-2 overflow-hidden rounded-full bg-track" aria-hidden="true">
              <span
                className="bar-fill bar-grow absolute inset-y-0 left-0 flex gap-[2px] overflow-hidden rounded-full"
                style={{ width: `${Math.max(width, total > 0 ? 2 : 0)}%`, '--i': index } as React.CSSProperties}
              >
                {row.parts.map((part) =>
                  part.value > 0 ? (
                    <span
                      key={part.label}
                      className={`bar-fill block h-full first:rounded-l-full last:rounded-r-full ${
                        part.rest ? '' : (part.className ?? 'bg-viz-base')
                      }`}
                      style={{ width: `${total > 0 ? (part.value / total) * 100 : 0}%` }}
                    />
                  ) : null
                )}
              </span>
            </span>
            <span className={`num w-[7.5rem] truncate whitespace-nowrap text-right ${row.emphasis ? 'font-semibold text-fg' : 'text-muted'}`}>
              {row.valueText}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
