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
    <div className="rounded-xl border border-slate-800 bg-[#0c121e] overflow-hidden">
      {/* En-tête du tableau de dispatch */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-900/60">
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
            File de Dispatch SAMU & Interventions en Direct
          </h3>
          <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] font-mono font-semibold text-slate-300">
            {missions.length} active(s)
          </span>
        </div>

        <Link
          to="/ambulances"
          className="text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
        >
          Console Complète <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Liste des interventions */}
      <div className="divide-y divide-slate-800/80">
        {missions.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-2 opacity-60" />
            Aucune mission d'urgence en cours. Tous les secteurs sont calmes et disponibles.
          </div>
        ) : (
          missions.map((mission) => {
            const isCritical = mission.priority === 'critical'
            const isUrgent = mission.priority === 'urgent'

            return (
              <div
                key={mission.id}
                className="p-4 hover:bg-slate-850/40 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
              >
                {/* Identifiant & Priorité */}
                <div className="flex items-start gap-3 min-w-[220px]">
                  <div
                    className={`px-2 py-1 rounded font-mono font-bold text-[11px] shrink-0 border ${
                      isCritical
                        ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                        : isUrgent
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        : 'bg-slate-800 text-slate-300 border-slate-700'
                    }`}
                  >
                    #{mission.id} • {mission.priority_display}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-100 flex items-center gap-1.5 leading-snug">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate max-w-[280px]">{mission.pickup_address}</span>
                    </div>
                    {mission.caller_phone && (
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Appelant : {mission.caller_phone}
                      </div>
                    )}
                  </div>
                </div>

                {/* Véhicule assigné & Destination */}
                <div className="flex items-center gap-4 text-slate-300">
                  {mission.ambulance ? (
                    <div className="flex items-center gap-2">
                      <Ambulance className="w-4 h-4 text-amber-400" />
                      <div>
                        <div className="font-mono font-bold text-slate-200">
                          {mission.ambulance.plate_number}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {mission.ambulance.driver?.full_name || 'Équipage SMUR'}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <span className="text-rose-400 font-semibold italic">En attente d'assignation</span>
                  )}

                  <div className="hidden lg:block text-slate-400">➔</div>

                  <div className="hidden lg:block">
                    <div className="text-slate-300 font-medium">
                      {mission.destination?.name || 'Hôpital le plus proche'}
                    </div>
                    <div className="text-[10px] text-slate-400 uppercase">Établissement d'accueil</div>
                  </div>
                </div>

                {/* Statut & Horodatage */}
                <div className="flex items-center justify-between md:justify-end gap-3 shrink-0">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                      mission.status === 'transporting'
                        ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                        : mission.status === 'on_site'
                        ? 'bg-sky-500/10 text-sky-300 border-sky-500/20'
                        : mission.status === 'assigned'
                        ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20'
                        : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    {mission.status_display}
                  </span>

                  <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
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
