/**
 * Alerte SOS du citoyen (POST /api/ambulances/sos/).
 *
 * La position envoyée est la position précise du téléphone, non arrondie
 * (contrairement à celle du donneur, lib/location.ts) : une ambulance doit
 * trouver la personne. Elle ne part qu'au geste « Envoyer l'alerte », vers
 * la régulation du SAMU seulement.
 *
 * Le citoyen suit ensuite son alerte : en attente (la régulation le rappelle),
 * ambulance en route, arrivée. Pas de flux temps réel pour un citoyen (les
 * alertes ambulances sont réservées aux professionnels) : un sondage court
 * tant que l'alerte est en cours.
 *
 * Responsable du domaine : Pape Alioune Sene (application mobile)
 */
import { Linking } from 'react-native'
import * as Location from 'expo-location'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from './api'
import type { Coords } from './location'
import { QK } from './queries'

/** Numéro du SAMU national du Sénégal. */
export const SAMU_NUMBER = '1515'

export type SosKind = 'accident' | 'malaise' | 'breathing' | 'childbirth' | 'other'

export const SOS_KINDS: readonly { value: SosKind; label: string }[] = [
  { value: 'accident', label: 'Accident' },
  { value: 'malaise', label: 'Malaise, perte de connaissance' },
  { value: 'breathing', label: 'Difficulté à respirer' },
  { value: 'childbirth', label: 'Accouchement' },
  { value: 'other', label: 'Autre urgence' },
]

export type SosStatus = 'pending' | 'assigned' | 'on_site' | 'transporting' | 'completed' | 'cancelled'

export interface SosAlert {
  id: number
  status: SosStatus
  status_display: string
  description: string
  pickup_address: string
  created_at: string
  assigned_at: string | null
  on_site_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  cancellation_reason: string
  ambulance: { plate_number: string; ambulance_type_display: string; distance_km: number | null } | null
  /** Consignes en attendant l'ambulance, selon le type d'urgence (même source que la régulation). */
  instructions?: { code: string; title: string; steps: string[] }[]
  /** Arrivée estimée de l'ambulance sur place (durée par la route ou estimée). */
  eta_at?: string | null
}

export const isActiveSos = (alert: SosAlert | null | undefined) =>
  !!alert && alert.status !== 'completed' && alert.status !== 'cancelled'

const POLL_MS = 5_000

/** Dernière alerte du citoyen (null : aucune alerte récente). */
export function useMySos() {
  return useQuery({
    queryKey: QK.sos,
    queryFn: async () => {
      try {
        return await api.get<SosAlert>('/api/ambulances/sos/')
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null
        throw err
      }
    },
    refetchInterval: (query) => (isActiveSos(query.state.data) ? POLL_MS : false),
  })
}

/** Position précise pour les secours ; demande l'autorisation si besoin. */
export async function preciseCoords(): Promise<Coords> {
  const { status } = await Location.requestForegroundPermissionsAsync()
  if (status !== 'granted') {
    throw new Error(`Position refusée : autorisez la localisation ou appelez le ${SAMU_NUMBER}.`)
  }
  const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
  return { latitude: coords.latitude, longitude: coords.longitude }
}

export function useSendSos() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({ kind, landmark }: { kind: SosKind; landmark: string }) => {
      const coords = await preciseCoords()
      return api.post<SosAlert>('/api/ambulances/sos/', { ...coords, kind, landmark: landmark.trim() })
    },
    onSuccess: (alert) => client.setQueryData(QK.sos, alert),
  })
}

export function useCancelSos() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.post<SosAlert>(`/api/ambulances/sos/${id}/cancel/`),
    onSuccess: (alert) => client.setQueryData(QK.sos, alert),
  })
}

/**
 * Sans Internet : l'alerte part par SMS au 1515, avec la position GPS (le
 * GPS fonctionne sans réseau de données) et le repère.
 */
export async function smsSamu(kind: SosKind, landmark: string) {
  const label = SOS_KINDS.find((k) => k.value === kind)?.label ?? 'Urgence'
  let position = ''
  try {
    const { latitude, longitude } = await preciseCoords()
    position = ` Position : ${latitude.toFixed(5)},${longitude.toFixed(5)}.`
  } catch {
    // Sans position, le repère et le rappel du régulateur suffisent.
  }
  const body = `SOS Jappo Dundu : ${label}.${position}${landmark.trim() ? ` Repère : ${landmark.trim()}.` : ''}`
  await Linking.openURL(`sms:${SAMU_NUMBER}?body=${encodeURIComponent(body)}`).catch(() => callSamu())
}

/** Échec réseau (pas de réponse du serveur), à distinguer d'un refus de l'API. */
export const isNetworkFailure = (error: unknown) => !!error && !(error instanceof ApiError)

export function callSamu() {
  Linking.openURL(`tel:${SAMU_NUMBER}`).catch(() => undefined)
}
