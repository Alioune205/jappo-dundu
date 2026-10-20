import { Redirect } from 'expo-router'
import { useAuth } from '@/context/AuthContext'
import { useOnboarding } from '@/context/OnboardingContext'
import { isDriver } from '@/lib/missions'

/** Aiguillage de démarrage : espace ambulancier ou donneur, onboarding (premier lancement) ou connexion. */
export default function Index() {
  const { isAuthenticated, user } = useAuth()
  const { done } = useOnboarding()
  if (isAuthenticated) return <Redirect href={isDriver(user?.roles) ? '/mission' : '/home'} />
  if (!done) return <Redirect href="/onboarding" />
  return <Redirect href="/login" />
}
