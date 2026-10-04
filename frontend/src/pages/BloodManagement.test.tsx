import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/render'
import { bloodRequest } from '@/test/fixtures'
import { BloodManagement } from './BloodManagement'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('@/lib/api', () => ({ api }))
vi.mock('@/context/RealtimeContext', () => ({ useRealtime: () => ({ subscribe: () => () => {} }) }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { facility: { id: 1 } } }) }))

const REQUESTS = [
  bloodRequest({ id: 100, blood_group: 'O-', urgency: 'critical' }),
  bloodRequest({ id: 101, blood_group: 'A+', urgency: 'normal', urgency_display: 'Normale' }),
]

function mockApi() {
  api.get.mockImplementation(async (path: string) => {
    if (path === '/api/sang/requests/') return { results: REQUESTS }
    if (path.endsWith('/matches/')) return [{ donor_id: 41, blood_group: 'O-', distance_km: 2.4 }]
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
    throw new Error(`GET inattendu : ${path}`)
  })
  api.post.mockResolvedValue({})
}

async function selectRequest(bloodGroup: string) {
  const table = await screen.findByRole('table')
  const row = within(table)
    .getAllByRole('row')
    .find((r) => within(r).queryByText(bloodGroup))!
  // Sélection au clavier, comme un régulateur qui navigue sans souris.
  row.focus()
  fireEvent.keyDown(row, { key: 'Enter' })
  return row
}

describe('BloodManagement', () => {
  beforeEach(mockApi)

  it('signale les demandes critiques et en compte les urgences vitales', async () => {
    renderWithProviders(<BloodManagement />)
    const table = await screen.findByRole('table')
    const critical = within(table).getAllByRole('row').find((r) => within(r).queryByText('O-'))!
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
