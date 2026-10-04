/**
 * Libellés et ordre d'affichage des demandes (écran Alertes).
 *
 * Responsable du domaine : Pape Alioune Sene (application mobile)
 */
import { Linking, Platform } from 'react-native'
import type { TextTone } from '@/components/ui/Text'
import type { FacilitySummary, NearbyRequest, ResponseStatus, Urgency } from '@/types/api'

export const URGENCY: Record<Urgency, { label: string; tone: TextTone }> = {
  critical: { label: 'Critique', tone: 'brand' },
  urgent: { label: 'Urgente', tone: 'warning' },
  normal: { label: 'Normale', tone: 'muted' },
}

export const RESPONSE_LABEL: Partial<Record<ResponseStatus, string>> = {
  accepted: 'On vous attend',
  declined: 'Déclinée',
  cancelled: 'Désistement',
}

const RANK: Record<string, number> = { accepted: 0, none: 1, cancelled: 2, declined: 3 }

/**
 * Engagements en cours d'abord (le donneur doit s'y rendre), puis les
 * demandes sans réponse, puis celles écartées ; à rang égal, l'ordre du
 * serveur (distance) est conservé.
 */
export function sortRequests(requests: readonly NearbyRequest[]) {
  return requests
    .map((request, index) => ({ request, index }))
    .sort((a, b) => RANK[a.request.my_response ?? 'none'] - RANK[b.request.my_response ?? 'none'] || a.index - b.index)
    .map(({ request }) => request)
}

/** Demandes qui attendent une réponse (badge de l'onglet). */
export const pendingCount = (requests: readonly NearbyRequest[] | undefined) =>
  requests?.filter((request) => !request.my_response || request.my_response === 'cancelled').length ?? 0

export const units = (n: number) => `${n} poche${n > 1 ? 's' : ''}`

/** Itinéraire dans l'application de cartes du téléphone. */
export function openDirections(facility: FacilitySummary) {
  const label = encodeURIComponent(facility.name)
  const { latitude: lat, longitude: lon } = facility
  const url =
    lat == null || lon == null
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${facility.name} ${facility.city}`)}`
      : Platform.OS === 'ios'
        ? `maps:?daddr=${lat},${lon}&q=${label}`
        : Platform.OS === 'android'
          ? `geo:${lat},${lon}?q=${lat},${lon}(${label})`
          : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`
  Linking.openURL(url).catch(() => undefined)
}

export function callFacility(phone: string) {
  Linking.openURL(`tel:${phone.replace(/\s/g, '')}`).catch(() => undefined)
}
