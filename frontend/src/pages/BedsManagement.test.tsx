import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/render'
import { capacity } from '@/test/fixtures'
import { BedsManagement } from './BedsManagement'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }))
vi.mock('@/lib/api', () => ({ api }))
vi.mock('@/context/RealtimeContext', () => ({ useRealtime: () => ({ subscribe: () => () => {} }) }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null }) }))

const CAPACITIES = [
  capacity({ id: 1, category: 'emergency', category_display: 'Urgences', total_beds: 10, occupied_beds: 6 }),
  capacity({
    id: 2,
    category: 'intensive_care',
    category_display: 'Réanimation',
    total_beds: 4,
    occupied_beds: 4,
    facility: { ...capacity().facility, name: 'CHU de Fann', city: 'Fann' },
  }),
]

/** Attend le tableau des services, puis renvoie la ligne d'un service. */
async function findRow(service: string) {
  const table = await screen.findByRole('table')
  const row = within(table)
    .getAllByRole('row')
    .find((r) => within(r).queryByText(service))
  if (!row) throw new Error(`Ligne « ${service} » introuvable`)
  return row
}

describe('BedsManagement', () => {
  beforeEach(() => {
    api.get.mockResolvedValue({ results: CAPACITIES })
    api.post.mockResolvedValue({})
    api.patch.mockResolvedValue({})
  })

  it('affiche les services, les indicateurs et signale la saturation', async () => {
    renderWithProviders(<BedsManagement />)
    const rea = await findRow('Réanimation')
    expect(rea).toHaveAttribute('data-severity', 'critical')
    expect(within(rea).getByText('Saturé')).toBeInTheDocument()
    // Aucun lit libre : l'admission est impossible dans ce service.
    expect(within(rea).getByRole('button', { name: /Entrée/ })).toBeDisabled()
    expect(screen.getByText('Aucun lit')).toBeInTheDocument()
  })

  it('filtre localement par établissement ou ville', async () => {
    renderWithProviders(<BedsManagement />)
    await findRow('Urgences')
    fireEvent.change(screen.getByLabelText('Recherche'), { target: { value: 'fann' } })
    const table = screen.getByRole('table')
    expect(within(table).queryByText('Urgences')).not.toBeInTheDocument()
    expect(within(table).getByText('Réanimation')).toBeInTheDocument()
  })

  it('enregistre une admission sur le bon service', async () => {
    renderWithProviders(<BedsManagement />)
    fireEvent.click(within(await findRow('Urgences')).getByRole('button', { name: /Entrée/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/lits/capacities/1/admit/'))
  })

  it('affiche l’erreur du serveur quand une admission échoue', async () => {
    api.post.mockRejectedValueOnce(new Error('Service complet : plus aucun lit disponible.'))
    renderWithProviders(<BedsManagement />)
    fireEvent.click(within(await findRow('Urgences')).getByRole('button', { name: /Entrée/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Service complet')
  })

  it('refuse un ajustement incohérent puis enregistre une capacité valide', async () => {
    renderWithProviders(<BedsManagement />)
    fireEvent.click(within(await findRow('Urgences')).getByRole('button', { name: /Ajuster la capacité/ }))

    const occupied = await screen.findByLabelText('Lits occupés')
    fireEvent.change(occupied, { target: { value: '12' } })
    expect(screen.getByText('Ne peut pas dépasser le total de lits.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()

    fireEvent.change(occupied, { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/lits/capacities/1/', { total_beds: 10, occupied_beds: 8 })
    )
  })
})
