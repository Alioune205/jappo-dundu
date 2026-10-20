/**
 * Libellés et étapes d'une mission (espace ambulancier).
 *
 * Cycle de vie côté serveur (ambulances/models.py) : affectée → sur place →
 * transport → terminée ; une mission peut aussi se terminer sur place (patient
 * soigné ou laissé sur les lieux). L'annulation relève de la régulation.
 *
 * Responsable du domaine : Pape Alioune Sene (application mobile)
 */
import type { TextTone } from '@/components/ui/Text'
import type { Place } from '@/features/alerts/format'
import type { DriverStep } from '@/lib/missions'
import type { Mission, MissionPriority, MissionStatus } from '@/types/api'

export const PRIORITY: Record<MissionPriority, { label: string; tone: TextTone }> = {
  critical: { label: 'Critique', tone: 'brand' },
  urgent: { label: 'Urgente', tone: 'warning' },
  normal: { label: 'Normale', tone: 'muted' },
}

type Timestamp = 'assigned_at' | 'on_site_at' | 'transporting_at' | 'completed_at'

export const STEPS: readonly { status: MissionStatus; label: string; at: Timestamp }[] = [
  { status: 'assigned', label: 'En route', at: 'assigned_at' },
  { status: 'on_site', label: 'Sur place', at: 'on_site_at' },
  { status: 'transporting', label: 'Transport', at: 'transporting_at' },
  { status: 'completed', label: 'Remis', at: 'completed_at' },
]

/** Rang de l'étape courante dans STEPS (-1 : en attente ou annulée). */
export const stepIndex = (status: MissionStatus) => STEPS.findIndex((step) => step.status === status)

export interface NextAction {
  status: DriverStep
  label: string
  /** Le transport exige un hôpital de destination : il faut d'abord le choisir. */
  needsDestination: boolean
}

/** Geste principal proposé à l'ambulancier pour faire avancer la mission. */
export function nextAction(mission: Mission): NextAction | null {
  switch (mission.status) {
    case 'assigned':
      return { status: 'on_site', label: 'Je suis sur place', needsDestination: false }
    case 'on_site':
      return { status: 'transporting', label: 'Transporter le patient', needsDestination: mission.destination === null }
    case 'transporting':
      return { status: 'completed', label: 'Patient remis à l’hôpital', needsDestination: false }
    default:
      return null
  }
}

export interface Target extends Place {
  kind: 'pickup' | 'destination'
  phone: string | null
}

/** Lieu à rejoindre maintenant : le patient, puis l'hôpital une fois le transport commencé. */
export function currentTarget(mission: Mission): Target | null {
  if (mission.status === 'transporting' && mission.destination) {
    const { destination } = mission
    return { kind: 'destination', name: destination.name, city: destination.city, latitude: destination.latitude, longitude: destination.longitude, phone: destination.phone_number ?? null }
  }
  if (mission.status === 'assigned' || mission.status === 'on_site') {
    return {
      kind: 'pickup',
      name: mission.pickup_address || 'Lieu d’intervention',
      latitude: mission.pickup_latitude,
      longitude: mission.pickup_longitude,
      phone: mission.caller_phone || null,
    }
  }
  return null
}

/** Ligne d'historique : « Terminée · 12 min sur place » ou « Annulée ». */
export function outcome(mission: Mission) {
  if (mission.status === 'cancelled') return 'Annulée par la régulation'
  if (mission.response_time_minutes !== null) {
    return `${mission.destination ? `Remis à ${mission.destination.name}` : 'Terminée sur place'} · arrivée en ${Math.round(mission.response_time_minutes)} min`
  }
  return mission.status_display
}
