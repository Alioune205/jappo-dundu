import React from 'react'
import { Activity } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { capabilityLabel, type Tone } from '@/lib/constants'
import { formatRelative } from '@/lib/format'
import type { Capability, DestinationStatus, Mission, Vitals } from '@/types/api'

const DESTINATION_TONES: Record<Exclude<DestinationStatus, ''>, Tone> = {
  pending: 'warning',
  accepted: 'success',
  refused: 'danger',
}

/** Réponse de l'hôpital de destination à la pré-alerte. */
export const DestinationStatusBadge: React.FC<{ mission: Mission }> = ({ mission }) => {
  if (!mission.destination_status) return null
  return (
    <Badge tone={DESTINATION_TONES[mission.destination_status]} size="sm" title={mission.destination_note || undefined}>
      {mission.destination_status_display}
      {mission.destination_status === 'refused' && mission.destination_note ? ` : ${mission.destination_note}` : ''}
    </Badge>
  )
}

const VITAL_LABELS: { key: keyof Vitals; label: string; unit: string }[] = [
  { key: 'pulse', label: 'Pouls', unit: '/min' },
  { key: 'systolic', label: 'PA', unit: 'mmHg' },
  { key: 'spo2', label: 'SpO₂', unit: '%' },
  { key: 'resp_rate', label: 'FR', unit: '/min' },
  { key: 'temperature', label: 'T°', unit: '°C' },
  { key: 'gcs', label: 'Glasgow', unit: '' },
  { key: 'glucose', label: 'Glycémie', unit: 'g/L' },
]

/** Bilan de l'équipage : constantes et observations, tels que l'hôpital les reçoit. */
export const BilanSummary: React.FC<{ mission: Mission; now: number }> = ({ mission, now }) => {
  if (!mission.bilan_updated_at) return null
  const vitals = mission.vitals ?? {}
  const shown = VITAL_LABELS.filter((v) => vitals[v.key] !== undefined)
  return (
    <section className="rounded-lg border border-line px-4 py-3" aria-label="Bilan de l’équipage">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
        <Activity className="h-3.5 w-3.5" aria-hidden="true" />
        Bilan de l’équipage
        <span className="font-normal normal-case tracking-normal text-subtle">
          · {formatRelative(mission.bilan_updated_at, now)}
        </span>
      </h3>
      {shown.length > 0 && (
        <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
          {shown.map((v) => (
            <div key={v.key} className="flex items-baseline gap-1">
              <dt className="text-2xs text-muted">{v.label}</dt>
              <dd className="num text-sm font-semibold text-fg">
                {v.key === 'systolic' && vitals.diastolic !== undefined
                  ? `${vitals.systolic}/${vitals.diastolic}`
                  : vitals[v.key]}
                {v.unit && <span className="ml-0.5 text-2xs font-normal text-muted">{v.unit}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {mission.bilan_notes && <p className="mt-2 text-sm text-fg">{mission.bilan_notes}</p>}
    </section>
  )
}

/** Plateau technique d'un établissement, en pastilles. */
export const CapabilityChips: React.FC<{ codes: Capability[] | undefined; highlight?: Capability[] }> = ({
  codes,
  highlight = [],
}) => {
  if (!codes?.length) return null
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {codes.map((code) => (
        <span
          key={code}
          className={`rounded px-1.5 py-0.5 text-2xs ${highlight.includes(code) ? 'bg-ok/15 font-semibold text-ok' : 'bg-raised text-muted'}`}
        >
          {capabilityLabel(code)}
        </span>
      ))}
    </span>
  )
}
