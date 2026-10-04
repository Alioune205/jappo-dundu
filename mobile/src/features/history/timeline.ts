/**
 * Frise de l'historique : dons effectués et réponses aux demandes, fusionnés
 * et regroupés par mois, le plus récent d'abord.
 *
 * Responsable du domaine : Pape Alioune Sene (application mobile)
 */
import { fromIsoDate, monthLabel } from '@/lib/dates'
import type { History } from '@/lib/queries'
import type { BloodGroup, FacilitySummary, ResponseStatus } from '@/types/api'

export interface TimelineItem {
  key: string
  kind: 'donation' | 'response'
  /** Date affichée et triée (ISO, jour ou horodatage). */
  date: string
  facility: FacilitySummary
  status: ResponseStatus
  bloodGroup?: BloodGroup
}

export interface TimelineSection {
  title: string
  data: TimelineItem[]
}

const toTime = (iso: string) => (iso.length > 10 ? new Date(iso) : fromIsoDate(iso))?.getTime() ?? 0

export function buildTimeline({ donations, responses }: History): TimelineSection[] {
  // Un don lié à une demande et la réponse « don effectué » décrivent le même geste : on garde le don.
  const donatedRequests = new Set(donations.map((d) => d.blood_request).filter((id): id is number => id !== null))
  const items: TimelineItem[] = [
    ...donations.map((d) => ({
      key: `d${d.id}`,
      kind: 'donation' as const,
      date: d.donated_on,
      facility: d.facility,
      status: 'donated' as const,
    })),
    ...responses
      .filter((r) => !(r.status === 'donated' && donatedRequests.has(r.blood_request.id)))
      .map((r) => ({
        key: `r${r.id}`,
        kind: 'response' as const,
        date: r.updated_at,
        facility: r.blood_request.facility,
        status: r.status,
        bloodGroup: r.blood_request.blood_group,
      })),
  ].sort((a, b) => toTime(b.date) - toTime(a.date))

  const sections: TimelineSection[] = []
  for (const item of items) {
    const title = monthLabel(new Date(toTime(item.date)))
    const last = sections[sections.length - 1]
    if (last?.title === title) last.data.push(item)
    else sections.push({ title, data: [item] })
  }
  return sections
}

/**
 * Avancement vers le prochain don possible (0 → 1), d'après le dernier don
 * et la date d'éligibilité calculée par le serveur.
 */
export function recoveryProgress(last: string | null, next: string | null, today = new Date()) {
  const start = fromIsoDate(last)?.getTime()
  const end = fromIsoDate(next)?.getTime()
  if (!start || !end || end <= start) return 1
  return Math.min(1, Math.max(0, (today.getTime() - start) / (end - start)))
}
