import { Redirect } from 'expo-router'
import { useAuth } from '@/context/AuthContext'
import { useOnboarding } from '@/context/OnboardingContext'

/** Aiguillage de démarrage : application, onboarding (premier lancement) ou connexion. */
export default function Index() {
  const { isAuthenticated } = useAuth()
  const { done } = useOnboarding()
  if (isAuthenticated) return <Redirect href="/alerts" />
  if (!done) return <Redirect href="/onboarding" />
  return <Redirect href="/login" />
}
