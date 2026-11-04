import React from 'react'
import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react'
import { EmptyNote, Panel } from '@/components/dash/Panel'
import { Badge } from '@/components/ui/Badge'
import { formatPercent } from '@/lib/format'
import type { Tone } from '@/lib/constants'
import { SATURATED, VIGILANCE, type FacilityRow, type NetworkLevel } from './facilityRows'

const LEVEL_BADGE: Record<NetworkLevel, { tone: Tone; label: string }> = {
  alert: { tone: 'danger', label: 'Alerte' },
  vigilance: { tone: 'warning', label: 'Vigilance' },
  normal: { tone: 'success', label: 'Normal' },
}

const occupancyBar = (rate: number) => (rate >= SATURATED ? 'bg-critical' : rate >= VIGILANCE ? 'bg-warning' : 'bg-ok')

/** Tableau de supervision : une ligne par établissement, du plus tendu au plus calme. */
export const FacilitiesOverview: React.FC<{ rows: FacilityRow[]; i?: number }> = ({ rows, i = 4 }) => (
  <Panel
    i={i}
    title={
      <span className="flex items-center gap-2">
        Établissements du réseau
        <span className="num font-normal text-muted">{rows.length}</span>
      </span>
    }
    subtitle="Situation de chaque structure, de la plus tendue à la plus calme"
    bodyClassName="pt-2"
  >
    {rows.length === 0 ? (
      <EmptyNote title="Aucun établissement actif" />
    ) : (
      <div className="overflow-x-auto">
        <table className="ops-table">
          <thead>
            <tr>
              <th scope="col">Établissement</th>
              <th scope="col">Lits libres</th>
              <th scope="col" className="w-40">Occupation</th>
              <th scope="col" className="text-right">Services saturés</th>
              <th scope="col" className="text-right">Demandes de sang</th>
              <th scope="col" className="text-right">Ambulances libres</th>
              <th scope="col">État</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.facility.id}
                data-severity={row.level === 'alert' ? 'critical' : row.level === 'vigilance' ? 'warning' : undefined}
              >
                <td className="min-w-56">
                  <div className="font-medium text-fg">{row.facility.name}</div>
                  <div className="text-2xs text-muted">
                    {row.facility.facility_type_display} · {row.facility.city}
                  </div>
                </td>
                <td className="num whitespace-nowrap">
                  {row.totalBeds > 0 ? (
                    <>
                      <span className="font-semibold text-fg">{row.availableBeds}</span>
                      <span className="text-muted"> / {row.totalBeds}</span>
                    </>
                  ) : (
                    <span className="text-subtle">—</span>
                  )}
                </td>
                <td>
                  {row.occupancy === null ? (
                    <span className="text-subtle">—</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-raised">
                        <div
                          className={`h-full rounded-full ${occupancyBar(row.occupancy)}`}
                          style={{ width: `${Math.round(row.occupancy * 100)}%` }}
                        />
                      </div>
                      <span className="num text-xs text-fg">{formatPercent(row.occupancy)}</span>
                    </div>
                  )}
                </td>
                <td className="num text-right">
                  {row.totalBeds > 0 ? (
                    <span className={row.saturatedServices > 0 ? 'font-semibold text-critical' : 'text-muted'}>
                      {row.saturatedServices}
                    </span>
                  ) : (
                    <span className="text-subtle">—</span>
                  )}
                </td>
                <td className="num text-right">
                  <span className={row.openRequests > 0 ? 'font-semibold text-fg' : 'text-muted'}>{row.openRequests}</span>
                  {row.criticalRequests > 0 && (
                    <span className="ml-1.5 text-2xs font-semibold text-critical">dont {row.criticalRequests} vitale{row.criticalRequests > 1 ? 's' : ''}</span>
                  )}
                </td>
                <td className="num text-right">
                  {row.ambulances > 0 ? (
                    <span className="text-fg">
                      {row.availableAmbulances}
                      <span className="text-muted"> / {row.ambulances}</span>
                    </span>
                  ) : (
                    <span className="text-subtle">—</span>
                  )}
                </td>
                <td>
                  <Badge tone={LEVEL_BADGE[row.level].tone} size="sm">
                    {LEVEL_BADGE[row.level].label}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </Panel>
)

interface NetworkStatusProps {
  rows: FacilityRow[]
  criticalBloodCount: number
  availableAmbulances: number
  totalAmbulances: number
  occupancy: number
}

/** Bandeau d'état du réseau : une phrase lisible en un coup d'œil, avec ses raisons. */
export const NetworkStatus: React.FC<NetworkStatusProps> = ({
  rows,
  criticalBloodCount,
  availableAmbulances,
  totalAmbulances,
  occupancy,
}) => {
  const reasons: string[] = []
  if (criticalBloodCount > 0)
    reasons.push(`${criticalBloodCount} demande${criticalBloodCount > 1 ? 's' : ''} de sang vitale${criticalBloodCount > 1 ? 's' : ''}`)
  const saturated = rows.filter((r) => r.occupancy !== null && r.occupancy >= SATURATED)
  if (saturated.length > 0)
    reasons.push(`${saturated.length} établissement${saturated.length > 1 ? 's' : ''} saturé${saturated.length > 1 ? 's' : ''}`)
  if (totalAmbulances > 0 && availableAmbulances === 0) reasons.push('aucune ambulance libre')
  const vigilance = rows.filter((r) => r.level === 'vigilance').length

  const level: NetworkLevel = reasons.length > 0 ? 'alert' : vigilance > 0 || occupancy >= VIGILANCE ? 'vigilance' : 'normal'
  const view = {
    alert: { Icon: CircleAlert, box: 'border-critical/30 bg-critical/5', icon: 'text-critical', title: 'Alerte sur le réseau' },
    vigilance: { Icon: TriangleAlert, box: 'border-warning/30 bg-warning/5', icon: 'text-warning', title: 'Réseau sous vigilance' },
    normal: { Icon: CircleCheck, box: 'border-ok/30 bg-ok/5', icon: 'text-ok', title: 'Réseau en situation normale' },
  }[level]
  const detail =
    level === 'alert'
      ? reasons.join(' · ')
      : level === 'vigilance'
        ? `${vigilance} établissement${vigilance > 1 ? 's' : ''} à surveiller · occupation globale ${formatPercent(occupancy)}`
        : `Occupation globale ${formatPercent(occupancy)} · ${availableAmbulances} ambulance${availableAmbulances > 1 ? 's' : ''} libre${availableAmbulances > 1 ? 's' : ''}`

  return (
    <div role="status" className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${view.box}`}>
      <view.Icon className={`h-5 w-5 shrink-0 ${view.icon}`} aria-hidden="true" />
      <p className="text-sm">
        <span className="font-semibold text-fg">{view.title}</span>
        <span className="text-muted"> — {detail}</span>
      </p>
    </div>
  )
}
