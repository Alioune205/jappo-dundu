import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/render'
import { ambulance, bloodRequest, capacity, mission } from '@/test/fixtures'
import { Dashboard } from './Dashboard'

const api = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/lib/api', () => ({ api }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null }) }))
// La carte Leaflet n'a pas sa place dans jsdom : on vérifie seulement ce qu'elle reçoit.
vi.mock('@/components/map/MapView', () => ({
  MapView: (props: { ambulances: unknown[]; missions: unknown[] }) => (
    <div data-testid="map">
      {props.ambulances.length} ambulances, {props.missions.length} missions
    </div>
  ),
}))

const subscribe = vi.hoisted(() => vi.fn(() => () => {}))
vi.mock('@/context/RealtimeContext', () => ({ useRealtime: () => ({ subscribe }) }))

const RESPONSES: Record<string, unknown> = {
  '/api/sang/requests/': {
    results: [bloodRequest({ id: 1, urgency: 'critical' }), bloodRequest({ id: 2, urgency: 'urgent', blood_group: 'A+' })],
  },
  '/api/lits/capacities/summary/': [
    capacity({ id: 1, total_beds: 10, occupied_beds: 9 }),
    capacity({ id: 2, category: 'surgery', category_display: 'Chirurgie', total_beds: 10, occupied_beds: 5 }),
  ],
  '/api/ambulances/vehicles/': {
    results: [ambulance({ id: 1 }), ambulance({ id: 2, status: 'on_mission' }), ambulance({ id: 3 })],
  },
  '/api/ambulances/missions/': { results: [mission()] },
  '/api/ml/predictions/summary/': [{ region: 'dakar', critical_count: 2, warning_count: 1, normal_count: 3 }],
  '/api/facilities/': { results: [] },
}

describe('Dashboard', () => {
  beforeEach(() => {
    subscribe.mockClear()
    api.get.mockImplementation(async (path: string) => RESPONSES[path])
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  })

  it('calcule les indicateurs à partir des données réelles', async () => {
    renderWithProviders(<Dashboard />)
    // 1 + 5 = 6 lits libres sur 20 : 70 % d'occupation.
    expect(await screen.findByText('/ 20')).toBeInTheDocument()
    expect(screen.getByText('6')).toBeInTheDocument()
    // Formatage français : espace insécable fine avant « % ».
    expect(screen.getByText(/^70\s%\soccupés$/)).toBeInTheDocument()
    // 2 demandes de sang ouvertes dont 1 vitale.
    expect(await screen.findByText('1 vitale')).toBeInTheDocument()
    // 2 ambulances disponibles sur 3.
    expect(screen.getByText('/ 3')).toBeInTheDocument()
    // 2 risques critiques de pénurie.
    expect(screen.getByText('Action requise')).toBeInTheDocument()
    expect(await screen.findByTestId('map')).toHaveTextContent('3 ambulances, 1 missions')
  })

  it('n’écoute que des événements ciblés, jamais le joker « * »', async () => {
    renderWithProviders(<Dashboard />)
    await screen.findByText('/ 20')
    const events = subscribe.mock.calls.map((call) => (call as unknown as [string])[0])
    expect(events).not.toContain('*')
    expect(events).toEqual(
      expect.arrayContaining(['blood_request_created', 'bed_capacity_updated', 'mission_created', 'ambulance_position'])
    )
  })
})
