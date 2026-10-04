import React, { useCallback, useEffect, useState } from 'react'
import { AppState, Platform, StyleSheet, View } from 'react-native'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useFonts } from 'expo-font'
import { SplashHandoff } from '@/components/SplashHandoff'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { OnboardingProvider, useOnboarding } from '@/context/OnboardingContext'
import { configureNotificationHandler } from '@/lib/push'
import '@/lib/webStyles'
import { useTheme } from '@/theme'

// Le splash natif reste affiché tant que polices, onboarding et session ne sont pas prêts.
SplashScreen.preventAutoHideAsync().catch(() => undefined)
// Pas de fondu natif : SplashHandoff prend le relais à l'identique, puis anime.
SplashScreen.setOptions({ fade: false })

// Notification reçue application ouverte : bannière et son, comme application fermée.
configureNotificationHandler()

// Retour au premier plan = « focus » : les données périmées se rafraîchissent.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'))
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
})

export default function RootLayout() {
  // Fichiers importés un à un : l'index des paquets embarquerait les 32 graisses des deux familles.
  const [fontsLoaded, fontError] = useFonts({
    IBMPlexSans_400Regular: require('@expo-google-fonts/ibm-plex-sans/400Regular/IBMPlexSans_400Regular.ttf'),
    IBMPlexSans_500Medium: require('@expo-google-fonts/ibm-plex-sans/500Medium/IBMPlexSans_500Medium.ttf'),
    IBMPlexSans_600SemiBold: require('@expo-google-fonts/ibm-plex-sans/600SemiBold/IBMPlexSans_600SemiBold.ttf'),
    IBMPlexMono_500Medium: require('@expo-google-fonts/ibm-plex-mono/500Medium/IBMPlexMono_500Medium.ttf'),
  })

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <OnboardingProvider>
          <AuthProvider>
            {/* Polices indisponibles : on continue avec celles du système plutôt que de bloquer. */}
            <RootNavigator fontsReady={fontsLoaded || !!fontError} />
          </AuthProvider>
        </OnboardingProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}

function RootNavigator({ fontsReady }: { fontsReady: boolean }) {
  const { colors, scheme } = useTheme()
  const { done } = useOnboarding()
  const { isRestoring, isAuthenticated } = useAuth()
  const ready = fontsReady && done !== null && !isRestoring
  const [handoff, setHandoff] = useState(true)
  const endHandoff = useCallback(() => setHandoff(false), [])

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined)
  }, [ready])

  if (!ready) return null

  return (
    <View style={[styles.root, { backgroundColor: colors.canvas }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.canvas },
          animation: 'fade',
          animationDuration: 260,
        }}
      >
        <Stack.Screen name="index" options={{ animation: 'none' }} />
        <Stack.Screen name="onboarding" options={{ animation: 'none', gestureEnabled: false }} />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
      </Stack>
      {handoff && <SplashHandoff toOnboarding={!done && !isAuthenticated} onDone={endHandoff} />}
    </View>
  )
}

const styles = StyleSheet.create({ root: { flex: 1 } })
