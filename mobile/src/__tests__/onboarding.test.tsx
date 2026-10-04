import React from 'react'
import { Text } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useSharedValue } from 'react-native-reanimated'
import { ONBOARDING_KEY, OnboardingProvider, useOnboarding } from '@/context/OnboardingContext'
import { Controls } from '@/features/onboarding/Controls'
import { SLIDES } from '@/features/onboarding/content'
import { OnboardingScreen } from '@/features/onboarding/OnboardingScreen'

const mockReplace = jest.fn()
// Démontage explicite entre les tests (rendu asynchrone de Testing Library 14).
afterEach(async () => {
  await cleanup()
})
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }))

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
}

describe('OnboardingContext', () => {
  beforeEach(() => AsyncStorage.clear())

  function Probe() {
    const { done, complete } = useOnboarding()
    return (
      <>
        <Text testID="done">{String(done)}</Text>
        <Text onPress={complete}>terminer</Text>
      </>
    )
  }

  it('premier lancement : onboarding à montrer, puis mémorisé une fois terminé', async () => {
    await render(
      <OnboardingProvider>
        <Probe />
      </OnboardingProvider>
    )
    await waitFor(() => expect(screen.getByTestId('done')).toHaveTextContent('false'))
    await act(async () => await fireEvent.press(screen.getByText('terminer')))
    expect(screen.getByTestId('done')).toHaveTextContent('true')
    expect(await AsyncStorage.getItem(ONBOARDING_KEY)).toBe('done')
  })

  it('lancements suivants : onboarding déjà vu', async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'done')
    await render(
      <OnboardingProvider>
        <Probe />
      </OnboardingProvider>
    )
    await waitFor(() => expect(screen.getByTestId('done')).toHaveTextContent('true'))
  })
})

describe('Controls', () => {
  function Harness(props: Partial<React.ComponentProps<typeof Controls>>) {
    const progress = useSharedValue(props.isLast ? 3 : 0)
    return (
      <Controls
        progress={progress}
        count={4}
        width={342}
        isLast={false}
        onNext={jest.fn()}
        onPrevious={jest.fn()}
        onSelect={jest.fn()}
        onStart={jest.fn()}
        onLogin={jest.fn()}
        {...props}
      />
    )
  }

  it('avant le dernier écran : le bouton passe à l’écran suivant', async () => {
    const onNext = jest.fn()
    const onStart = jest.fn()
    await render(<Harness onNext={onNext} onStart={onStart} />)
    await fireEvent.press(screen.getByLabelText('Écran suivant'))
    expect(onNext).toHaveBeenCalledTimes(1)
    expect(onStart).not.toHaveBeenCalled()
  })

  it('dernier écran : « Commencer » mène à l’inscription, le lien à la connexion', async () => {
    const onStart = jest.fn()
    const onLogin = jest.fn()
    await render(<Harness isLast onStart={onStart} onLogin={onLogin} />)
    await fireEvent.press(screen.getByLabelText('Commencer : créer mon compte'))
    expect(onStart).toHaveBeenCalledTimes(1)
    await fireEvent.press(screen.getByLabelText('J’ai déjà un compte : me connecter'))
    expect(onLogin).toHaveBeenCalledTimes(1)
  })

  it('chaque point de pagination mène à son écran', async () => {
    const onSelect = jest.fn()
    await render(<Harness onSelect={onSelect} />)
    await fireEvent.press(screen.getByLabelText('Écran 3 sur 4'))
    expect(onSelect).toHaveBeenCalledWith(2)
  })
})

describe('OnboardingScreen', () => {
  const renderScreen = () =>
    act(() =>
      render(
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <OnboardingProvider>
          <OnboardingScreen />
        </OnboardingProvider>
      </SafeAreaProvider>
      )
    )

  it('expose seulement l’écran affiché au lecteur d’écran ; les autres restent masqués', async () => {
    await renderScreen()
    expect(screen.getByLabelText(/^Écran 1 sur 4\. /)).toBeTruthy()
    expect(screen.getByLabelText('Passer la présentation')).toBeTruthy()
    // Hors champ : présents (prêts pour le geste) mais pas lus, sinon VoiceOver
    // enchaînerait les quatre textes d'un coup.
    SLIDES.slice(1).forEach((slide, i) => {
      expect(screen.queryByLabelText(new RegExp(`^Écran ${i + 2} sur 4\. `))).toBeNull()
      expect(screen.getByText(slide.title, { includeHiddenElements: true })).toBeTruthy()
    })
  })

  it('la promesse de confidentialité figure dans la présentation', async () => {
    await renderScreen()
    expect(screen.getByText(/jamais transmise aux hôpitaux/, { includeHiddenElements: true })).toBeTruthy()
  })
})
