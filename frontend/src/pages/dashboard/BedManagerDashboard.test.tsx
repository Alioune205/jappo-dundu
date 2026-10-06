import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@/test/render'
import { capacity, facility, mission } from '@/test/fixtures'
import { Dashboard } from '../Dashboard'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('@/lib/api', () => ({ api }))
const home = vi.hoisted(() => ({ id: 7, name: 'Hôpital Principal', latitude: 14.66, longitude: -17.43 }))
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { facility: home }, roles: ['bed_manager'] }),
}))
vi.mock('@/components/map/MapView', () => ({ MapView: () => <div data-testid="map" /> }))
vi.mock('@/context/RealtimeContext', () => ({ useRealtime: () => ({ subscribe: () => () => {} }) }))

const mine = facility({ ...home })
const RESPONSES: Record<string, unknown> = {
  '/api/lits/capacities/': {
    results: [
      capacity({ id: 1, facility: mine, category: 'surgery', category_display: 'Chirurgie', total_beds: 10, occupied_beds: 5, available_beds: 5, occupancy_rate: 0.5 }),
      capacity({ id: 2, facility: mine, category: 'intensive_care', category_display: 'Réanimation', total_beds: 4, occupied_beds: 4, available_beds: 0, occupancy_rate: 1 }),
    ],
  },
  '/api/lits/capacities/summary/': [],
  '/api/ambulances/missions/': {
    results: [
      mission({ id: 1, status: 'transporting', description: 'Accident de la route', destination: mine }),
      mission({ id: 2, description: 'Autre hôpital', destination: facility({ id: 99 }) }),
    ],
  },
  '/api/lits/capacities/nearest/': [{ ...facility({ id: 3, name: 'CHU de Fann' }), distance_km: 4.9, available_beds: 2 }],
}

describe('Tableau de bord de l’administrateur des lits', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.post.mockReset()
    api.get.mockImplementation(async (path: string) => RESPONSES[path])
  })

  it('montre son établissement, ses services vitaux d’abord, et les patients qui arrivent', async () => {
    renderWithProviders(<Dashboard />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Hôpital Principal' })).toBeInTheDocument()
    expect(await screen.findByText('Service vital saturé')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/api/lits/capacities/', { facility: 7 })
    // Seule la mission vers cet hôpital est listée.
    expect(await screen.findByText('Accident de la route')).toBeInTheDocument()
    expect(screen.queryByText('Autre hôpital')).not.toBeInTheDocument()
    // Transfert proposé pour le service vital saturé.
    expect(await screen.findByText('CHU de Fann')).toBeInTheDocument()
  })

  it('enregistre une admission en un clic, et bloque l’admission d’un service plein', async () => {
    api.post.mockResolvedValue({})
    renderWithProviders(<Dashboard />)
    expect(await screen.findByRole('button', { name: 'Admission : Réanimation' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Admission : Chirurgie' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/lits/capacities/1/admit/'))
  })
})
