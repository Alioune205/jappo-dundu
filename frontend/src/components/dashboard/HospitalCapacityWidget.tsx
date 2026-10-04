import React from 'react'
import { Link } from 'react-router'
import { ArrowRight } from 'lucide-react'
import type { BedCapacity } from '@/types/api'

interface HospitalCapacityWidgetProps {
  capacities: BedCapacity[]
}

export const HospitalCapacityWidget: React.FC<HospitalCapacityWidgetProps> = ({ capacities }) => {
  // Filtrer en priorité les services critiques (urgences, réanimation)
  const criticalCapacities = capacities.filter(
    (c) => c.category === 'emergency' || c.category === 'intensive_care',
  )

  return (
    <div className="clinical-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-main)] bg-[var(--bg-subtle)]">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-main)]">
            Tension Hospitalière (Urgences & Réa)
          </h3>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Capacité d'accueil immédiate</p>
        </div>
        <Link
          to="/beds"
          className="text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-main)] flex items-center gap-1 transition-colors"
        >
          Orienter <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="p-4 space-y-3.5">
        {criticalCapacities.length === 0 ? (
          <div className="text-center py-6 text-xs text-[var(--text-muted)]">
            Aucun service d'urgence renseigné.
          </div>
        ) : (
          criticalCapacities.slice(0, 6).map((cap) => {
            const isCritical = cap.occupancy_rate > 0.85
            const isWarning = cap.occupancy_rate > 0.70
            const percentage = Math.round(cap.occupancy_rate * 100)

            return (
              <div key={cap.id} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="truncate pr-2">
                    <span className="font-semibold text-[var(--text-main)] truncate block">
                      {cap.facility?.name}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {cap.category_display} • {cap.facility?.city}
                    </span>
                  </div>

                  <div className="text-right shrink-0">
                    <span
                      className={`font-mono font-bold text-xs ${
                        isCritical
                          ? 'text-rose-600 dark:text-rose-400'
                          : isWarning
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {cap.available_beds} lits libres
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)] block font-mono">
                      {cap.occupied_beds}/{cap.total_beds} ({percentage}%)
                    </span>
                  </div>
                </div>

                {/* Barre de tension visuelle */}
                <div className="h-1.5 w-full rounded-full bg-[var(--bg-subtle)] overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      isCritical
                        ? 'bg-rose-500'
                        : isWarning
                        ? 'bg-amber-400'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, percentage)}%` }}
                  />
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
