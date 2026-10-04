import React from 'react'
import { Link } from 'react-router'
import { Ambulance, ArrowRight, Clock, MapPin, CheckCircle2 } from 'lucide-react'
import type { Mission } from '@/types/api'
import { formatTime } from '@/lib/format'

interface LiveDispatchQueueProps {
  missions: Mission[]
}

export const LiveDispatchQueue: React.FC<LiveDispatchQueueProps> = ({ missions }) => {
  return (
    <div className="clinical-card overflow-hidden">
      {/* En-tête du tableau de dispatch */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-main)] bg-[var(--bg-subtle)]">
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-main)]">
            File de Régulation & Interventions SMUR
          </h3>
          <span className="rounded bg-[var(--bg-surface)] border border-[var(--border-main)] px-2 py-0.5 text-[11px] font-mono font-semibold text-[var(--text-main)]">
            {missions.length} active(s)
          </span>
        </div>

        <Link
          to="/ambulances"
          className="text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-main)] flex items-center gap-1 transition-colors"
        >
          Console Complète <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Liste des interventions */}
      <div className="divide-y divide-[var(--border-subtle)]">
        {missions.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--text-muted)]">
            <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-2 opacity-70" />
            Aucune urgence en attente de régulation. Les équipes SMUR sont en veille opérationnelle.
          </div>
        ) : (
          missions.map((mission) => {
            const isCritical = mission.priority === 'critical'
            const isUrgent = mission.priority === 'urgent'

            return (
              <div
                key={mission.id}
                className="p-4 hover:bg-[var(--bg-subtle)] transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
              >
                {/* Identifiant & Priorité */}
                <div className="flex items-start gap-3 min-w-[220px]">
                  <div
                    className={`px-2 py-1 rounded font-mono font-bold text-[11px] shrink-0 border ${
                      isCritical
                        ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
                        : isUrgent
                        ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                        : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                    }`}
                  >
                    #{mission.id} • {mission.priority_display}
                  </div>
                  <div>
                    <div className="font-semibold text-[var(--text-main)] flex items-center gap-1.5 leading-snug">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate max-w-[280px]">{mission.pickup_address}</span>
                    </div>
                    {mission.caller_phone && (
                      <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                        Appelant : {mission.caller_phone}
                      </div>
                    )}
                  </div>
                </div>

                {/* Véhicule assigné & Destination */}
                <div className="flex items-center gap-4 text-[var(--text-muted)]">
                  {mission.ambulance ? (
                    <div className="flex items-center gap-2">
                      <Ambulance className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      <div>
                        <div className="font-mono font-bold text-[var(--text-main)]">
                          {mission.ambulance.plate_number}
                        </div>
                        <div className="text-[10px] text-[var(--text-muted)]">
                          {mission.ambulance.driver?.full_name || 'Équipage SMUR'}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <span className="text-rose-600 dark:text-rose-400 font-semibold italic">En attente d'assignation</span>
                  )}

                  <div className="hidden lg:block text-[var(--text-muted)]">➔</div>

                  <div className="hidden lg:block">
                    <div className="text-[var(--text-main)] font-medium">
                      {mission.destination?.name || 'Hôpital de secteur'}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] uppercase">Accueil prévu</div>
                  </div>
                </div>

                {/* Statut & Horodatage */}
                <div className="flex items-center justify-between md:justify-end gap-3 shrink-0">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                      mission.status === 'transporting'
                        ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                        : mission.status === 'on_site'
                        ? 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800'
                        : mission.status === 'assigned'
                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    {mission.status_display}
                  </span>

                  <span className="text-[11px] text-[var(--text-muted)] font-mono flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    {formatTime(mission.created_at)}
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
