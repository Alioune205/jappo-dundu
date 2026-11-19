import React from 'react'
import type { Signal } from './tones'

export type CalendarRisk = 'CRITICAL' | 'WARNING' | 'NORMAL' | null

export interface CalendarDay {
  key: string
  /** « mar. », « mer. »… */
  weekday: string
  /** Numéro du jour. */
  day: number
  today?: boolean
}

export interface CalendarRow {
  key: string
  label: string
  /** Une case par jour, dans l'ordre de `days`. */
  cells: { risk: CalendarRisk; tip: string }[]
  /** Résumé à droite : « critique mer. 11 », « rien de prévu ». */
  summary: string
  signal: Signal
}

const CELL: Record<'CRITICAL' | 'WARNING' | 'NONE', string> = {
  CRITICAL: 'bg-viz-crit',
  WARNING: 'bg-viz-warn/85',
  NONE: 'bg-track',
}

/**
 * Calendrier des pénuries : une ligne par groupe sanguin, une case par jour.
 * Il dit QUAND le risque arrive, pas seulement combien. Une case colorée est
 * une prévision réelle du modèle pour ce jour ; une case pâle, l'absence de
 * risque annoncé.
 */
export const RiskCalendar: React.FC<{
  days: CalendarDay[]
  rows: CalendarRow[]
  /** Ligne mise en avant (filtre de l'écran) : les autres s'estompent. */
  selectedKey?: string | null
  ariaLabel: string
}> = ({ days, rows, selectedKey = null, ariaLabel }) => (
  <div role="table" aria-label={ariaLabel} className="px-5 pb-1 pt-2">
    <div
      role="row"
      className="mb-1.5 grid items-end gap-x-1.5 text-center text-2xs text-subtle"
      style={{ gridTemplateColumns: `2.75rem repeat(${days.length}, minmax(0, 1fr)) 6.25rem` }}
    >
      <span role="columnheader" className="sr-only">
        Groupe
      </span>
      {days.map((d) => (
        <span key={d.key} role="columnheader" className={d.today ? 'font-semibold text-fg' : ''}>
          <span className="block leading-3">{d.weekday}</span>
          <span className="num block text-xs leading-4">{d.day}</span>
        </span>
      ))}
      <span role="columnheader" className="sr-only">
        Résumé
      </span>
    </div>

    <div className="space-y-1.5">
      {rows.map((row) => (
        <div
          key={row.key}
          role="row"
          className={`grid items-center gap-x-1.5 transition-opacity duration-300 ${
            selectedKey && selectedKey !== row.key ? 'opacity-40' : ''
          }`}
          style={{ gridTemplateColumns: `2.75rem repeat(${days.length}, minmax(0, 1fr)) 6.25rem` }}
        >
          <span role="rowheader" className="num text-sm font-semibold text-fg">
            {row.label}
          </span>
          {row.cells.map((cell, k) => (
            <span
              key={days[k].key}
              role="cell"
              title={cell.tip}
              aria-label={cell.tip}
              className={`cal-cell block h-7 rounded-lg ${CELL[cell.risk === 'CRITICAL' || cell.risk === 'WARNING' ? cell.risk : 'NONE']}`}
              style={{ '--k': k } as React.CSSProperties}
            />
          ))}
          <span
            role="cell"
            className={`truncate pl-2 text-2xs font-medium ${
              row.signal === 'critical' ? 'text-critical' : row.signal === 'warning' ? 'text-warning' : 'text-subtle'
            }`}
          >
            {row.summary}
          </span>
        </div>
      ))}
    </div>
  </div>
)
