/**
 * Position du téléphone (premier plan uniquement, jamais en arrière-plan).
 *
 * La position sert à classer les demandes par distance et, enregistrée dans
 * le profil donneur, à recevoir les alertes des hôpitaux proches. Elle est
 * arrondie à environ 100 m avant tout envoi : assez précise pour une
 * distance, pas pour situer un domicile. Les hôpitaux ne la voient jamais.
 *
 * Responsable du domaine : Pape Alioune Sene (application mobile)
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Linking, Platform } from 'react-native'
import * as Location from 'expo-location'

export interface Coords {
  latitude: number
  longitude: number
}

export type LocationStatus = 'checking' | 'granted' | 'undetermined' | 'denied' | 'unavailable'

/** Arrondi à 3 décimales (~110 m). */
export function roundCoords({ latitude, longitude }: Coords): Coords {
  const round = (value: number) => Math.round(value * 1000) / 1000
  return { latitude: round(latitude), longitude: round(longitude) }
}

/** Distance à vol d'oiseau en km (haversine). */
export function distanceKm(a: Coords, b: Coords) {
  const rad = Math.PI / 180
  const dLat = (b.latitude - a.latitude) * rad
  const dLon = (b.longitude - a.longitude) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}

export function formatDistance(km: number | null | undefined) {
  if (km === null || km === undefined) return null
  if (km < 1) return `${Math.max(100, Math.round(km * 10) * 100)} m`
  return `${km < 10 ? km.toFixed(1).replace('.', ',') : Math.round(km)} km`
}

/** Refus définitif : seuls les réglages du téléphone peuvent le lever. */
export function openSettings() {
  if (Platform.OS !== 'web') Linking.openSettings().catch(() => undefined)
}

/** Position actuelle : d'abord la dernière connue (instantané), sinon une mesure (précision moyenne, économe). */
async function readPosition(): Promise<Coords> {
  const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000, requiredAccuracy: 500 }).catch(() => null)
  const position = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }))
  return roundCoords(position.coords)
}

/**
 * Autorisation et position du téléphone.
 * `request()` : geste explicite (bouton) qui demande l'autorisation si besoin.
 */
export function useDeviceLocation({ auto = true } = {}) {
  const [status, setStatus] = useState<LocationStatus>('checking')
  const [coords, setCoords] = useState<Coords | null>(null)
  const [locating, setLocating] = useState(false)
  const mounted = useRef(true)

  const locate = useCallback(async () => {
    setLocating(true)
    try {
      const next = await readPosition()
      if (mounted.current) setCoords(next)
      return next
    } catch {
      // Localisation désactivée dans les réglages, ou aucun signal.
      if (mounted.current) setStatus('unavailable')
      return null
    } finally {
      if (mounted.current) setLocating(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    ;(async () => {
      const { status: current } = await Location.getForegroundPermissionsAsync().catch(() => ({ status: 'undetermined' as const }))
      if (!mounted.current) return
      if (current === 'granted') {
        setStatus('granted')
        if (auto) await locate()
      } else {
        setStatus(current === 'denied' ? 'denied' : 'undetermined')
      }
    })()
    return () => {
      mounted.current = false
    }
  }, [auto, locate])

  const request = useCallback(async () => {
    const { status: answer } = await Location.requestForegroundPermissionsAsync()
    if (answer === 'granted') {
      setStatus('granted')
      return locate()
    }
    setStatus('denied')
    return null
  }, [locate])

  return { status, coords, locating, request, refresh: locate }
}
