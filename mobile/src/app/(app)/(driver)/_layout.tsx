import React, { useEffect } from 'react'
import { Redirect, Stack, useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import * as Notifications from 'expo-notifications'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/context/AuthContext'
import { isDriver } from '@/lib/missions'
import { missionIdOf, pushSupported, registerForPush } from '@/lib/push'
import { QK } from '@/lib/queries'
import { useTheme } from '@/theme'

/**
 * Espace ambulancier : un seul écran, la mission en cours.
 *
 * Un compte sans rôle ambulancier est renvoyé vers l'espace donneur.
 *
 * Responsable du domaine : Pape Alioune Sene (application mobile)
 */
export default function DriverLayout() {
  const { user } = useAuth()
  const { colors } = useTheme()
  if (!isDriver(user?.roles)) return <Redirect href="/home" />
  return (
    <>
      <MissionPushBridge />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas }, animation: 'fade' }} />
    </>
  )
}

/**
 * Notification de mission (affectation, annulation) : la mission est relue
 * aussitôt ; la toucher ramène sur l'écran de la mission.
 */
function MissionPushBridge() {
  const router = useRouter()
  const client = useQueryClient()

  useEffect(() => {
    if (!pushSupported) return
    registerForPush().catch(() => undefined)
    const refresh = () => {
      client.invalidateQueries({ queryKey: QK.missions })
      client.invalidateQueries({ queryKey: QK.ambulance })
    }
    const open = (response: Notifications.NotificationResponse | null) => {
      if (missionIdOf(response?.notification) === null) return
      Notifications.clearLastNotificationResponse()
      refresh()
      router.navigate('/mission')
    }
    open(Notifications.getLastNotificationResponse())
    const tapped = Notifications.addNotificationResponseReceivedListener(open)
    const received = Notifications.addNotificationReceivedListener((notification) => {
      if (missionIdOf(notification) === null) return
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
      refresh()
    })
    return () => {
      tapped.remove()
      received.remove()
    }
  }, [client, router])

  return null
}
