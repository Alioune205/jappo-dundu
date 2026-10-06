import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@/test/render'
import { DonationLookupPanel } from './DonationLookupPanel'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('@/lib/api', () => ({ api }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { facility: { id: 4 } } }) }))

const search = (value: string) => {
  fireEvent.change(screen.getByLabelText('Carte ou téléphone'), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))
}

describe('DonationLookupPanel', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.get.mockResolvedValue({ id: 7, full_name: 'Awa Ndiaye', blood_group: 'O+', is_eligible: true })
  })

  it('cherche par carte quand on scanne le QR code du donneur', async () => {
    renderWithProviders(<DonationLookupPanel />)
    search('JAPPODUNDU:DONNEUR:JD-CDKK-B3TT')
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/api/sang/donors/lookup/', { card_code: 'JAPPODUNDU:DONNEUR:JD-CDKK-B3TT' })
    )
    expect(await screen.findByText('Awa Ndiaye')).toBeInTheDocument()
  })

  it('cherche par téléphone sinon', async () => {
    renderWithProviders(<DonationLookupPanel />)
    search('77 888 99 00')
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/api/sang/donors/lookup/', { phone_number: '77 888 99 00' })
    )
  })
})
