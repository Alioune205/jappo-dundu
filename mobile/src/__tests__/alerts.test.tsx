import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { RequestSheet } from '@/features/alerts/RequestSheet'
import { api } from '@/lib/api'
import { QK } from '@/lib/queries'
import type { DonorProfile, NearbyRequest } from '@/types/api'

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api')
  return { ...actual, api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn() } }
})

// Premier rendu lent sous charge (chargement des modules natifs simulés).
jest.setTimeout(20_000)

afterEach(async () => {
  await cleanup()
  jest.clearAllMocks()
})

const SAFE_AREA = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }

const donor = {
  id: 1,
  blood_group: 'O-',
  is_available: true,
  is_eligible: true,
  next_eligible_date: null,
  ineligibility_reasons: [],
} as unknown as DonorProfile

const request: NearbyRequest = {
  id: 42,
  facility: { id: 1, name: 'CHU de Fann', city: 'Dakar', region: 'dakar', latitude: 14.69, longitude: -17.46, phone_number: '+221338691818' },
  blood_group: 'O-',
  blood_group_display: 'O-',
  units_remaining: 3,
  urgency: 'critical',
  urgency_display: 'Critique',
  needed_by: null,
  created_at: new Date().toISOString(),
  distance_km: 2.4,
  my_response: null,
}

function setup(props: Partial<React.ComponentProps<typeof RequestSheet>> = {}) {
  // gcTime infini : aucun minuteur de 5 min qui retiendrait Jest après les tests.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  })
  client.setQueryData(QK.nearby, [request])
  const ui = (
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <QueryClientProvider client={client}>
        <RequestSheet visible request={request} loading={false} donor={donor} onClose={jest.fn()} {...props} />
      </QueryClientProvider>
    </SafeAreaProvider>
  )
  return { client, ui }
}

describe('RequestSheet', () => {
  it('« Je viens donner » envoie l’acceptation et met la liste à jour aussitôt', async () => {
    let resolve!: (value: unknown) => void
    ;(api.post as jest.Mock).mockReturnValue(new Promise((r) => (resolve = r)))
    const { client, ui } = setup()
    await render(ui)

    await fireEvent.press(screen.getByLabelText('Je viens donner'))
    expect(api.post).toHaveBeenCalledWith('/api/sang/requests/42/respond/', { status: 'accepted' })
    // Optimiste : la réponse figure dans le cache avant celle du serveur.
    await waitFor(() => expect(client.getQueryData<NearbyRequest[]>(QK.nearby)?.[0].my_response).toBe('accepted'))
    await act(async () => resolve({ id: 1, status: 'accepted' }))
  })

  it('un refus du serveur annule la mise à jour optimiste et s’affiche', async () => {
    const { ApiError } = jest.requireActual('@/lib/api')
    ;(api.post as jest.Mock).mockRejectedValue(new ApiError(409, 'Cette demande est clôturée.'))
    const { client, ui } = setup()
    await render(ui)

    await fireEvent.press(screen.getByLabelText('Je viens donner'))
    expect(await screen.findByText('Cette demande est clôturée.')).toBeTruthy()
    expect(client.getQueryData<NearbyRequest[]>(QK.nearby)?.[0].my_response).toBeNull()
  })

  it('donneur pas encore éligible : pas de bouton d’acceptation, la date du prochain don à la place', async () => {
    const { ui } = setup({ donor: { ...donor, is_eligible: false, next_eligible_date: '2026-12-02' } })
    await render(ui)
    expect(screen.queryByLabelText('Je viens donner')).toBeNull()
    expect(screen.getByText(/Prochain don possible le 2 décembre 2026/)).toBeTruthy()
  })

  it('engagement pris : itinéraire et appel, désistement en deux touchers', async () => {
    ;(api.post as jest.Mock).mockResolvedValue({})
    const { ui } = setup({ request: { ...request, my_response: 'accepted' } })
    await render(ui)
    expect(screen.getByLabelText('Itinéraire')).toBeTruthy()
    expect(screen.getByLabelText('Appeler')).toBeTruthy()

    await fireEvent.press(screen.getByText('Je ne peux plus venir'))
    expect(api.post).not.toHaveBeenCalled()
    await fireEvent.press(screen.getByText(/confirmer le désistement/))
    expect(api.post).toHaveBeenCalledWith('/api/sang/requests/42/respond/', { status: 'cancelled' })
  })

  it('demande disparue (clôturée) : message explicite', async () => {
    const { ui } = setup({ request: null })
    await render(ui)
    expect(screen.getByText('Demande indisponible')).toBeTruthy()
  })
})
