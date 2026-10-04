import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { RealtimeProvider, useRealtime } from './RealtimeContext'

const auth = vi.hoisted(() => ({
  value: {
    isAuthenticated: true,
    user: { id: 1, role: 'admin', roles: ['admin'], facility: { id: 9 } } as unknown,
  },
}))
vi.mock('./AuthContext', () => ({ useAuth: () => auth.value }))
vi.mock('@/lib/api', () => ({ api: { post: vi.fn(async () => ({ ticket: 'ticket-ws' })) } }))

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null
  closed = false
  url: string
  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }
  close() {
    this.closed = true
    this.onclose?.({ code: 1000 })
  }
}

const socketFor = (path: string) => FakeWebSocket.instances.filter((s) => s.url.includes(path)).at(-1)!
const send = (socket: FakeWebSocket, payload: unknown) =>
  act(() => socket.onmessage?.({ data: JSON.stringify(payload) }))

/** Laisse les demandes de ticket aboutir et les sockets s'ouvrir. */
const flush = () => act(() => vi.advanceTimersByTimeAsync(0))

const received: string[] = []
const Probe: React.FC = () => {
  const { isConnected, status, alerts, subscribe } = useRealtime()
  React.useEffect(() => subscribe('bed_capacity_saturated', (event) => received.push(event)), [subscribe])
  return (
    <div>
      <span data-testid="status">{isConnected ? 'connecté' : 'hors ligne'}</span>
      <span data-testid="phase">{status}</span>
      <ul>
        {alerts.map((a) => (
          <li key={a.id}>{a.title}</li>
        ))}
      </ul>
    </div>
  )
}

describe('RealtimeProvider', () => {
  beforeEach(() => {
    FakeWebSocket.instances = []
    received.length = 0
    auth.value = {
      isAuthenticated: true,
      user: { id: 1, role: 'admin', roles: ['admin'], facility: { id: 9 } },
    }
    vi.stubGlobal('WebSocket', FakeWebSocket)
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('ouvre les flux alertes et tableau de bord (périmètre hôpital) pour un administrateur', async () => {
    render(
      <RealtimeProvider>
        <Probe />
      </RealtimeProvider>
    )
    await flush()
    expect(socketFor('/ws/alerts/').url).toContain('ticket=ticket-ws')
    expect(socketFor('/ws/alerts/').url).not.toContain('token=')
    expect(socketFor('/ws/dashboard/').url).toContain('hospital_id=9')
  })

  it('signale la connexion, diffuse les événements et crée les alertes', async () => {
    render(
      <RealtimeProvider>
        <Probe />
      </RealtimeProvider>
    )
    await flush()
    const alerts = socketFor('/ws/alerts/')
    act(() => alerts.onopen?.())
    expect(screen.getByTestId('status')).toHaveTextContent('connecté')

    send(alerts, { type: 'connection_established', data: {} })
    send(alerts, {
      type: 'bed_alert',
      id: 'a1',
      data: { event: 'bed_capacity_saturated', available_beds: 0, facility: { name: 'CHU de Fann' } },
    })
    expect(received).toEqual(['bed_capacity_saturated'])
    expect(screen.getByText('Service saturé')).toBeInTheDocument()

    // Le flux tableau de bord diffuse l'événement sans créer d'alerte en double.
    send(socketFor('/ws/dashboard/'), { type: 'kpi_update', data: { event: 'bed_capacity_saturated' } })
    expect(received).toHaveLength(2)
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })

  it('affiche « hors ligne » quand le flux tombe, puis se reconnecte seul', async () => {
    render(
      <RealtimeProvider>
        <Probe />
      </RealtimeProvider>
    )
    await flush()
    expect(screen.getByTestId('phase')).toHaveTextContent('connecting')
    const first = socketFor('/ws/alerts/')
    act(() => first.onopen?.())
    expect(screen.getByTestId('phase')).toHaveTextContent('open')
    act(() => first.onclose?.({ code: 1006 }))
    expect(screen.getByTestId('status')).toHaveTextContent('hors ligne')
    // Coupure après une connexion réussie : état « interrompu » (mode dégradé).
    expect(screen.getByTestId('phase')).toHaveTextContent('interrupted')

    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(socketFor('/ws/alerts/')).not.toBe(first)
    act(() => socketFor('/ws/alerts/').onopen?.())
    expect(screen.getByTestId('phase')).toHaveTextContent('open')
  })

  it('ferme tout à la déconnexion, sans reconnexion fantôme', async () => {
    const { rerender } = render(
      <RealtimeProvider>
        <Probe />
      </RealtimeProvider>
    )
    await flush()
    const opened = [...FakeWebSocket.instances]
    expect(opened).toHaveLength(2)
    auth.value = { isAuthenticated: false, user: null }
    rerender(
      <RealtimeProvider>
        <Probe />
      </RealtimeProvider>
    )
    expect(opened.every((s) => s.closed)).toBe(true)
    await act(() => vi.advanceTimersByTimeAsync(60_000))
    expect(FakeWebSocket.instances).toHaveLength(opened.length)
    expect(screen.getByTestId('status')).toHaveTextContent('hors ligne')
  })

  it('n’ouvre pas le flux tableau de bord pour un rôle non habilité', async () => {
    auth.value = { isAuthenticated: true, user: { id: 2, role: 'donor', roles: ['donor'], facility: null } }
    render(
      <RealtimeProvider>
        <Probe />
      </RealtimeProvider>
    )
    await flush()
    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(FakeWebSocket.instances.map((s) => s.url).some((u) => u.includes('/ws/dashboard/'))).toBe(false)
  })
})
