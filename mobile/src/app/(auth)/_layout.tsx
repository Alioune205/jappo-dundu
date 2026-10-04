import { Redirect, Stack } from 'expo-router'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/theme'

/** Écrans publics : un utilisateur déjà connecté est renvoyé vers l'application. */
export default function AuthLayout() {
  const { isAuthenticated } = useAuth()
  const { colors } = useTheme()
  if (isAuthenticated) return <Redirect href="/alerts" />
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvas },
        animation: 'fade',
        animationDuration: 220,
      }}
    />
  )
}
