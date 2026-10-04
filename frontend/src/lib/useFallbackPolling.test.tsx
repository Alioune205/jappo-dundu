import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { RealtimeStatus } from '@/context/RealtimeContext'
import { FALLBACK_POLL_MS, useFallbackPolling } from './useFallbackPolling'

const realtime = vi.hoisted(() => ({ status: 'open' as RealtimeStatus }))
vi.mock('@/context/RealtimeContext', () => ({ useRealtime: () => realtime }))

function setup() {
  const client = new QueryClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue()
  const Probe = () => {
    useFallbackPolling()
    return null
  }
  const ui = () => (
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>
  )
  const view = render(ui())
  return { invalidate, rerender: () => view.rerender(ui()), unmount: view.unmount }
}

describe('useFallbackPolling', () => {
  beforeEach(() => {
    realtime.status = 'open'
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('ne relit rien tant que le flux temps réel fonctionne', () => {
    const { invalidate } = setup()
    vi.advanceTimersByTime(FALLBACK_POLL_MS * 3)
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('relit les données affichées à intervalle régulier pendant une coupure', () => {
    realtime.status = 'interrupted'
    const { invalidate } = setup()
    vi.advanceTimersByTime(FALLBACK_POLL_MS * 2)
    expect(invalidate).toHaveBeenCalledTimes(2)
    expect(invalidate).toHaveBeenCalledWith({ refetchType: 'active' })
  })

  it('s’arrête dès que le flux revient', () => {
    realtime.status = 'interrupted'
    const { invalidate, rerender } = setup()
    vi.advanceTimersByTime(FALLBACK_POLL_MS)
    realtime.status = 'open'
    rerender()
    vi.advanceTimersByTime(FALLBACK_POLL_MS * 3)
    expect(invalidate).toHaveBeenCalledTimes(1)
  })

  it('ne relit pas pendant la toute première connexion', () => {
    realtime.status = 'connecting'
    const { invalidate } = setup()
    vi.advanceTimersByTime(FALLBACK_POLL_MS * 2)
    expect(invalidate).not.toHaveBeenCalled()
  })
})
