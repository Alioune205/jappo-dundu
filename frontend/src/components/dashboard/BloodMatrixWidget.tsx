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
    <div className="rounded-xl border border-slate-800 bg-[#0c121e] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-900/60">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Tension des Réserves Sanguines
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Déficits déclarés par groupe ABO/Rh</p>
        </div>
        <Link
          to="/blood"
          className="text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
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
                    ? 'border-rose-500/50 bg-rose-500/10'
                    : item.hasDeficit
                    ? 'border-amber-500/40 bg-amber-500/5'
                    : 'border-slate-800 bg-slate-900/60'
                }`}
              >
                <div className="flex items-center justify-center gap-1">
                  <span className="font-mono font-bold text-sm text-white">{item.group}</span>
                  {isOminus && (
                    <span className="text-[9px] font-bold text-rose-400" title="Donneur universel">
                      ★
                    </span>
                  )}
                </div>

                <div className="mt-1">
                  {item.hasDeficit ? (
                    <div>
                      <span className="font-mono font-bold text-xs text-rose-400 block">
                        -{item.needed} p.
                      </span>
                      <span className="text-[9px] text-slate-400 uppercase font-medium">
                        {item.isCritical ? 'Vital' : 'Urgent'}
                      </span>
                    </div>
                  ) : (
                    <div>
                      <span className="text-xs font-mono font-semibold text-emerald-400 block">
                        OK
                      </span>
                      <span className="text-[9px] text-slate-400 uppercase">Stable</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-3.5 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
          <span>★ O- : Donneur universel d'urgence vitale</span>
          <Link
            to="/blood"
            className="text-rose-400 hover:text-rose-300 font-semibold hover:underline"
          >
            Lancer un appel donneurs ➔
          </Link>
        </div>
      </div>
    </div>
  )
}
