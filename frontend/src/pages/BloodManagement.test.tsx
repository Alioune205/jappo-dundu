import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/render'
import { bloodRequest } from '@/test/fixtures'
import type { Role } from '@/types/api'
import { BloodManagement } from './BloodManagement'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('@/lib/api', () => ({ api }))
vi.mock('@/context/RealtimeContext', () => ({ useRealtime: () => ({ subscribe: () => () => {} }) }))
const auth = vi.hoisted(() => ({
  current: { user: { facility: { id: 1 } } as unknown, roles: ['blood_manager'] as Role[], isAdmin: false },
}))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth.current }))

const REQUESTS = [
  bloodRequest({ id: 100, blood_group: 'O-', urgency: 'critical' }),
  bloodRequest({ id: 101, blood_group: 'A+', urgency: 'normal', urgency_display: 'Normale' }),
]

function mockApi() {
  api.get.mockImplementation(async (path: string) => {
    if (path === '/api/sang/requests/') return { results: REQUESTS }
    // Même forme que le backend (sang/views.py, action « matches »).
    if (path.endsWith('/matches/'))
      return {
        request_id: 1,
        search_radius_km: 20,
        count: 1,
        results: [{ donor_id: 41, blood_group: 'O-', distance_km: 2.4 }],
      }
    if (path.endsWith('/responses/')) {
      return {
        results: [
          {
            id: 7,
            status: 'accepted',
            status_display: 'Engagé',
            donor: { id: 41, full_name: 'Ousmane Gueye', phone_number: '77 555 12 34' },
          },
        ],
      }
    }
    if (path === '/api/sang/stocks/nearby/') return []
    if (['/api/sang/stocks/', '/api/sang/orders/', '/api/sang/drives/'].includes(path)) return { results: [] }
    if (path.endsWith('/technical/')) return { opening_hours: '' }
    throw new Error(`GET inattendu : ${path}`)
  })
  api.post.mockResolvedValue({})
}

async function selectRequest(bloodGroup: string) {
  const table = await screen.findByRole('table', { name: 'Demandes de sang' }, { timeout: 5000 })
  const row = within(table)
    .getAllByRole('row')
    .find((r) => within(r).queryByText(bloodGroup))!
  // Sélection au clavier, comme un régulateur qui navigue sans souris.
  row.focus()
  fireEvent.keyDown(row, { key: 'Enter' })
  return row
}

describe('BloodManagement', () => {
  beforeEach(() => {
    auth.current = { user: { facility: { id: 1 } }, roles: ['blood_manager'], isAdmin: false }
    mockApi()
  })

  it('signale les demandes critiques et en compte les urgences vitales', async () => {
    renderWithProviders(<BloodManagement />)
    const table = await screen.findByRole('table', { name: 'Demandes de sang' }, { timeout: 5000 })
    const critical = within(table)
      .getAllByRole('row')
      .find((r) => within(r).queryByText('O-'))!
    expect(critical).toHaveAttribute('data-severity', 'critical')
    expect(screen.getByText('Mobiliser')).toBeInTheDocument()
  })

  it('ouvre le détail au clavier avec donneurs proches et réponses', async () => {
    renderWithProviders(<BloodManagement />)
    const row = await selectRequest('O-')
    expect(row).toHaveAttribute('aria-selected', 'true')

    const detail = await screen.findByRole('region', { name: 'Demande 100' })
    expect(await within(detail).findByText('Donneur #41')).toBeInTheDocument()
    expect(within(detail).getByText('Ousmane Gueye')).toBeInTheDocument()
  })

  it('trouve des poches en stock à proximité et les commande pour la demande', async () => {
    const cnts = { id: 9, name: 'CNTS Dakar', city: 'Dakar', distance_km: 3.2, total_units: 5 }
    api.get.mockImplementation(async (path: string) => {
      if (path === '/api/sang/requests/') return { results: REQUESTS }
      if (path === '/api/sang/stocks/nearby/')
        return [{ ...cnts, stock_lines: [{ blood_group: 'O-', units_available: 5, units_expiring_soon: 0 }] }]
      if (path.endsWith('/matches/')) return { results: [] }
      return { results: [] }
    })
    api.post.mockResolvedValue({ id: 1, supplier: cnts, units: 2, blood_group: 'O-' })
    renderWithProviders(<BloodManagement />)
    await selectRequest('O-')
    const detail = await screen.findByRole('region', { name: 'Demande 100' })
    expect(await within(detail).findByText('CNTS Dakar')).toBeInTheDocument()
    fireEvent.click(within(detail).getByRole('button', { name: 'Commander' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/sang/orders/',
        expect.objectContaining({ supplier_id: 9, blood_group: 'O-', blood_request_id: 100 }),
      ),
    )
    expect(await within(detail).findByText(/Commande envoyée à CNTS Dakar/)).toBeInTheDocument()
  })

  it('confirme le don d’un donneur engagé', async () => {
    renderWithProviders(<BloodManagement />)
    await selectRequest('O-')
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmer le don' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/sang/requests/100/responses/7/confirm/'))
  })

  it('demande une confirmation avant d’annuler une demande', async () => {
    renderWithProviders(<BloodManagement />)
    await selectRequest('O-')
    fireEvent.click(await screen.findByRole('button', { name: 'Annuler la demande' }))
    expect(api.post).not.toHaveBeenCalled()

    // « Garder » revient en arrière sans rien envoyer.
    fireEvent.click(screen.getByRole('button', { name: 'Garder' }))
    expect(api.post).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Annuler la demande' }))
    fireEvent.click(screen.getByRole('button', { name: "Confirmer l'annulation" }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/sang/requests/100/cancel/'))
  })
})

describe('BloodManagement — administrateur général (supervision)', () => {
  beforeEach(() => {
    auth.current = { user: { id: 1, facility: null }, roles: ['admin'], isAdmin: true }
    mockApi()
  })

  it('voit les demandes et leur détail, en lecture seule, sans aucun bouton d’action', async () => {
    renderWithProviders(<BloodManagement />)
    expect(screen.getByText('Lecture seule — supervision nationale')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Nouvelle demande/ })).not.toBeInTheDocument()

    await selectRequest('O-')
    const detail = await screen.findByRole('region', { name: 'Demande 100' })
    expect(await within(detail).findByText('Ousmane Gueye')).toBeInTheDocument()
    expect(within(detail).queryByRole('button', { name: 'Confirmer le don' })).not.toBeInTheDocument()
    expect(within(detail).queryByRole('button', { name: 'Annuler la demande' })).not.toBeInTheDocument()
    expect(within(detail).queryByRole('button', { name: /Alerter d’autres donneurs/ })).not.toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })
})
