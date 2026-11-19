import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/render'
import { capacity, facility, mission } from '@/test/fixtures'
import { Dashboard } from '../Dashboard'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('@/lib/api', () => ({ api }))
const home = vi.hoisted(() => ({ id: 7, name: 'Hôpital Principal', latitude: 14.66, longitude: -17.43 }))
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { facility: home }, roles: ['bed_manager'] }),
}))
vi.mock('@/context/RealtimeContext', () => ({ useRealtime: () => ({ subscribe: () => () => {} }) }))

const mine = facility({ ...home })
const missionsResponse = vi.hoisted(() => ({ results: [] as unknown[] }))
const RESPONSES: Record<string, unknown> = {
  '/api/lits/capacities/': {
    results: [
      capacity({ id: 1, facility: mine, category: 'surgery', category_display: 'Chirurgie', total_beds: 10, occupied_beds: 5, available_beds: 5, occupancy_rate: 0.5 }),
      capacity({ id: 2, facility: mine, category: 'intensive_care', category_display: 'Réanimation', total_beds: 4, occupied_beds: 4, available_beds: 0, occupancy_rate: 1 }),
    ],
  },
  '/api/lits/capacities/summary/': [],
  '/api/ambulances/missions/': missionsResponse,
}

describe('Tableau de bord de l’administrateur des lits', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.post.mockReset()
    api.get.mockImplementation(async (path: string) => RESPONSES[path])
    missionsResponse.results = [
      mission({ id: 1, status: 'transporting', description: 'Accident de la route', destination: mine }),
      mission({ id: 2, description: 'Autre hôpital', destination: facility({ id: 99 }) }),
    ]
  })

  it('montre son établissement et signale en premier le service vital saturé', async () => {
    renderWithProviders(<Dashboard />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Hôpital Principal' })).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/api/lits/capacities/', { facility: 7 })
    const urgent = await screen.findByRole('region', { name: 'À traiter maintenant' })
    expect(await within(urgent).findByText('Service vital saturé')).toBeInTheDocument()
    expect(within(urgent).getByText('Réanimation')).toBeInTheDocument()
    expect(within(urgent).getByRole('link', { name: /Trouver un lit ailleurs/ })).toHaveAttribute('href', '/beds')
    // Un seul autre point derrière : le patient en route vers cet hôpital.
    expect(within(urgent).getByText('1 autre point')).toBeInTheDocument()
    // Seule la mission vers cet hôpital est comptée.
    expect(screen.getByText('Patients en approche')).toBeInTheDocument()
    expect(screen.queryByText('Autre hôpital')).not.toBeInTheDocument()
  })

  it('met en avant un patient annoncé qui attend la réponse de l’hôpital', async () => {
    missionsResponse.results = [
      mission({ id: 1, status: 'transporting', description: 'Accident de la route', destination: mine, destination_status: 'pending' }),
    ]
    renderWithProviders(<Dashboard />)
    const urgent = await screen.findByRole('region', { name: 'À traiter maintenant' })
    expect(await within(urgent).findByText('Patient annoncé · à confirmer')).toBeInTheDocument()
    expect(within(urgent).getByText('Accident de la route')).toBeInTheDocument()
    expect(within(urgent).getByText('Pouvez-vous accueillir ce patient ?')).toBeInTheDocument()
  })

  it('laisse les admissions au module Lits : aucun bouton d’admission sur l’accueil', async () => {
    renderWithProviders(<Dashboard />)
    await screen.findByRole('region', { name: 'Occupation par service' })
    expect(screen.queryByRole('button', { name: /Admettre un patient/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Solutions de transfert')).not.toBeInTheDocument()
  })
})
