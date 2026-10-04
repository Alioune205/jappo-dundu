import { Redirect, Stack, useSegments } from 'expo-router'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/theme'

/**
 * Espace connecté : sans session, retour à la connexion ; compte créé par
 * Google, Facebook ou Apple sans téléphone ni région, passage par
 * « complete-profile » avant tout le reste.
 */
export default function AppLayout() {
  const { isAuthenticated, user } = useAuth()
  const { colors } = useTheme()
  const segments = useSegments()
  if (!isAuthenticated) return <Redirect href="/login" />
  const incomplete = !user?.phone_number || !user?.region
  if (incomplete && segments[segments.length - 1] !== 'complete-profile') return <Redirect href="/complete-profile" />
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas }, animation: 'fade' }} />
}
