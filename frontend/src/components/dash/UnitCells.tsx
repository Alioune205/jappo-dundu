import React from 'react'

interface UnitCellsProps {
  /** Nombre d'unités demandées (poches, lits…). */
  total: number
  /** Unités déjà réunies : les premières cellules sont pleines. */
  filled: number
  /** Description pour les lecteurs d'écran. */
  label: string
  /** « dark » : sur une carte d'encre. */
  tone?: 'light' | 'dark'
  /** Cellules pleines en rouge (demande vitale). */
  critical?: boolean
  className?: string
}

/** Au-delà, une cellule représente plusieurs unités (la grille reste lisible). */
const MAX_CELLS = 96

/**
 * Une cellule = une unité réelle (une poche de sang). Plus parlant qu'une
 * barre de pourcentage : on compte à l'œil ce qui est réuni et ce qui manque.
 */
export const UnitCells: React.FC<UnitCellsProps> = ({
  total,
  filled,
  label,
  tone = 'light',
  critical = false,
  className = '',
}) => {
  if (total <= 0) return null
  const per = Math.max(1, Math.ceil(total / MAX_CELLS))
  const cells = Math.ceil(total / per)
  const on = Math.min(cells, Math.round(Math.max(0, filled) / per))
  const full = tone === 'dark' ? 'bg-white' : critical ? 'bg-viz-crit' : 'bg-viz-base'
  const empty =
    tone === 'dark' ? 'bg-critical-on-ink/25 ring-1 ring-inset ring-critical-on-ink/50' : 'bg-track ring-1 ring-inset ring-line-strong/60'

  return (
    <div role="img" aria-label={label} className={`flex flex-wrap gap-[3px] ${className}`}>
      {Array.from({ length: cells }, (_, k) => (
        <span
          key={k}
          aria-hidden="true"
          className={`cell-in block h-3.5 w-2.5 rounded-[3px] ${k < on ? full : empty}`}
          style={{ '--k': k } as React.CSSProperties}
        />
      ))}
    </div>
  )
}
