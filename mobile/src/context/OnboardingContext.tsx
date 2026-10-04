import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * Onboarding vu ou non (premier lancement après installation).
 * Clé versionnée : un futur onboarding de nouveautés pourra être réaffiché
 * sans toucher à celui-ci.
 */
export const ONBOARDING_KEY = 'jappo-dundu.onboarding.v1'

interface OnboardingContextValue {
  /** null tant que la valeur n'est pas lue (le splash reste affiché). */
  done: boolean | null
  complete: () => Promise<void>
  reset: () => Promise<void>
}

const OnboardingContext = createContext<OnboardingContextValue | undefined>(undefined)

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [done, setDone] = useState<boolean | null>(null)

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY)
      .then((value) => setDone(value === 'done'))
      .catch(() => setDone(false))
  }, [])

  const complete = useCallback(async () => {
    setDone(true)
    await AsyncStorage.setItem(ONBOARDING_KEY, 'done').catch(() => undefined)
  }, [])

  const reset = useCallback(async () => {
    setDone(false)
    await AsyncStorage.removeItem(ONBOARDING_KEY).catch(() => undefined)
  }, [])

  const value = useMemo(() => ({ done, complete, reset }), [done, complete, reset])
  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>
}

export function useOnboarding() {
  const context = useContext(OnboardingContext)
  if (!context) throw new Error('useOnboarding doit être utilisé dans OnboardingProvider')
  return context
}
