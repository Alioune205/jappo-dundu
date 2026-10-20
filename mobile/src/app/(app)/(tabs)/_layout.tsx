import React, { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { Redirect, usePathname, useRouter } from 'expo-router'
import { Tabs } from 'expo-router/js-tabs'
import * as Haptics from 'expo-haptics'
import * as Notifications from 'expo-notifications'
import { TabBar } from '@/components/TabBar'
import { Button } from '@/components/ui/Button'
import { Text } from '@/components/ui/Text'
import { pickAlert, UrgentAlert } from '@/features/alerts/UrgentAlert'
import { useDeviceLocation } from '@/lib/location'
import { pushSupported, registerForPush, requestIdOf } from '@/lib/push'
import { isMissingDonor, useDonor, useNearby, useRespond } from '@/lib/queries'
import { space, useTheme } from '@/theme'
import type { DonorProfile, NearbyRequest } from '@/types/api'

/**
 * Espace donneur : Accueil, Ma carte, Alertes, Historique, Centres (et Profil,
 * ouvert depuis le menu de l'accueil).
 *
 * - sans profil donneur, passage obligé par sa création ;
 * - le téléphone se réenregistre pour les push à chaque ouverture (jeton
 *   renouvelé, compte changé) si l'autorisation est déjà accordée ;
 * - toucher une notification ouvre la demande correspondante ;
 * - une demande sans réponse s'affiche en alerte par-dessus l'écran courant.
 *
 * Responsable du domaine : Pape Alioune Sene (application mobile)
 */
export default function TabsLayout() {
  const { colors } = useTheme()
  const donor = useDonor()

  if (isMissingDonor(donor.error)) return <Redirect href="/donor-setup" />

  if (!donor.data) {
    return (
      <View style={[styles.center, { backgroundColor: colors.canvas }]}>
        {donor.isError ? (
          <>
            <Text variant="heading">Connexion impossible</Text>
            <Text variant="body" tone="muted" style={styles.message}>
              {donor.error instanceof Error ? donor.error.message : 'Réessayez dans un instant.'}
            </Text>
            <Button label="Réessayer" variant="secondary" onPress={() => donor.refetch()} style={styles.retry} />
          </>
        ) : (
          <ActivityIndicator color={colors.muted} />
        )}
      </View>
    )
  }

  return (
    <>
      <PushBridge />
      <AlertBridge donor={donor.data} />
      <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.canvas } }}>
        <Tabs.Screen name="home" options={{ title: 'Accueil' }} />
        <Tabs.Screen name="card" options={{ title: 'Ma carte' }} />
        <Tabs.Screen name="alerts" options={{ title: 'Alertes' }} />
        <Tabs.Screen name="history" options={{ title: 'Historique' }} />
        <Tabs.Screen name="centers" options={{ title: 'Centres' }} />
        {/* Ouverts depuis l'accueil et le profil : pas de bouton dans la barre (voir TabBar). */}
        <Tabs.Screen name="profile" options={{ title: 'Profil' }} />
        <Tabs.Screen name="badges" options={{ title: 'Mes badges' }} />
      </Tabs>
    </>
  )
}

/** Enregistrement push silencieux et ouverture de la demande touchée dans une notification. */
function PushBridge() {
  const router = useRouter()

  useEffect(() => {
    if (!pushSupported) return
    registerForPush().catch(() => undefined)
    const open = (response: Notifications.NotificationResponse | null) => {
      const id = requestIdOf(response)
      if (id === null) return
      // Consommée : un retour ultérieur sur l'application ne la rejoue pas.
      Notifications.clearLastNotificationResponse()
      router.navigate({ pathname: '/alerts', params: { request: String(id) } })
    }
    // Application lancée par le toucher d'une notification, puis touchers suivants.
    open(Notifications.getLastNotificationResponse())
    const subscription = Notifications.addNotificationResponseReceivedListener(open)
    return () => subscription.remove()
  }, [router])

  return null
}

/**
 * Alerte plein écran de la demande la plus grave sans réponse. « J'y vais
 * maintenant » accepte et ouvre la demande (itinéraire, appel) ; « Plus tard »
 * l'écarte pour la session, elle reste dans l'écran Alertes (où l'alerte ne
 * s'affiche pas).
 */
function AlertBridge({ donor }: { donor: DonorProfile }) {
  const router = useRouter()
  const pathname = usePathname()
  const location = useDeviceLocation()
  const canQuery = !!location.coords || (donor.latitude != null && donor.longitude != null)
  const nearby = useNearby(location.coords, { enabled: canQuery && donor.is_available, live: false })
  const respond = useRespond()
  const [dismissed, setDismissed] = useState<ReadonlySet<number>>(() => new Set())

  const canDonate = donor.is_eligible
  // Règles CNTS : pas d'alerte si le donneur ne peut pas donner (délai entre deux
  // dons, plafond annuel…) ni s'il est déjà attendu pour un don ailleurs.
  const engaged = nearby.data?.some((r) => r.my_response === 'accepted') ?? false
  const canAlert = donor.is_available && donor.is_eligible && !engaged
  // Réponse en cours d'envoi : l'alerte reste sur sa demande (déjà marquée acceptée dans le cache).
  const sendingId = respond.isPending ? respond.variables?.id : undefined
  // L'écran Alertes liste déjà toutes les demandes : pas d'alerte par-dessus.
  const request =
    sendingId !== undefined
      ? nearby.data?.find((r) => r.id === sendingId)
      : canAlert && pathname !== '/alerts'
        ? pickAlert(nearby.data, dismissed)
        : undefined
  const dismiss = (id: number) => setDismissed((previous) => new Set(previous).add(id))
  const open = (id: number) => router.navigate({ pathname: '/alerts', params: { request: String(id) } })

  const go = (target: NearbyRequest) => {
    if (!canDonate) {
      dismiss(target.id)
      open(target.id)
      return
    }
    respond.mutate(
      { id: target.id, status: 'accepted' },
      {
        onSuccess: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
        onSettled: () => {
          dismiss(target.id)
          open(target.id)
        },
      }
    )
  }

  return (
    <UrgentAlert
      request={request}
      canDonate={canDonate}
      busy={respond.isPending}
      onGo={go}
      onLater={(target) => dismiss(target.id)}
    />
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.sm },
  message: { textAlign: 'center' },
  retry: { marginTop: space.md, alignSelf: 'stretch' },
})
