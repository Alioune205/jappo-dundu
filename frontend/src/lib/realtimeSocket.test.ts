import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLOSE_FORBIDDEN, CLOSE_UNAUTHENTICATED, openRealtimeSocket } from './realtimeSocket'

/** WebSocket factice : on pilote ouverture, messages et fermetures à la main. */
class FakeSocket {
  static instances: FakeSocket[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null
  closedWith: number | null = null
  url: string

  constructor(url: string) {
    this.url = url
    FakeSocket.instances.push(this)
  }
  open() {
    this.onopen?.()
  }
  receive(payload: unknown) {
    this.onmessage?.({ data: typeof payload === 'string' ? payload : JSON.stringify(payload) })
  }
  drop(code = 1006) {
    this.onclose?.({ code })
  }
  close(code: number) {
    this.closedWith = code
    this.onclose?.({ code })
  }
}

const location = { protocol: 'https:', host: 'regulation.example.sn' }

/** Laisse s'exécuter les promesses en attente (obtention du ticket) et les minuteries. */
const advance = (ms = 0) => vi.advanceTimersByTimeAsync(ms)

async function open(overrides: Partial<Parameters<typeof openRealtimeSocket>[0]> = {}) {
  const onMessage = vi.fn()
  const onStatusChange = vi.fn()
  let counter = 0
  const getTicket = vi.fn(async () => `ticket-${++counter}`)
  const socket = openRealtimeSocket({
    path: '/ws/alerts/',
    getTicket,
    onMessage,
    onStatusChange,
    minDelay: 1000,
    maxDelay: 8000,
    createSocket: (url) => new FakeSocket(url) as unknown as WebSocket,
    location,
    ...overrides,
  })
  await advance()
  return { socket, onMessage, onStatusChange, getTicket }
}

const last = () => FakeSocket.instances[FakeSocket.instances.length - 1]

describe('openRealtimeSocket', () => {
  beforeEach(() => {
    FakeSocket.instances = []
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('se connecte en wss avec le périmètre et un ticket, jamais le JWT', async () => {
    await open({ params: { hospital_id: 7, region: undefined } })
    expect(last().url).toBe('wss://regulation.example.sn/ws/alerts/?hospital_id=7&ticket=ticket-1')
    expect(last().url).not.toContain('token=')
  })

  it('signale la connexion et transmet les messages valides uniquement', async () => {
    const { onMessage, onStatusChange } = await open()
    last().open()
    expect(onStatusChange).toHaveBeenLastCalledWith(true)

    last().receive({ type: 'bed_alert', data: { event: 'bed_capacity_saturated' } })
    last().receive('pas du json')
    last().receive({ sans: 'type' })
    expect(onMessage).toHaveBeenCalledTimes(1)
    expect(onMessage.mock.calls[0][0].type).toBe('bed_alert')
  })

  it('se reconnecte avec une attente croissante et un ticket neuf à chaque tentative', async () => {
    const { onStatusChange } = await open()
    last().open()
    last().drop()
    expect(onStatusChange).toHaveBeenLastCalledWith(false)

    await advance(999)
    expect(FakeSocket.instances).toHaveLength(1)
    await advance(1)
    expect(FakeSocket.instances).toHaveLength(2)
    expect(last().url).toContain('ticket=ticket-2')

    // Deuxième échec sans ouverture : l'attente double.
    last().drop()
    await advance(1999)
    expect(FakeSocket.instances).toHaveLength(2)
    await advance(1)
    expect(FakeSocket.instances).toHaveLength(3)
  })

  it('réessaie après un refus d’authentification', async () => {
    await open()
    last().drop(CLOSE_UNAUTHENTICATED)
    await advance(1000)
    expect(FakeSocket.instances).toHaveLength(2)
  })

  it('abandonne sur un refus d’autorisation définitif', async () => {
    await open()
    last().drop(CLOSE_FORBIDDEN)
    await advance(60_000)
    expect(FakeSocket.instances).toHaveLength(1)
  })

  it('ne se reconnecte jamais après une fermeture demandée, ni ne signale de déconnexion', async () => {
    const { socket, onStatusChange } = await open()
    last().open()
    onStatusChange.mockClear()

    socket.close()
    expect(last().closedWith).toBe(1000)
    await advance(60_000)
    expect(FakeSocket.instances).toHaveLength(1)
    expect(onStatusChange).not.toHaveBeenCalled()
  })

  it('annule une reconnexion programmée quand on ferme', async () => {
    const { socket } = await open()
    last().drop()
    socket.close()
    await advance(60_000)
    expect(FakeSocket.instances).toHaveLength(1)
  })

  it('n’ouvre rien si la fermeture survient pendant l’obtention du ticket', async () => {
    let release: (ticket: string) => void = () => {}
    const socket = openRealtimeSocket({
      path: '/ws/alerts/',
      getTicket: () => new Promise((resolve) => (release = resolve)),
      onMessage: vi.fn(),
      createSocket: (url) => new FakeSocket(url) as unknown as WebSocket,
      location,
    })
    socket.close()
    release('trop-tard')
    await advance(60_000)
    expect(FakeSocket.instances).toHaveLength(0)
  })

  it('patiente sans boucle serrée tant qu’aucun ticket n’est disponible', async () => {
    const getTicket = vi.fn(async () => null)
    await open({ getTicket })
    expect(FakeSocket.instances).toHaveLength(0)
    await advance(1000)
    expect(getTicket).toHaveBeenCalledTimes(2)
    await advance(2000)
    expect(getTicket).toHaveBeenCalledTimes(3)
    expect(FakeSocket.instances).toHaveLength(0)
  })
})
