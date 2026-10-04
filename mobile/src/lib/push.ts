/**
 * Notifications push (Expo → FCM sur Android, APNs sur iOS).
 *
 * Le backend envoie une alerte aux donneurs compatibles à portée dès qu'un
 * hôpital crée une demande (backend/push/services.py) : le donneur est
 * prévenu application fermée. Le téléphone s'enregistre auprès du backend
 * avec son jeton Expo ; à la déconnexion, le jeton est désactivé pour que
 * la personne suivante sur ce téléphone ne reçoive pas ses alertes.
 *
 * Limites connues : pas de push sur le web, ni dans Expo Go sur Android
 * (il faut un « development build », voir mobile/README.md), et un
 * identifiant de projet EAS est requis pour obtenir un jeton.
 *
 * Responsable du domaine : Pape Alioune Sene (application mobile)
 */
import { useCallback, useEffect, useState } from 'react'
import { AppState, Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { api } from './api'

export const ALERT_CHANNEL = 'blood-alerts'
const TOKEN_KEY = 'jappo-dundu.push-token'

export type PushStatus = 'granted' | 'denied' | 'undetermined' | 'unsupported'

export const pushSupported = Platform.OS !== 'web' && Device.isDevice

/** Affichage des notifications reçues application ouverte : bannière et son. */
export function configureNotificationHandler() {
  if (Platform.OS === 'web') return
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  })
}

/** Canal Android des alertes : importance maximale, vibration, couleur de marque. */
async function ensureChannel() {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync(ALERT_CHANNEL, {
    name: 'Alertes de don de sang',
    description: 'Demandes urgentes des hôpitaux proches compatibles avec votre groupe.',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 220, 120, 220],
    lightColor: '#D92D20',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  })
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!pushSupported) return 'unsupported'
  const { status } = await Notifications.getPermissionsAsync()
  return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined'
}

function projectId(): string | undefined {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId
}

/**
 * Enregistre le téléphone auprès du backend.
 * `ask` : demande l'autorisation si elle n'a pas encore été donnée (geste
 * explicite de l'utilisateur) ; sinon, n'agit que si elle est déjà accordée.
 */
export async function registerForPush({ ask = false } = {}): Promise<PushStatus> {
  if (!pushSupported) return 'unsupported'
  await ensureChannel()
  let status = await getPushStatus()
  if (status === 'undetermined' && ask) {
    const response = await Notifications.requestPermissionsAsync()
    status = response.status === 'granted' ? 'granted' : 'denied'
  }
  if (status !== 'granted') return status

  const id = projectId()
  if (!id) {
    console.warn('Notifications push : identifiant de projet EAS absent (app.json → extra.eas.projectId).')
    return status
  }
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id })
    await api.post('/api/push/devices/', { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' })
    await AsyncStorage.setItem(TOKEN_KEY, token)
  } catch (err) {
    // Expo Go sur Android, Google Play Services absents, réseau coupé :
    // l'application reste utilisable, les alertes arrivent à l'ouverture.
    console.warn('Notifications push indisponibles :', err)
  }
  return status
}

/** Désactive le jeton de ce téléphone côté serveur (à appeler avant de révoquer la session). */
export async function unregisterPush() {
  const token = await AsyncStorage.getItem(TOKEN_KEY).catch(() => null)
  if (!token) return
  await api.post('/api/push/devices/unregister/', { token }).catch(() => undefined)
  await AsyncStorage.removeItem(TOKEN_KEY).catch(() => undefined)
}

/** Identifiant de demande porté par une notification d'alerte, s'il y en a un. */
export function requestIdOf(response: Notifications.NotificationResponse | null | undefined): number | null {
  const data = response?.notification.request.content.data as { type?: string; request_id?: unknown } | undefined
  return data?.type === 'blood_request' && typeof data.request_id === 'number' ? data.request_id : null
}

/**
 * État de l'autorisation, relu au retour au premier plan (l'utilisateur a pu
 * la changer dans les réglages) ; `enable()` la demande puis enregistre le téléphone.
 */
export function usePushPermission() {
  const [status, setStatus] = useState<PushStatus | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    const read = () => getPushStatus().then((next) => alive && setStatus(next)).catch(() => undefined)
    read()
    const subscription = AppState.addEventListener('change', (state) => state === 'active' && read())
    return () => {
      alive = false
      subscription.remove()
    }
  }, [])

  const enable = useCallback(async () => {
    setBusy(true)
    try {
      setStatus(await registerForPush({ ask: true }))
    } finally {
      setBusy(false)
    }
  }, [])

  return { status, busy, enable }
}
