/**
 * Position de l'ambulance partagée avec la régulation du SAMU.
 *
 * Contrairement à celle du donneur (lib/location.ts), la position n'est pas
 * arrondie : c'est celle d'un véhicule de secours, pas d'un domicile, et la
 * régulation en a besoin pour affecter l'ambulance la plus proche et suivre
 * l'intervention sur sa carte.
 *
 * - en mission : envoi toutes les 10 s au plus (déplacement de 25 m minimum) ;
 * - en service sans mission : toutes les minutes (affectation au plus proche) ;
 * - hors service : rien n'est envoyé.
 *
 * Premier plan uniquement : application en arrière-plan, le suivi s'arrête
 * (pas d'autorisation de localisation permanente).
 *
 * Responsable du domaine : Pape Alioune Sene (application mobile)
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import * as Location from 'expo-location'
import { api } from './api'
import type { LocationStatus } from './location'

export type TrackingMode = 'mission' | 'standby' | 'off'

const SETTINGS: Record<Exclude<TrackingMode, 'off'>, { intervalMs: number; distanceM: number; accuracy: Location.Accuracy }> = {
  mission: { intervalMs: 10_000, distanceM: 25, accuracy: Location.Accuracy.High },
  standby: { intervalMs: 60_000, distanceM: 200, accuracy: Location.Accuracy.Balanced },
}

export function useAmbulanceTracking(ambulanceId: number | null, mode: TrackingMode) {
  const [status, setStatus] = useState<LocationStatus>('checking')
  const [lastSentAt, setLastSentAt] = useState<number | null>(null)
  const lastSent = useRef(0)

  useEffect(() => {
    let alive = true
    Location.getForegroundPermissionsAsync()
      .then(({ status: current }) => alive && setStatus(current === 'granted' ? 'granted' : current === 'denied' ? 'denied' : 'undetermined'))
      .catch(() => alive && setStatus('undetermined'))
    return () => {
      alive = false
    }
  }, [])

  /** Geste explicite (bouton) : demande l'autorisation. */
  const request = useCallback(async () => {
    const { status: answer } = await Location.requestForegroundPermissionsAsync()
    setStatus(answer === 'granted' ? 'granted' : 'denied')
  }, [])

  useEffect(() => {
    if (mode === 'off' || ambulanceId === null || status !== 'granted') return
    const { intervalMs, distanceM, accuracy } = SETTINGS[mode]
    let subscription: Location.LocationSubscription | null = null
    let stopped = false
    // Changement de mode : la première position part aussitôt.
    lastSent.current = 0

    const send = ({ coords }: Location.LocationObject) => {
      const now = Date.now()
      if (now - lastSent.current < intervalMs) return
      lastSent.current = now
      api
        .post(`/api/ambulances/vehicles/${ambulanceId}/position/`, { latitude: coords.latitude, longitude: coords.longitude })
        .then(() => !stopped && setLastSentAt(now))
        // Réseau coupé : la position suivante réessaiera.
        .catch(() => {
          lastSent.current = 0
        })
    }

    Location.watchPositionAsync({ accuracy, timeInterval: intervalMs, distanceInterval: distanceM }, send)
      .then((watch) => {
        if (stopped) watch.remove()
        else subscription = watch
      })
      .catch(() => !stopped && setStatus('unavailable'))

    return () => {
      stopped = true
      subscription?.remove()
    }
  }, [ambulanceId, mode, status])

  return { status, lastSentAt, request }
}
