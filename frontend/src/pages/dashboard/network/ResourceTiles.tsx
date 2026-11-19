import React from 'react'
import { Link } from 'react-router'
import { ArrowUpRight } from 'lucide-react'
import { SIGNAL_DOT, SIGNAL_SOFT, type Signal } from '@/components/dash/tones'
import { formatNumber, formatPercent } from '@/lib/format'
import type { Ambulance, BloodRequest } from '@/types/api'

interface TileProps {
  i: number
  to: string
  /** Module de la tuile (repère de lecture, sans effet visuel). */
  module: 'beds' | 'blood' | 'fleet' | 'risk'
  label: string
  value: React.ReactNode
  unit?: string
  /** Pastille d'état teintée selon le sens, puis un complément discret (comme la maquette). */
  chip: { text: string; signal: Signal }
  hint?: string
  loading: boolean
  /** Carte mise en avant : l'encre du logo (une par rangée). */
  dark?: boolean
}

/** Pastilles sur la carte d'encre : fond translucide, couleurs « on ink ». */
const DARK_SOFT: Record<Signal, string> = {
  critical: 'bg-white/14 text-critical-on-ink',
  warning: 'bg-white/14 text-warning-on-ink',
  ok: 'bg-white/14 text-ok-on-ink',
  info: 'bg-white/14 text-white/90',
  neutral: 'bg-white/14 text-white/85',
}

/**
 * Indicateur du réseau, aux proportions de la maquette : libellé et flèche,
 * chiffre de 40 px, puis une seule ligne (pastille d'état + complément).
 * Toute la tuile mène au module.
 */
const Tile: React.FC<TileProps> = ({ i, to, label, value, unit, chip, hint, loading, dark = false }) => (
  <Link
    to={to}
    className={`${dark ? 'ink-card overflow-hidden text-white' : 'panel hover:shadow-[var(--shadow-raised)]'} reveal group relative flex flex-col rounded-[1.25rem] px-[18px] pb-4 pt-[18px] transition-shadow duration-300`}
    style={{ '--i': i } as React.CSSProperties}
  >
    <span className="flex items-center justify-between gap-3">
      <span className={`text-sm font-semibold ${dark ? 'text-white/90' : 'text-fg'}`}>{label}</span>
      <span
        aria-hidden="true"
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-all duration-300 group-hover:rotate-45 ${
          dark ? 'border-white bg-white text-ink' : 'border-line-strong text-fg group-hover:border-ink group-hover:bg-ink group-hover:text-on-ink'
        }`}
      >
        <ArrowUpRight className="h-3.5 w-3.5" />
      </span>
    </span>

    {loading ? (
      <span className="mt-3.5 space-y-3.5" aria-label="Chargement">
        <span className="skeleton block h-10 w-24" />
        <span className="skeleton block h-5 w-40" />
      </span>
    ) : (
      <>
        <span className="my-3.5 flex flex-wrap items-baseline gap-x-1.5">
          <span className={`num text-[2.5rem] font-bold leading-none tracking-[-0.04em] ${dark ? 'text-white' : 'text-fg'}`}>{value}</span>
          {unit && <span className={`num text-[0.9375rem] font-semibold ${dark ? 'text-white/75' : 'text-muted'}`}>{unit}</span>}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.78125rem]">
          <span
            className={`inline-flex items-center gap-1.5 rounded-[7px] px-2 py-0.5 text-[0.71875rem] font-bold ${dark ? DARK_SOFT[chip.signal] : SIGNAL_SOFT[chip.signal]}`}
          >
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${SIGNAL_DOT[chip.signal]}`} />
            {chip.text}
          </span>
          {hint && <span className={dark ? 'text-white/75' : 'text-muted'}>{hint}</span>}
        </span>
      </>
    )}
  </Link>
)

export interface ResourceTilesProps {
  show: { beds: boolean; blood: boolean; fleet: boolean }
  beds: { total: number; occupied: number; reserved: number; available: number; signal: Signal; loading: boolean }
  blood: { requests: BloodRequest[]; loading: boolean }
  fleet: { ambulances: Ambulance[]; activeMissions: number; loading: boolean }
  risk: { critical: number; warning: number; normal: number; regions: number; loading: boolean }
}

const plural = (n: number, one: string, many: string) => `${formatNumber(n)} ${n > 1 ? many : one}`

export const ResourceTiles: React.FC<ResourceTilesProps> = ({ show, beds, blood, fleet, risk }) => {
  const occupancy = beds.total > 0 ? (beds.total - beds.available) / beds.total : 0
  const vital = blood.requests.filter((r) => r.urgency === 'critical').length
  const available = fleet.ambulances.filter((a) => a.status === 'available').length
  const onMission = fleet.ambulances.filter((a) => a.status === 'on_mission').length
  const outOfService = fleet.ambulances.filter((a) => a.status === 'out_of_service').length
  const fleetSignal: Signal = fleet.ambulances.length === 0 ? 'neutral' : available <= 2 ? 'warning' : 'ok'
  const riskTotal = risk.critical + risk.warning + risk.normal
  // Rang de chaque tuile dans la cascade d'apparition (seules les tuiles visibles comptent).
  const order = [show.blood && 'blood', show.beds && 'beds', show.fleet && 'fleet', show.blood && 'risk'].filter(Boolean)
  const rank = (key: string) => order.indexOf(key)

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {show.blood && (
        <Tile
          i={rank('blood')}
          to="/blood"
          module="blood"
          dark
          label="Demandes de sang"
          loading={blood.loading}
          value={formatNumber(blood.requests.length)}
          unit="ouvertes"
          chip={vital > 0 ? { text: plural(vital, 'vitale', 'vitales'), signal: 'critical' } : { text: 'Aucune urgence vitale', signal: 'ok' }}
          hint={vital > 0 ? 'à traiter en priorité' : undefined}
        />
      )}

      {show.beds && (
        <Tile
          i={rank('beds')}
          to="/beds"
          module="beds"
          label="Lits disponibles"
          loading={beds.loading}
          value={beds.total > 0 ? formatNumber(beds.available) : '—'}
          unit={beds.total > 0 ? `sur ${formatNumber(beds.total)}` : undefined}
          chip={
            beds.total > 0
              ? { text: `${formatPercent(occupancy)} occupés`, signal: beds.signal }
              : { text: 'Aucune capacité déclarée', signal: 'neutral' }
          }
          hint={beds.total > 0 ? 'réseau national' : undefined}
        />
      )}

      {show.fleet && (
        <Tile
          i={rank('fleet')}
          to="/ambulances"
          module="fleet"
          label="Ambulances disponibles"
          loading={fleet.loading}
          value={fleet.ambulances.length > 0 ? formatNumber(available) : '—'}
          unit={fleet.ambulances.length > 0 ? `sur ${fleet.ambulances.length}` : undefined}
          chip={
            fleet.ambulances.length > 0
              ? { text: `${formatNumber(onMission)} en mission`, signal: fleetSignal }
              : { text: 'Aucun véhicule enregistré', signal: 'neutral' }
          }
          hint={fleet.ambulances.length > 0 && outOfService > 0 ? `${formatNumber(outOfService)} hors service` : undefined}
        />
      )}

      {show.blood && (
        <Tile
          i={rank('risk')}
          to="/ml"
          module="risk"
          label="Risques de pénurie"
          loading={risk.loading}
          value={riskTotal > 0 ? formatNumber(risk.critical) : '—'}
          unit={riskTotal > 0 ? 'critiques' : undefined}
          chip={
            riskTotal === 0
              ? { text: 'Aucune prévision disponible', signal: 'neutral' }
              : risk.critical > 0
                ? { text: 'sous 7 jours', signal: 'critical' }
                : { text: 'Aucun risque critique', signal: 'ok' }
          }
          hint={riskTotal > 0 && risk.regions > 0 ? plural(risk.regions, 'région touchée', 'régions touchées') : undefined}
        />
      )}
    </div>
  )
}
