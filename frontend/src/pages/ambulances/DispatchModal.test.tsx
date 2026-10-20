import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@/test/render'
import { ambulance, facility, mission } from '@/test/fixtures'
import type { Mission, Role } from '@/types/api'
import { DispatchModal } from './DispatchModal'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }))
vi.mock('@/lib/api', () => ({ api }))
const samu = facility({ id: 9, name: 'SAMU National 15', facility_type: 'ambulance_service' })
const auth = vi.hoisted(() => ({ current: { user: null as unknown, roles: [] as Role[], isAdmin: false } }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth.current }))

const principal = facility({ id: 1, name: 'Hôpital Principal de Dakar' })
const thies = facility({ id: 3, name: 'Hôpital de Thiès', city: 'Thiès', region: 'thies' })

function serve(current: Mission) {
  api.get.mockImplementation((url: string) => {
    if (url === `/api/ambulances/missions/${current.id}/`) return Promise.resolve(current)
    if (url === '/api/ambulances/vehicles/nearest/')
      return Promise.resolve([
        { ...ambulance({ id: 1, plate_number: 'DK-3341-CC', facility: samu }), distance_km: 1.2 },
        { ...ambulance({ id: 2, plate_number: 'DK-5120-BB', facility: samu, driver: { id: 21, full_name: 'Moussa Sall' } }), distance_km: 3.4 },
      ])
    if (url === `/api/ambulances/missions/${current.id}/destinations/`)
      return Promise.resolve({
        origin: { latitude: 14.7, longitude: -17.4 },
        category: 'emergency',
        results: [
          { ...principal, distance_km: 2.1, available_beds: 4 },
          { ...thies, distance_km: 55, available_beds: 2 },
        ],
      })
    return Promise.resolve({ results: [] })
  })
}

describe('Régulation d’une mission', () => {
  beforeEach(() => {
    auth.current = { user: { id: 3, facility: samu }, roles: ['ambulance_manager'], isAdmin: false }
    api.post.mockResolvedValue({})
  })

  it('affecte l’ambulance choisie parmi les plus proches', async () => {
    const pending = mission({ id: 12, status: 'pending', status_display: 'En attente' })
    serve(pending)
    renderWithProviders(<DispatchModal mission={pending} onClose={vi.fn()} />)

    expect(await screen.findByText('La plus proche')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Affecter DK-5120-BB' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/ambulances/missions/12/assign/', { ambulance_id: 2 })
    )
  })

  it('réserve un lit pour orienter la mission, dans sa région uniquement', async () => {
    const assigned = mission({ id: 12, status: 'assigned', status_display: 'Ambulance en route' })
    serve(assigned)
    renderWithProviders(<DispatchModal mission={assigned} onClose={vi.fn()} />)

    const reserveThies = await screen.findByRole('button', { name: 'Réserver un lit à Hôpital de Thiès' })
    expect(reserveThies).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Réserver un lit à Hôpital Principal de Dakar' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/lits/reservations/', {
        facility_id: 1,
        category: 'emergency',
        mission_id: 12,
        hold_minutes: 45,
      })
    )
  })

  it('l’annulation exige un motif', async () => {
    const assigned = mission({ id: 12, status: 'assigned', status_display: 'Ambulance en route' })
    serve(assigned)
    const onClose = vi.fn()
    renderWithProviders(<DispatchModal mission={assigned} onClose={onClose} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Annuler la mission…' }))
    const submit = screen.getByRole('button', { name: 'Annuler la mission' })
    expect(submit).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Motif d’annulation'), { target: { value: 'Pris en charge par les pompiers' } })
    fireEvent.click(submit)
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/ambulances/missions/12/status/', {
        status: 'cancelled',
        cancellation_reason: 'Pris en charge par les pompiers',
      })
    )
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('un transport commencé ne s’annule plus', async () => {
    const transporting = mission({ id: 12, status: 'transporting', status_display: 'Transport du patient', destination: principal })
    serve(transporting)
    renderWithProviders(<DispatchModal mission={transporting} onClose={vi.fn()} />)
    expect(await screen.findByText(/Actuelle :/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Annuler la mission…' })).toBeNull()
  })
})
