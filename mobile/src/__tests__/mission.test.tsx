import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { DestinationSheet } from '@/features/mission/DestinationSheet'
import { currentTarget, nextAction, outcome } from '@/features/mission/format'
import { MissionPanel } from '@/features/mission/MissionPanel'
import { api } from '@/lib/api'
import { isDriver, useAdvanceMission, type DriverMissions } from '@/lib/missions'
import { QK } from '@/lib/queries'
import type { Mission } from '@/types/api'

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api')
  return { ...actual, api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn() } }
})

jest.setTimeout(20_000)

afterEach(async () => {
  await cleanup()
  jest.clearAllMocks()
})

const SAFE_AREA = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }

const fann = { id: 7, name: 'CHU de Fann', city: 'Dakar', region: 'dakar' as const, latitude: 14.69, longitude: -17.46, phone_number: '+221338691818' }

function mission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 12,
    priority: 'critical',
    priority_display: 'Critique',
    status: 'assigned',
    status_display: 'Ambulance en route',
    description: 'Accident de la route',
    pickup_address: 'Rond-point de la Patte d’Oie',
    pickup_latitude: 14.75,
    pickup_longitude: -17.43,
    region: 'dakar',
    region_display: 'Dakar',
    caller_phone: '+221771234567',
    ambulance: null,
    destination: null,
    cancellation_reason: '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    assigned_at: new Date().toISOString(),
    on_site_at: null,
    transporting_at: null,
    completed_at: null,
    cancelled_at: null,
    response_time_minutes: null,
    ...overrides,
  }
}

function wrap(ui: React.ReactElement, client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })) {
  return {
    client,
    ui: (
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <QueryClientProvider client={client}>{ui}</QueryClientProvider>
      </SafeAreaProvider>
    ),
  }
}

describe('étapes de la mission', () => {
  it('propose un seul geste par étape, et le choix de l’hôpital avant le transport', () => {
    expect(nextAction(mission())).toMatchObject({ status: 'on_site', needsDestination: false })
    expect(nextAction(mission({ status: 'on_site' }))).toMatchObject({ status: 'transporting', needsDestination: true })
    expect(nextAction(mission({ status: 'on_site', destination: fann }))).toMatchObject({ needsDestination: false })
    expect(nextAction(mission({ status: 'transporting', destination: fann }))).toMatchObject({ status: 'completed' })
    expect(nextAction(mission({ status: 'completed' }))).toBeNull()
  })

  it('mène au patient, puis à l’hôpital une fois le transport commencé', () => {
    expect(currentTarget(mission())).toMatchObject({ kind: 'pickup', latitude: 14.75, phone: '+221771234567' })
    expect(currentTarget(mission({ status: 'transporting', destination: fann }))).toMatchObject({
      kind: 'destination',
      name: 'CHU de Fann',
      phone: '+221338691818',
    })
    expect(currentTarget(mission({ status: 'cancelled' }))).toBeNull()
  })

  it('résume l’issue d’une mission passée', () => {
    expect(outcome(mission({ status: 'completed', destination: fann, response_time_minutes: 11.6 }))).toBe(
      'Remis à CHU de Fann · arrivée en 12 min'
    )
    expect(outcome(mission({ status: 'cancelled' }))).toBe('Annulée par la régulation')
  })

  it('reconnaît le rôle ambulancier', () => {
    expect(isDriver(['ambulance_driver'])).toBe(true)
    expect(isDriver(['donor'])).toBe(false)
    expect(isDriver(undefined)).toBe(false)
  })
})

describe('MissionPanel', () => {
  const props = { now: Date.now(), busy: false, error: null, onAdvance: jest.fn(), onChooseDestination: jest.fn() }

  it('« Je suis sur place » fait avancer la mission', async () => {
    const { ui } = wrap(<MissionPanel {...props} mission={mission()} />)
    await render(ui)
    expect(screen.getByText('Rond-point de la Patte d’Oie')).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('Je suis sur place'))
    expect(props.onAdvance).toHaveBeenCalledWith('on_site')
  })

  it('sur place sans destination : le transport ouvre d’abord le choix de l’hôpital', async () => {
    const { ui } = wrap(<MissionPanel {...props} mission={mission({ status: 'on_site' })} />)
    await render(ui)
    await fireEvent.press(screen.getByLabelText('Choisir l’hôpital et transporter'))
    expect(props.onChooseDestination).toHaveBeenCalled()
    expect(props.onAdvance).not.toHaveBeenCalled()
  })

  it('terminer sans transport demande une confirmation', async () => {
    const { ui } = wrap(<MissionPanel {...props} mission={mission({ status: 'on_site' })} />)
    await render(ui)
    await fireEvent.press(screen.getByText('Terminer sur place (sans transport)'))
    expect(props.onAdvance).not.toHaveBeenCalled()
    await fireEvent.press(screen.getByText('Toucher à nouveau pour terminer sans transport'))
    expect(props.onAdvance).toHaveBeenCalledWith('completed')
  })
})

describe('DestinationSheet', () => {
  it('liste les hôpitaux avec lits libres et transmet le choix', async () => {
    ;(api.get as jest.Mock).mockResolvedValue({
      origin: { latitude: 14.75, longitude: -17.43 },
      category: 'emergency',
      results: [{ ...fann, facility_type: 'hospital', facility_type_display: 'Hôpital', region_display: 'Dakar', distance_km: 4.2, available_beds: 3 }],
    })
    const onPick = jest.fn()
    const { ui } = wrap(<DestinationSheet missionId={12} visible busy={false} error={null} onPick={onPick} onClose={jest.fn()} />)
    await render(ui)

    await fireEvent.press(await screen.findByLabelText('CHU de Fann, 3 lits libres'))
    expect(api.get).toHaveBeenCalledWith('/api/ambulances/missions/12/destinations/', expect.objectContaining({ category: 'emergency' }))
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }))
  })
})

describe('useAdvanceMission', () => {
  function Probe({ onReady }: { onReady: (advance: ReturnType<typeof useAdvanceMission>) => void }) {
    onReady(useAdvanceMission())
    return null
  }

  it('envoie la destination avec le transport, puis libère la mission terminée', async () => {
    let advance!: ReturnType<typeof useAdvanceMission>
    const { client, ui } = wrap(<Probe onReady={(value) => (advance = value)} />)
    client.setQueryData<DriverMissions>(QK.missions, { active: mission({ status: 'on_site' }), recent: [] })
    await render(ui)

    ;(api.post as jest.Mock).mockResolvedValueOnce(mission({ status: 'transporting', destination: fann }))
    await act(async () => {
      await advance.mutateAsync({ id: 12, status: 'transporting', destinationId: 7 })
    })
    expect(api.post).toHaveBeenCalledWith('/api/ambulances/missions/12/status/', { status: 'transporting', destination_id: 7 })
    expect(client.getQueryData<DriverMissions>(QK.missions)?.active?.status).toBe('transporting')

    ;(api.post as jest.Mock).mockResolvedValueOnce(mission({ status: 'completed', destination: fann }))
    await act(async () => {
      await advance.mutateAsync({ id: 12, status: 'completed' })
    })
    expect(api.post).toHaveBeenLastCalledWith('/api/ambulances/missions/12/status/', { status: 'completed' })
    await waitFor(() => expect(client.getQueryData<DriverMissions>(QK.missions)?.active).toBeNull())
    expect(client.getQueryData<DriverMissions>(QK.missions)?.recent[0].status).toBe('completed')
  })
})
