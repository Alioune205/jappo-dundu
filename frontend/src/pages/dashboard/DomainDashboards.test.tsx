import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/render'
import { ambulance, bloodRequest, mission } from '@/test/fixtures'
import { Dashboard } from '../Dashboard'

const api = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/lib/api', () => ({ api }))
const auth = vi.hoisted(() => ({ roles: ['blood_manager'] as string[] }))
const home = vi.hoisted(() => ({ id: 4, name: 'CNTS', region: 'dakar', region_display: 'Dakar', latitude: 14.69, longitude: -17.44 }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { facility: home }, roles: auth.roles }) }))
vi.mock('@/components/map/MapView', () => ({ MapView: () => <div data-testid="map" /> }))
vi.mock('@/context/RealtimeContext', () => ({ useRealtime: () => ({ subscribe: () => () => {} }) }))

const stock = (blood_group: string, units_available: number) => ({
  id: units_available,
  center_name: 'CNTS Dakar',
  region: 'dakar',
  blood_group,
  date: '2026-10-05',
  units_available,
  source: 'synthetic',
})
const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)

const RESPONSES: Record<string, (params?: Record<string, unknown>) => unknown> = {
  '/api/sang/requests/': () => ({
    results: [
      bloodRequest({ id: 1, urgency: 'critical', units_needed: 4, units_collected: 1, units_remaining: 3, response_counts: { accepted: 2, declined: 0, donated: 1 } }),
      bloodRequest({ id: 2, urgency: 'urgent', blood_group: 'A+', units_remaining: 2, response_counts: null }),
    ],
  }),
  '/api/ml/stocks/': () => ({ results: [stock('O-', 6), stock('O-', 4), stock('AB+', 30)] }),
  '/api/ml/predictions/': (params) => ({
    results:
      params?.risk_level === 'CRITICAL'
        ? [{ id: 9, blood_group: 'O-', center_name: 'CNTS Dakar', prediction_date: tomorrow, risk_level: 'CRITICAL', days_of_supply: 0.8 }]
        : [],
  }),
  '/api/ambulances/missions/': () => ({
    results: [
      mission({ id: 1, status: 'pending', description: 'Accident sur la VDN', created_at: new Date(Date.now() - 12 * 60_000).toISOString() }),
      mission({ id: 2, status: 'transporting', description: 'Malaise au marché' }),
    ],
  }),
  '/api/ambulances/vehicles/': () => ({
    results: [ambulance({ id: 1 }), ambulance({ id: 2, plate_number: 'DK-9', status: 'on_mission', status_display: 'En mission' })],
  }),
  '/api/lits/capacities/summary/': () => [],
  '/api/ml/predictions/summary/': () => [],
  '/api/ambulances/missions/stats/': () => ({
    period_days: 30,
    missions: { total: 12, by_status: {} },
    assignment_delay_minutes: { count: 12, average: 4, median: 3 },
    response_time_minutes: { count: 10, average: 14, median: 12 },
    fleet: {},
  }),
}

describe('Tableaux de bord par domaine', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.get.mockImplementation(async (path: string, params?: Record<string, unknown>) => RESPONSES[path]?.(params))
  })

  it('administrateur du sang : demandes, stock par groupe et pénurie prévue', async () => {
    auth.roles = ['blood_manager']
    renderWithProviders(<Dashboard />)
    // Pénurie prévue : portée par l'indicateur « Groupes en pénurie » (O− critique à 7 jours).
    expect(await screen.findByText('Critique : O−')).toBeInTheDocument()
    // Stock régional : somme des centres pour un même groupe (6 + 4).
    expect(await screen.findByLabelText(/^O− : 10 poches/)).toBeInTheDocument()
    // Aucun relevé pour B+ : jamais présenté comme un stock stable.
    expect(screen.getByLabelText(/^B\+ : Pas de relevé/)).toBeInTheDocument()
    expect(screen.getByText(/données simulées/)).toBeInTheDocument()
    // 3 + 2 poches manquantes, 2 donneurs en route.
    // La tuile « Poches manquantes » est la carte d'encre mise en avant.
    const tile = screen.getByText('Poches manquantes').closest('.ink-card') as HTMLElement
    expect(within(tile).getByText('5')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/api/ml/stocks/', { region: 'dakar', days: 1 })
    expect(api.get).not.toHaveBeenCalledWith('/api/lits/capacities/summary/', expect.anything())
    // La demande la plus urgente est à traiter en premier ; la liste complète vit dans le module Sang.
    const urgent = screen.getByRole('region', { name: 'À traiter maintenant' })
    expect(within(urgent).getByText('Demande vitale')).toBeInTheDocument()
    expect(within(urgent).getByText('3 poches')).toBeInTheDocument()
    expect(within(urgent).getByText('1 autre point')).toBeInTheDocument()
  })

  it('administrateur des ambulances : mission en attente signalée, flotte et délais', async () => {
    auth.roles = ['ambulance_manager']
    renderWithProviders(<Dashboard />)
    // La plus ancienne mission sans ambulance est la carte « Attente sans ambulance ».
    const urgent = await screen.findByRole('region', { name: 'Attente sans ambulance' })
    expect(await within(urgent).findByText('Sans ambulance')).toBeInTheDocument()
    expect(within(urgent).getByText('Accident sur la VDN')).toBeInTheDocument()
    expect(within(urgent).getByRole('link', { name: /Affecter une ambulance/ })).toHaveAttribute('href', '/ambulances')
    // Créée il y a 12 minutes : le chronomètre l'affiche à la seconde.
    expect(screen.getByRole('timer')).toHaveTextContent(/^00:1[12]:\d\d$/)
    // Flotte : 1 ambulance libre sur 2.
    expect(await screen.findByText('1 / 2')).toBeInTheDocument()
    expect(await screen.findByText(/Médiane sur 30 jours · 12 missions/)).toBeInTheDocument()
  })

  it('un compte multi-domaines garde la vue réseau', async () => {
    auth.roles = ['blood_manager', 'bed_manager']
    renderWithProviders(<Dashboard />)
    // Rattaché à un établissement, il garde la vue réseau (et non la vue d'un seul domaine).
    expect(await screen.findByRole('heading', { level: 1, name: 'CNTS' })).toBeInTheDocument()
    expect(await screen.findByText(/sur tout le réseau/)).toBeInTheDocument()
    expect(screen.queryByText(/poches dans la région/)).not.toBeInTheDocument()
  })
})
