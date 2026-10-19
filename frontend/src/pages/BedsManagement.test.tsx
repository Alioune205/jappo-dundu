import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/render'
import { capacity, facility } from '@/test/fixtures'
import type { Role } from '@/types/api'
import { BedsManagement } from './BedsManagement'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }))
vi.mock('@/lib/api', () => ({ api }))
vi.mock('@/context/RealtimeContext', () => ({ useRealtime: () => ({ subscribe: () => () => {} }) }))
const auth = vi.hoisted(() => ({ current: { user: null as unknown, roles: [] as Role[], isAdmin: false } }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth.current }))

const principal = facility({ id: 1, name: 'Hôpital Principal de Dakar' })
const fann = facility({ id: 2, name: 'CHU de Fann', city: 'Fann' })
const thies = facility({ id: 3, name: 'Hôpital de Thiès', city: 'Thiès', region: 'thies' })
const samu = facility({ id: 9, name: 'SAMU Dakar', facility_type: 'ambulance_service' })

const CAPACITIES = [
  capacity({ id: 1, facility: principal, category: 'emergency', category_display: 'Urgences', total_beds: 10, occupied_beds: 6, reserved_beds: 1 }),
  capacity({ id: 2, facility: principal, category: 'intensive_care', category_display: 'Réanimation', total_beds: 4, occupied_beds: 4 }),
  capacity({ id: 3, facility: fann, category: 'emergency', category_display: 'Urgences', total_beds: 8, occupied_beds: 2 }),
  capacity({ id: 4, facility: thies, category: 'emergency', category_display: 'Urgences', total_beds: 5, occupied_beds: 1 }),
]

const RESERVATION = {
  id: 7,
  capacity: { id: 1, category: 'emergency', category_display: 'Urgences' },
  facility: principal,
  mission: { id: 12, priority: 'critical', priority_display: 'Critique', status: 'transporting', status_display: 'Transport du patient' },
  reference: '',
  notes: '',
  status: 'active',
  status_display: 'En cours',
  expires_at: new Date(Date.now() + 20 * 60_000).toISOString(),
  created_at: new Date().toISOString(),
  created_by: null,
  closed_at: null,
  closed_by: null,
  closing_reason: '',
}

function serve(reservations: unknown[] = []) {
  api.get.mockImplementation((url: string) =>
    Promise.resolve({ results: url.startsWith('/api/lits/reservations/') ? reservations : CAPACITIES })
  )
}

const card = async (name: RegExp) => screen.findByRole('article', { name })

describe('Lits — gestionnaire d’un hôpital (« Mes lits »)', () => {
  beforeEach(() => {
    auth.current = { user: { id: 5, facility: principal }, roles: ['bed_manager'], isAdmin: false }
    api.post.mockResolvedValue({})
    api.patch.mockResolvedValue({})
    serve()
  })

  it('ouvre sur son établissement seulement, services vitaux en premier', async () => {
    renderWithProviders(<BedsManagement />)
    expect(screen.getByRole('tab', { name: 'Mes lits', selected: true })).toBeInTheDocument()
    const cards = await screen.findAllByRole('article')
    expect(cards).toHaveLength(2)
    expect(cards[0]).toHaveAccessibleName(/^Urgences/)
    expect(screen.queryByText('CHU de Fann')).not.toBeInTheDocument()
  })

  it('montre occupés, réservés et libres, et bloque l’admission d’un service complet', async () => {
    renderWithProviders(<BedsManagement />)
    const urgences = await card(/^Urgences : 3 libres sur 10/)
    expect(within(urgences).getByRole('img', { name: '6 occupés, 1 réservés, 3 libres sur 10' })).toBeInTheDocument()
    const rea = await card(/^Réanimation : 0 libres/)
    expect(within(rea).getByRole('button', { name: /Admettre un patient/ })).toBeDisabled()
    expect(within(rea).getByRole('button', { name: /Réserver un lit/ })).toBeDisabled()
    expect(within(rea).getByText('complet')).toBeInTheDocument()
  })

  it('admet et enregistre une sortie sur le bon service', async () => {
    renderWithProviders(<BedsManagement />)
    const urgences = await card(/^Urgences/)
    fireEvent.click(within(urgences).getByRole('button', { name: /Admettre un patient/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/lits/capacities/1/admit/'))
    fireEvent.click(within(urgences).getByRole('button', { name: /Sortie d’un patient/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/lits/capacities/1/discharge/'))
  })

  it('affiche l’erreur du serveur', async () => {
    api.post.mockRejectedValueOnce(new Error('Aucun lit libre dans ce service.'))
    renderWithProviders(<BedsManagement />)
    fireEvent.click(within(await card(/^Urgences/)).getByRole('button', { name: /Admettre un patient/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Aucun lit libre')
  })

  it('affiche le patient attendu sous son service et enregistre son arrivée', async () => {
    serve([RESERVATION])
    renderWithProviders(<BedsManagement />)
    const urgences = await card(/^Urgences/)
    expect(await within(urgences).findByText('Mission SAMU #12')).toBeInTheDocument()
    expect(within(urgences).getByText('encore 20 min')).toBeInTheDocument()
    fireEvent.click(within(urgences).getByRole('button', { name: 'Patient arrivé' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/lits/reservations/7/fulfill/'))
  })

  it('réserve un lit depuis la carte du service', async () => {
    renderWithProviders(<BedsManagement />)
    fireEvent.click(within(await card(/^Urgences/)).getByRole('button', { name: /Réserver un lit/ }))
    fireEvent.change(await screen.findByLabelText('Référence'), { target: { value: 'Transfert bloc 2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Réserver le lit' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/lits/reservations/', {
        capacity_id: 1,
        mission_id: null,
        reference: 'Transfert bloc 2',
        notes: '',
        hold_minutes: 45,
      })
    )
  })

  it('range l’ajustement de capacité dans le menu « … »', async () => {
    renderWithProviders(<BedsManagement />)
    const urgences = await card(/^Urgences/)
    fireEvent.click(within(urgences).getByRole('button', { name: /Plus d'actions/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Ajuster la capacité/ }))
    expect(await screen.findByLabelText('Lits occupés')).toBeInTheDocument()
  })

  it('consulte le réseau dans « Trouver un lit », sans admission possible', async () => {
    renderWithProviders(<BedsManagement />)
    await card(/^Urgences/)
    fireEvent.click(screen.getByRole('tab', { name: 'Trouver un lit' }))
    const table = await screen.findByRole('table')
    expect(within(table).getByText('CHU de Fann')).toBeInTheDocument()
    expect(within(table).queryByRole('button', { name: /Admettre/ })).not.toBeInTheDocument()
    // Réserver seulement dans son établissement.
    const fannRow = within(table).getAllByRole('row').find((r) => within(r).queryByText('CHU de Fann'))!
    expect(within(fannRow).getByText('Consultation')).toBeInTheDocument()
  })
})

describe('Lits — régulation SAMU', () => {
  beforeEach(() => {
    auth.current = { user: { id: 6, facility: samu }, roles: ['ambulance_manager'], isAdmin: false }
    serve()
  })

  it('ouvre directement « Trouver un lit », réservable dans sa région seulement', async () => {
    renderWithProviders(<BedsManagement />)
    expect(screen.queryByRole('tab', { name: 'Mes lits' })).not.toBeInTheDocument()
    const table = await screen.findByRole('table')
    const row = (name: string) => within(table).getAllByRole('row').find((r) => within(r).queryByText(name))!
    expect(within(row('CHU de Fann')).getByRole('button', { name: /Réserver/ })).toBeEnabled()
    expect(within(row('Hôpital de Thiès')).queryByRole('button', { name: /Réserver/ })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Réservations en cours' })).toBeInTheDocument()
  })

  it('filtre le réseau par recherche', async () => {
    renderWithProviders(<BedsManagement />)
    const table = await screen.findByRole('table')
    fireEvent.change(screen.getByLabelText('Recherche'), { target: { value: 'thiès' } })
    expect(within(table).queryByText('CHU de Fann')).not.toBeInTheDocument()
    expect(within(table).getByText('Hôpital de Thiès')).toBeInTheDocument()
  })
})

describe('Lits — administrateur général', () => {
  beforeEach(() => {
    auth.current = { user: { id: 1, facility: null }, roles: ['admin'], isAdmin: true }
    serve()
  })

  it('choisit l’établissement à gérer', async () => {
    renderWithProviders(<BedsManagement />)
    fireEvent.click(screen.getByRole('tab', { name: 'Gérer un établissement' }))
    const select = await screen.findByLabelText('Établissement à gérer')
    fireEvent.change(select, { target: { value: '2' } })
    expect(await card(/^Urgences : 6 libres sur 8/)).toBeInTheDocument()
  })
})
