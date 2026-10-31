import React from 'react'
import { Badge } from '@/components/ui/Badge'
import { formatDateTime, formatRelative } from '@/lib/format'
import type { Tone } from '@/lib/constants'
import type { BedFreshness } from '@/types/api'

const FRESHNESS: Record<BedFreshness, { tone: Tone; label: string }> = {
  fresh: { tone: 'success', label: 'À jour' },
  aging: { tone: 'warning', label: 'À reconfirmer' },
  stale: { tone: 'danger', label: 'Chiffres périmés' },
}

/**
 * Depuis quand les chiffres d'un service sont sûrs. Un lit « libre » non
 * confirmé depuis des heures peut envoyer une ambulance au mauvais endroit.
 */
export const FreshnessBadge: React.FC<{
  freshness: BedFreshness
  confirmedAt: string | null
  now: number
  /** Affiche aussi l'âge (« il y a 3 heures »). */
  showAge?: boolean
}> = ({ freshness, confirmedAt, now, showAge = true }) => {
  const { tone, label } = FRESHNESS[freshness] ?? FRESHNESS.stale
  return (
    <Badge
      tone={tone}
      size="sm"
      title={confirmedAt ? `Chiffres confirmés le ${formatDateTime(confirmedAt)}` : 'Chiffres jamais confirmés'}
    >
      {label}
      {showAge && confirmedAt && freshness !== 'fresh' ? ` · ${formatRelative(confirmedAt, now)}` : ''}
    </Badge>
  )
}
