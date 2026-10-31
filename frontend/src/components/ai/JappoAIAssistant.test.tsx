import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/render'
import { ambulance, bloodRequest, capacity, mission } from '@/test/fixtures'
import { JappoAIAssistant } from './JappoAIAssistant'

const api = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/lib/api', () => ({ api }))

const auth = vi.hoisted(() => ({
  user: { id: 1, username: 'admin', first_name: 'Moussa', full_name: 'Moussa Diop' },
  roles: ['admin'] as string[],
}))
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: auth.user, roles: auth.roles }),
}))

const RESPONSES: Record<string, unknown> = {
  '/api/lits/capacities/summary/': [
    capacity({ id: 1, category_display: 'Réanimation', total_beds: 10, occupied_beds: 9, available_beds: 1 }),
    capacity({ id: 2, category: 'surgery', category_display: 'Chirurgie', total_beds: 10, occupied_beds: 4, available_beds: 6 }),
  ],
  '/api/sang/requests/': {
    results: [bloodRequest({ id: 1, urgency: 'critical', blood_group: 'O-', units_remaining: 4 })],
  },
  '/api/ml/predictions/summary/': [{ region: 'dakar', critical_count: 2, warning_count: 1, normal_count: 3 }],
  '/api/ambulances/vehicles/': {
    results: [ambulance({ id: 1, status: 'available' }), ambulance({ id: 2, status: 'on_mission' })],
  },
  '/api/ambulances/missions/': {
    results: [mission({ id: 10, status: 'pending', description: 'Accident VDN' })],
  },
}

describe('JappoAIAssistant', () => {
  beforeEach(() => {
    api.get.mockClear()
    api.get.mockImplementation(async (path: string) => RESPONSES[path])
  })

  it('n’affiche rien quand isOpen vaut false', () => {
    renderWithProviders(<JappoAIAssistant isOpen={false} onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('ouvre le tiroir, présente les suggestions rapides et synthétise les données réelles', async () => {
    const onClose = vi.fn()
    renderWithProviders(<JappoAIAssistant isOpen={true} onClose={onClose} />)

    expect(screen.getByRole('dialog', { name: /Jappo IA/i })).toBeInTheDocument()
    const bedPrompt = await screen.findByRole('button', { name: /Lits & services hospitaliers en tension/i }, { timeout: 2000 })
    expect(screen.getByText(/Bonjour Moussa/i)).toBeInTheDocument()

    fireEvent.click(bedPrompt)

    expect(await screen.findByText(/7 lits libres sur 20/i, {}, { timeout: 2000 })).toBeInTheDocument()
    expect(screen.getByText('Réanimation')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

