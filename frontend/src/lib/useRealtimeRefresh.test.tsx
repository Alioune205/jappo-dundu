import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useRealtimeRefresh, type RefreshRule } from './useRealtimeRefresh'
import { useAmbulancePositions } from './useAmbulancePositions'

type Listener = (event: string, data: Record<string, unknown>) => void
const listeners = new Map<string, Set<Listener>>()

vi.mock('@/context/RealtimeContext', () => ({
  useRealtime: () => ({
    subscribe: (event: string, listener: Listener) => {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)!.add(listener)
      return () => listeners.get(event)?.delete(listener)
    },
  }),
}))

const emit = (event: string, data: Record<string, unknown> = {}) =>
  listeners.get(event)?.forEach((listener) => listener(event, data))

function setup(rules: RefreshRule[]) {
  const client = new QueryClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue()
  const Probe = () => {
    useRealtimeRefresh(rules)
    return null
  }
  const view = render(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>
  )
  return { client, invalidate, view }
}

describe('useRealtimeRefresh', () => {
  beforeEach(() => {
    listeners.clear()
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('regroupe une rafale d’événements en un seul rechargement par requête', () => {
    const { invalidate } = setup([
      { events: ['bed_capacity_updated', 'bed_capacity_saturated'], queryKeys: [['bed-capacities'], ['beds-summary']] },
    ])

    for (let i = 0; i < 25; i++) emit('bed_capacity_updated')
    emit('bed_capacity_saturated')
    expect(invalidate).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1000)
    expect(invalidate).toHaveBeenCalledTimes(2)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['bed-capacities'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['beds-summary'] })
  })

  it('n’invalide que les requêtes concernées par l’événement reçu', () => {
    const { invalidate } = setup([
      { events: ['mission_created'], queryKeys: [['missions-active']] },
      { events: ['prediction_update'], queryKeys: [['predictions-summary']] },
    ])
    emit('mission_created')
    emit('événement_inconnu')
    vi.advanceTimersByTime(1000)
    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['missions-active'] })
  })

  it('se désabonne et annule le rechargement en attente au démontage', () => {
    const { invalidate, view } = setup([{ events: ['mission_created'], queryKeys: [['missions-active']] }])
    emit('mission_created')
    view.unmount()
    vi.advanceTimersByTime(5000)
    expect(invalidate).not.toHaveBeenCalled()
    expect(listeners.get('mission_created')?.size ?? 0).toBe(0)
  })
})

describe('useAmbulancePositions', () => {
  beforeEach(() => listeners.clear())

  it('met à jour la position dans le cache sans requête réseau', () => {
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    client.setQueryData(['ambulances-list'], [
      { id: 1, latitude: 14.6, longitude: -17.4, location_updated_at: null },
      { id: 2, latitude: 14.7, longitude: -17.5, location_updated_at: null },
    ])
    const Probe = () => {
      useAmbulancePositions(['ambulances-list'])
      return null
    }
    render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>
    )

    emit('ambulance_position', { ambulance_id: 2, latitude: 14.75, longitude: -17.45, location_updated_at: '2026-10-04T08:00:00Z' })
    emit('ambulance_position', { ambulance_id: 'invalide' })

    expect(client.getQueryData(['ambulances-list'])).toEqual([
      { id: 1, latitude: 14.6, longitude: -17.4, location_updated_at: null },
      { id: 2, latitude: 14.75, longitude: -17.45, location_updated_at: '2026-10-04T08:00:00Z' },
    ])
    expect(invalidate).not.toHaveBeenCalled()
  })
})
