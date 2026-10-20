import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { needLabel, pickAlert, UrgentAlert } from '@/features/alerts/UrgentAlert'
import type { NearbyRequest } from '@/types/api'

jest.setTimeout(20_000)

afterEach(async () => {
  await cleanup()
})

const SAFE_AREA = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }

const base: NearbyRequest = {
  id: 1,
  facility: { id: 1, name: 'Hôpital Principal de Dakar', city: 'Plateau, Dakar', region: 'dakar', latitude: 14.66, longitude: -17.43, phone_number: null },
  blood_group: 'O-',
  blood_group_display: 'O-',
  units_remaining: 2,
  urgency: 'critical',
  urgency_display: 'Critique',
  needed_by: null,
  created_at: new Date().toISOString(),
  distance_km: 2.5,
  my_response: null,
}

describe('pickAlert', () => {
  const normal = { ...base, id: 1, urgency: 'normal' as const }
  const critical = { ...base, id: 2 }
  const answered = { ...base, id: 3, my_response: 'accepted' as const }

  it('la plus grave sans réponse d’abord', () => {
    expect(pickAlert([answered, normal, critical], new Set())?.id).toBe(2)
  })

  it('« Plus tard » l’écarte, la suivante prend la place', () => {
    expect(pickAlert([normal, critical], new Set([2]))?.id).toBe(1)
    expect(pickAlert([answered], new Set())).toBeUndefined()
  })
})

describe('needLabel', () => {
  it('critique : besoin immédiat ; sinon l’échéance ou la quantité', () => {
    expect(needLabel(base)).toBe('Besoin immédiat')
    expect(needLabel({ ...base, urgency: 'normal' })).toBe('2 poches à collecter')
  })
})

describe('UrgentAlert', () => {
  const renderAlert = async (props: Partial<React.ComponentProps<typeof UrgentAlert>> = {}) => {
    const handlers = { onGo: jest.fn(), onLater: jest.fn() }
    await render(
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <UrgentAlert request={base} canDonate busy={false} {...handlers} {...props} />
      </SafeAreaProvider>
    )
    return handlers
  }

  it('affiche gravité, établissement, distance et groupe requis', async () => {
    await renderAlert()
    expect(await screen.findByText('URGENCE VITALE')).toBeTruthy()
    expect(screen.getByText('Hôpital Principal de Dakar')).toBeTruthy()
    expect(screen.getByText('Plateau, Dakar • 2,5 km')).toBeTruthy()
    expect(screen.getByText('O−')).toBeTruthy()
    expect(screen.getByText('Besoin immédiat')).toBeTruthy()
  })

  it('« J’y vais maintenant » et « Plus tard » remontent la demande', async () => {
    const { onGo, onLater } = await renderAlert()
    await fireEvent.press(await screen.findByLabelText('J’y vais maintenant'))
    expect(onGo).toHaveBeenCalledWith(base)
    await fireEvent.press(screen.getByText('Plus tard'))
    expect(onLater).toHaveBeenCalledWith(base)
  })

  it('donneur pas éligible : le bouton ouvre la demande au lieu d’accepter', async () => {
    await renderAlert({ canDonate: false })
    expect(await screen.findByLabelText('Voir la demande')).toBeTruthy()
  })
})
