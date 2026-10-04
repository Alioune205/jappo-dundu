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
    <div className="clinical-card p-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Statut opérationnel national */}
        <div className="flex items-center gap-3">
          <div className="relative flex h-3.5 w-3.5 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-main)]">
                Régulation Nationale SAMU 15 & Urgences
              </span>
              <span className="rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-bold border border-emerald-200 dark:border-emerald-800">
                Veille Active • Réseau Connecté
              </span>
            </div>
            <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-2 mt-0.5">
              <span>Centre National de Dispatch Dakar</span>
              <span>•</span>
              <span className="font-mono text-[var(--text-main)] font-semibold">{liveSeconds} (GMT)</span>
            </div>
          </div>
        </div>

        {/* Barrette d'actions cliniques rapides */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/blood"
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/60 transition-colors"
          >
            <Droplet className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
            <span>+ Demande de Sang</span>
            {criticalBloodCount > 0 && (
              <span className="ml-1 rounded-full bg-rose-600 px-1.5 py-0.2 text-[10px] font-bold text-white">
                {criticalBloodCount}
              </span>
            )}
          </Link>

          <Link
            to="/beds"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-main)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--border-subtle)] transition-colors"
          >
            <Bed className="w-3.5 h-3.5 text-slate-500" />
            <span>Orientation Lits</span>
            <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">
              ({availableBedsCount} libres)
            </span>
          </Link>

          <Link
            to="/ambulances"
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/60 transition-colors"
          >
            <AmbulanceIcon className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>Dispatch SMUR</span>
            <span className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
              ({availableAmbulancesCount} disp.)
            </span>
          </Link>
        </div>
      </div>
    </div>
  )
}
