import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/render'
import { ambulance, facility } from '@/test/fixtures'
import type { Role } from '@/types/api'
import { AmbulancesManagement } from './AmbulancesManagement'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }))
vi.mock('@/lib/api', () => ({ api }))
vi.mock('@/context/RealtimeContext', () => ({ useRealtime: () => ({ subscribe: () => () => {} }) }))
vi.mock('@/components/map/MapView', () => ({ MapView: () => <div data-testid="map" /> }))
const auth = vi.hoisted(() => ({ current: { user: null as unknown, roles: [] as Role[], isAdmin: false } }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth.current }))

const samu = facility({ id: 9, name: 'SAMU National 15', facility_type: 'ambulance_service' })
const FLEET = [
  ambulance({ id: 1, plate_number: 'DK-3341-CC', facility: samu, driver: { id: 21, full_name: 'Moussa Sall' } }),
  ambulance({ id: 2, plate_number: 'DK-5120-BB', facility: samu, status: 'on_mission', status_display: 'En mission' }),
]
const DRIVERS = [
  { id: 21, full_name: 'Moussa Sall', phone_number: null, ambulance: { id: 1, plate_number: 'DK-3341-CC' } },
  { id: 22, full_name: 'Awa Diallo', phone_number: null, ambulance: null },
]

function serve() {
  api.get.mockImplementation((url: string) => {
    if (url === '/api/ambulances/vehicles/') return Promise.resolve({ results: FLEET })
    if (url === '/api/ambulances/vehicles/drivers/') return Promise.resolve(DRIVERS)
    if (url === '/api/ambulances/missions/stats/') return Promise.resolve({})
    return Promise.resolve({ results: [] })
  })
}

async function openFleet() {
  renderWithProviders(<AmbulancesManagement />)
  fireEvent.click(await screen.findByRole('tab', { name: /Véhicules/ }))
  return screen.findByText('DK-3341-CC')
}

describe('Flotte SAMU — administration des véhicules', () => {
  beforeEach(() => {
    auth.current = { user: { id: 3, facility: samu }, roles: ['ambulance_manager'], isAdmin: false }
    api.post.mockResolvedValue({})
    api.patch.mockResolvedValue({})
    serve()
  })

  it('met un véhicule hors service, jamais une ambulance en mission', async () => {
    await openFleet()
    const busy = screen.getByText('DK-5120-BB').closest('tr')!
    expect(within(busy).queryByRole('button', { name: /hors service/ })).toBeNull()

    const row = screen.getByText('DK-3341-CC').closest('tr')!
    fireEvent.click(within(row).getByRole('button', { name: 'Mettre hors service' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/ambulances/vehicles/1/availability/', { status: 'out_of_service' })
    )
  })

  it('ajoute un véhicule rattaché à son service, avec un chauffeur libre', async () => {
    await openFleet()
    fireEvent.click(screen.getByRole('button', { name: 'Véhicule' }))

    fireEvent.change(await screen.findByLabelText('Immatriculation'), { target: { value: 'DK-7777-ZZ' } })
    expect(screen.getByLabelText('Base')).toHaveValue('SAMU National 15')
    const driver = screen.getByLabelText('Chauffeur')
    await waitFor(() => expect(within(driver).getByRole('option', { name: 'Awa Diallo' })).toBeInTheDocument())
    // Un ambulancier qui conduit déjà un autre véhicule ne peut pas être choisi.
    expect(within(driver).getByRole('option', { name: /Moussa Sall — conduit déjà DK-3341-CC/ })).toBeDisabled()
    fireEvent.change(driver, { target: { value: '22' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter le véhicule' }))

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/ambulances/vehicles/', {
        plate_number: 'DK-7777-ZZ',
        facility_id: 9,
        ambulance_type: 'basic',
        driver_id: 22,
      })
    )
  })

  it('modifie le chauffeur d’un véhicule existant', async () => {
    await openFleet()
    fireEvent.click(screen.getByRole('button', { name: 'Modifier DK-3341-CC' }))
    const driver = await screen.findByLabelText('Chauffeur')
    // Son propre chauffeur reste sélectionnable.
    await waitFor(() => expect(within(driver).getByRole('option', { name: 'Moussa Sall' })).not.toBeDisabled())
    fireEvent.change(driver, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/ambulances/vehicles/1/', expect.objectContaining({ driver_id: null }))
    )
  })

  it('le personnel hospitalier régule sans administrer la flotte', async () => {
    auth.current = { user: { id: 4, facility: samu }, roles: ['hospital_staff'], isAdmin: false }
    await openFleet()
    expect(screen.queryByRole('button', { name: 'Mettre hors service' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Véhicule' })).toBeNull()
  })
})
