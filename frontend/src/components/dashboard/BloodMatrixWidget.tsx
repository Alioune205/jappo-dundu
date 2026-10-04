import React from 'react'
import { Link } from 'react-router'
import { ArrowRight } from 'lucide-react'
import type { BloodRequest } from '@/types/api'

interface BloodMatrixWidgetProps {
  bloodRequests: BloodRequest[]
}

const BLOOD_GROUPS_CATALOG = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+']

export const BloodMatrixWidget: React.FC<BloodMatrixWidgetProps> = ({ bloodRequests }) => {
  // Calculer les poches manquantes par groupe sanguin
  const shortagesByGroup = BLOOD_GROUPS_CATALOG.map((group) => {
    const matchingRequests = bloodRequests.filter((r) => r.blood_group === group)
    const needed = matchingRequests.reduce((acc, r) => acc + r.units_remaining, 0)
    const isCritical = matchingRequests.some((r) => r.urgency === 'critical')

    return {
      group,
      needed,
      isCritical,
      hasDeficit: needed > 0,
      requestsCount: matchingRequests.length,
    }
  })

  return (
    <div className="clinical-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-main)] bg-[var(--bg-subtle)]">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-main)]">
            Tension des Réserves Sanguines (CNTS)
          </h3>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Déficits déclarés par groupe ABO/Rh</p>
        </div>
        <Link
          to="/blood"
          className="text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-main)] flex items-center gap-1 transition-colors"
        >
          Mobiliser <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="p-4">
        {/* Grille 4x2 des 8 groupes sanguins */}
        <div className="grid grid-cols-4 gap-2">
          {shortagesByGroup.map((item) => {
            const isOminus = item.group === 'O-'
            return (
              <div
                key={item.group}
                className={`p-2.5 rounded-lg border text-center transition-all ${
                  item.isCritical
                    ? 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40'
                    : item.hasDeficit
                    ? 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30'
                    : 'border-[var(--border-main)] bg-[var(--bg-surface)]'
                }`}
              >
                <div className="flex items-center justify-center gap-1">
                  <span className="font-mono font-bold text-sm text-[var(--text-main)]">{item.group}</span>
                  {isOminus && (
                    <span className="text-[9px] font-bold text-rose-600 dark:text-rose-400" title="Donneur universel">
                      ★
                    </span>
                  )}
                </div>

                <div className="mt-1">
                  {item.hasDeficit ? (
                    <div>
                      <span className="font-mono font-bold text-xs text-rose-600 dark:text-rose-400 block">
                        -{item.needed} p.
                      </span>
                      <span className="text-[9px] text-[var(--text-muted)] uppercase font-semibold">
                        {item.isCritical ? 'Vital' : 'Urgent'}
                      </span>
                    </div>
                  ) : (
                    <div>
                      <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 block">
                        OK
                      </span>
                      <span className="text-[9px] text-[var(--text-muted)] uppercase">Stable</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-3.5 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px] text-[var(--text-muted)]">
          <span>★ O- : Donneur universel d'urgence vitale</span>
          <Link
            to="/blood"
            className="text-rose-600 dark:text-rose-400 hover:underline font-semibold"
          >
            Lancer un appel donneurs ➔
          </Link>
        </div>
      </div>
    </div>
  )
}
