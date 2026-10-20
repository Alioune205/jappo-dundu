import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@/test/render'
import { facility, mission } from '@/test/fixtures'
import type { Mission, Role } from '@/types/api'
import { DispatchModal } from './DispatchModal'
import { SosAlerts } from './SosAlerts'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }))
vi.mock('@/lib/api', () => ({ api }))
const auth = vi.hoisted(() => ({ current: { user: null as unknown, roles: [] as Role[], isAdmin: false } }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth.current }))

const sos = (overrides: Partial<Mission> = {}) =>
  mission({
    id: 31,
    source: 'sos',
    source_display: "Alerte SOS d'un citoyen",
    priority: 'urgent',
    priority_display: 'Urgente',
    description: 'SOS — Accident',
    pickup_address: 'Devant la pharmacie',
    caller_phone: '+221771112233',
    created_by: { id: 8, full_name: 'Fatou Ndiaye' },
    created_at: new Date().toISOString(),
    ...overrides,
  })

describe('Alertes SOS des citoyens', () => {
  beforeEach(() => {
    auth.current = { user: { id: 3, facility: facility() }, roles: ['ambulance_manager'], isAdmin: false }
    api.patch.mockResolvedValue({})
  })

  it('n’affiche que les SOS en attente, avec la personne, le lieu et son téléphone', () => {
    const onDispatch = vi.fn()
    renderWithProviders(
      <SosAlerts
        missions={[sos(), sos({ id: 32, status: 'assigned' }), mission({ id: 40 })]}
        onDispatch={onDispatch}
      />
    )
    expect(screen.getByText('Alerte SOS à traiter')).toBeInTheDocument()
    expect(screen.getByText(/Fatou Ndiaye/)).toBeInTheDocument()
    expect(screen.getByText('+221 77 111 22 33')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: "Traiter l'alerte SOS 31" }))
    expect(onDispatch).toHaveBeenCalledWith(expect.objectContaining({ id: 31 }))
    expect(screen.queryByRole('button', { name: "Traiter l'alerte SOS 32" })).toBeNull()
  })

  it('rien quand aucun SOS n’attend', () => {
    const { container } = renderWithProviders(<SosAlerts missions={[mission()]} onDispatch={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('le régulateur qualifie l’alerte après avoir rappelé la personne', async () => {
    const alert = sos()
    api.get.mockImplementation((url: string) =>
      Promise.resolve(url === '/api/ambulances/missions/31/' ? alert : url.endsWith('nearest/') ? [] : { results: [] })
    )
    renderWithProviders(<DispatchModal mission={alert} onClose={vi.fn()} />)

    expect(screen.getByText(/Rappelez la personne avant d’envoyer une ambulance/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Gravité'), { target: { value: 'critical' } })
    fireEvent.change(screen.getByLabelText('Motif'), { target: { value: 'Piéton renversé, inconscient' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/ambulances/missions/31/', {
        priority: 'critical',
        description: 'Piéton renversé, inconscient',
        pickup_address: 'Devant la pharmacie',
      })
    )
    expect(screen.getByRole('button', { name: 'Fausse alerte ou sans suite…' })).toBeInTheDocument()
  })
})
