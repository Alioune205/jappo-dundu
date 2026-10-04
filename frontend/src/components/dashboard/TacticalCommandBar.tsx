import React, { useState, useEffect } from 'react'
import { Droplet, Bed, Ambulance as AmbulanceIcon } from 'lucide-react'
import { Link } from 'react-router'

interface TacticalCommandBarProps {
  criticalBloodCount: number
  availableBedsCount: number
  availableAmbulancesCount: number
  totalMissionsCount?: number
}

export const TacticalCommandBar: React.FC<TacticalCommandBarProps> = ({
  criticalBloodCount,
  availableBedsCount,
  availableAmbulancesCount,
}) => {
  const [liveSeconds, setLiveSeconds] = useState('')

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setLiveSeconds(
        new Intl.DateTimeFormat('fr-SN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZone: 'Africa/Dakar',
        }).format(now),
      )
    }
    updateTime()
    const timer = setInterval(updateTime, 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0c121e] p-4 shadow-xl">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Statut opérationnel national */}
        <div className="flex items-center gap-3">
          <div className="relative flex h-3.5 w-3.5 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-white">
                Régulation Nationale SAMU 15 & Urgences
              </span>
              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/30">
                Veille Active
              </span>
            </div>
            <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
              <span>Poste Central Dakar • Fuseau GMT</span>
              <span>•</span>
              <span className="font-mono text-slate-300 font-semibold">{liveSeconds}</span>
            </div>
          </div>
        </div>

        {/* Barrette d'actions tactiques rapides */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/blood"
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 hover:border-rose-500/50 transition-colors"
          >
            <Droplet className="w-3.5 h-3.5 text-rose-400" />
            <span>+ Demande de Sang</span>
            {criticalBloodCount > 0 && (
              <span className="ml-1 rounded-full bg-rose-600 px-1.5 py-0.2 text-[10px] font-bold text-white">
                {criticalBloodCount}
              </span>
            )}
          </Link>

          <Link
            to="/beds"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-colors"
          >
            <Bed className="w-3.5 h-3.5 text-slate-300" />
            <span>Orientation Lits</span>
            <span className="font-mono text-[11px] text-emerald-400">({availableBedsCount} libres)</span>
          </Link>

          <Link
            to="/ambulances"
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 hover:border-amber-500/50 transition-colors"
          >
            <AmbulanceIcon className="w-3.5 h-3.5 text-amber-400" />
            <span>Dispatch SMUR</span>
            <span className="font-mono text-[11px] text-slate-300">({availableAmbulancesCount} disp.)</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
