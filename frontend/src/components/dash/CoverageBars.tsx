import React from 'react'

export interface CoverageRow {
  key: string
  label: string
  /** Ex. « 2 demandes ». */
  count: string
  got: number
  need: number
  /** Classe de remplissage (bg-viz-crit, bg-viz-warn, bg-viz-base). */
  fillClass: string
}

/**
 * Part réunie sur la part demandée, par catégorie. Une piste rayée (ce qui
 * manque) et un remplissage plein (ce qui est réuni), le chiffre exact à droite.
 */
export const CoverageBars: React.FC<{ rows: CoverageRow[]; unit: string }> = ({ rows, unit }) => (
  <ul className="space-y-4">
    {rows.map((row, index) => {
      const pct = row.need > 0 ? Math.min(100, (row.got / row.need) * 100) : 0
      return (
        <li key={row.key}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <span className="text-sm font-semibold text-fg">
              {row.label} <span className="ml-1 text-xs font-normal text-muted">{row.count}</span>
            </span>
            <span className="num text-sm font-semibold text-fg">
              {row.got} <span className="font-normal text-muted">/ {row.need} {unit}</span>
            </span>
          </div>
          <div
            className="hatch-track h-3 w-full overflow-hidden rounded-full"
            role="meter"
            aria-label={`${row.label} : ${row.got} sur ${row.need} ${unit}`}
            aria-valuemin={0}
            aria-valuemax={row.need}
            aria-valuenow={row.got}
          >
            <div
              className={`bar-fill bar-grow h-full rounded-full ${row.fillClass}`}
              style={{ width: `${pct}%`, '--i': index } as React.CSSProperties}
            />
          </div>
        </li>
      )
    })}
  </ul>
)
