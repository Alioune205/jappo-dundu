import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import SosScreen from '@/app/(app)/sos'
import { api } from '@/lib/api'
import type { SosAlert } from '@/lib/sos'

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api')
  return { ...actual, api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn() } }
})
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), canGoBack: () => true, replace: jest.fn() }) }))
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { phone_number: '+221771112233' } }) }))
jest.mock('expo-location', () => ({
  Accuracy: { High: 4 },
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getCurrentPositionAsync: jest.fn(async () => ({ coords: { latitude: 14.7251234, longitude: -17.4551234 } })),
}))

jest.setTimeout(20_000)

afterEach(async () => {
  await cleanup()
  jest.clearAllMocks()
})

const SAFE_AREA = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }

const pending: SosAlert = {
  id: 31,
  status: 'pending',
  status_display: "En attente d'une ambulance",
  description: 'SOS — Accident',
  pickup_address: 'Devant la pharmacie',
  created_at: new Date().toISOString(),
  assigned_at: null,
  on_site_at: null,
  completed_at: null,
  cancelled_at: null,
  cancellation_reason: '',
  ambulance: null,
}

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <QueryClientProvider client={client}>
        <SosScreen />
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}

describe('Alerte SOS', () => {
  it('envoie la position précise et la nature de l’urgence, puis affiche le suivi', async () => {
    const { ApiError } = jest.requireActual('@/lib/api')
    ;(api.get as jest.Mock).mockRejectedValue(new ApiError(404, 'Aucune alerte SOS récente.'))
    ;(api.post as jest.Mock).mockResolvedValue(pending)
    await renderScreen()

    const send = await screen.findByLabelText('Choisissez ce qui se passe')
    expect(send).toBeDisabled()
    await fireEvent.press(screen.getByLabelText('Accident'))
    await fireEvent.changeText(screen.getByPlaceholderText('ex. devant la pharmacie, 2e étage'), ' Devant la pharmacie ')
    await fireEvent(screen.getByLabelText('Envoyer l’alerte SOS'), 'longPress')

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/ambulances/sos/', {
        latitude: 14.7251234,
        longitude: -17.4551234,
        kind: 'accident',
        landmark: 'Devant la pharmacie',
      })
    )
    expect(await screen.findByText('Alerte reçue par le SAMU')).toBeTruthy()
    expect(screen.getByText(/vous rappeler au 77 111 22 33/)).toBeTruthy()
  })

  it('montre l’ambulance en route et sa distance', async () => {
    ;(api.get as jest.Mock).mockResolvedValue({
      ...pending,
      status: 'assigned',
      status_display: 'Ambulance en route',
      ambulance: { plate_number: 'DK-3341-CC', ambulance_type_display: 'Ambulance de transport', distance_km: 2.3 },
    })
    await renderScreen()
    expect(await screen.findByText('Une ambulance arrive')).toBeTruthy()
    expect(screen.getByText('Ambulance de transport DK-3341-CC · à 2,3 km')).toBeTruthy()
    // Une ambulance est partie : l'alerte ne se retire plus depuis l'application.
    expect(screen.queryByText('Fausse alerte : retirer mon alerte')).toBeNull()
  })

  it('retirer une fausse alerte demande une confirmation', async () => {
    ;(api.get as jest.Mock).mockResolvedValue(pending)
    ;(api.post as jest.Mock).mockResolvedValue({ ...pending, status: 'cancelled', status_display: 'Annulée' })
    await renderScreen()
    await fireEvent.press(await screen.findByText('Fausse alerte : retirer mon alerte'))
    expect(api.post).not.toHaveBeenCalled()
    await fireEvent.press(screen.getByText('Toucher à nouveau pour retirer l’alerte'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/ambulances/sos/31/cancel/'))
  })
})
