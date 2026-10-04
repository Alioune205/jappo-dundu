import React, { useEffect } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { Redirect, useRouter } from 'expo-router'
import { Tabs } from 'expo-router/js-tabs'
import * as Notifications from 'expo-notifications'
import { TabBar } from '@/components/TabBar'
import { Button } from '@/components/ui/Button'
import { Text } from '@/components/ui/Text'
import { pushSupported, registerForPush, requestIdOf } from '@/lib/push'
import { isMissingDonor, useDonor } from '@/lib/queries'
import { space, useTheme } from '@/theme'

/**
 * Espace donneur : Alertes, Historique, Profil.
 *
 * - sans profil donneur, passage obligé par sa création ;
 * - le téléphone se réenregistre pour les push à chaque ouverture (jeton
 *   renouvelé, compte changé) si l'autorisation est déjà accordée ;
 * - toucher une notification ouvre la demande correspondante.
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
      <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.canvas } }}>
        <Tabs.Screen name="alerts" options={{ title: 'Alertes' }} />
        <Tabs.Screen name="history" options={{ title: 'Historique' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profil' }} />
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

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.sm },
  message: { textAlign: 'center' },
  retry: { marginTop: space.md, alignSelf: 'stretch' },
})
