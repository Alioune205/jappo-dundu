import { describe, expect, it } from 'vitest'
import { capacity, bloodRequest, mission } from '@/test/fixtures'
import { computeBedStats, filterCapacities, occupancyLevel } from './beds/bedStats'
import { computeBloodStats, requestSeverity } from './blood/bloodStats'
import { isActiveMission, missionSeverity, responseTrend } from './ambulances/missionUtils'

describe('Lits — règles de calcul', () => {
  it('classe l’occupation : saturé (0 lit), tension (> 85 %), normal', () => {
    expect(occupancyLevel({ available_beds: 0, occupancy_rate: 1 })).toBe('saturated')
    expect(occupancyLevel({ available_beds: 1, occupancy_rate: 0.9 })).toBe('high')
    expect(occupancyLevel({ available_beds: 4, occupancy_rate: 0.6 })).toBe('normal')
  })

  it('agrège les lits, la réanimation, les urgences et les services saturés', () => {
    const stats = computeBedStats([
      capacity({ id: 1, category: 'emergency', total_beds: 10, occupied_beds: 7 }),
      capacity({ id: 2, category: 'intensive_care', total_beds: 4, occupied_beds: 4 }),
      capacity({ id: 3, category: 'surgery', total_beds: 6, occupied_beds: 1 }),
    ])
    expect(stats).toEqual({
      totalBeds: 20,
      occupiedBeds: 12,
      availableBeds: 8,
      globalRate: 60,
      reaBeds: 0,
      urgBeds: 3,
      saturatedCount: 1,
    })
  })

  it('n’affiche pas de taux absurde sans aucun lit déclaré', () => {
    expect(computeBedStats([]).globalRate).toBe(0)
  })

  it('filtre par établissement, ville ou service, sans tenir compte de la casse', () => {
    const list = [
      capacity({ id: 1, category_display: 'Urgences' }),
      capacity({ id: 2, category_display: 'Pédiatrie', facility: { ...capacity().facility, name: 'CHU de Fann', city: 'Fann' } }),
    ]
    expect(filterCapacities(list, 'FANN').map((c) => c.id)).toEqual([2])
    expect(filterCapacities(list, 'urgences').map((c) => c.id)).toEqual([1])
    expect(filterCapacities(list, '   ')).toHaveLength(2)
  })
})

describe('Sang — règles de calcul', () => {
  it('ne compte que les demandes ouvertes dans les urgences et les poches manquantes', () => {
    const stats = computeBloodStats([
      bloodRequest({ id: 1, urgency: 'critical', units_remaining: 3 }),
      bloodRequest({ id: 2, urgency: 'urgent', units_remaining: 2 }),
      bloodRequest({ id: 3, urgency: 'critical', status: 'fulfilled', units_remaining: 0 }),
      bloodRequest({ id: 4, urgency: 'critical', status: 'cancelled', units_remaining: 5 }),
    ])
    expect(stats).toEqual({ totalOpen: 2, criticalCount: 1, totalUnitsNeeded: 5, fulfilledCount: 1 })
  })

  it('ne signale que les demandes encore ouvertes', () => {
    expect(requestSeverity({ status: 'open', urgency: 'critical' })).toBe('critical')
    expect(requestSeverity({ status: 'open', urgency: 'urgent' })).toBe('warning')
    expect(requestSeverity({ status: 'open', urgency: 'normal' })).toBeUndefined()
    expect(requestSeverity({ status: 'fulfilled', urgency: 'critical' })).toBeUndefined()
  })
})

describe('SAMU — règles de calcul', () => {
  it('distingue les missions actives des missions terminées ou annulées', () => {
    expect(isActiveMission({ status: 'transporting' })).toBe(true)
    expect(isActiveMission({ status: 'completed' })).toBe(false)
    expect(isActiveMission({ status: 'cancelled' })).toBe(false)
  })

  it('ne signale que les missions en cours', () => {
    expect(missionSeverity(mission({ status: 'pending', priority: 'critical' }))).toBe('critical')
    expect(missionSeverity(mission({ status: 'completed', priority: 'critical' }))).toBeUndefined()
  })

  it('compare le délai réel à l’objectif, sans inventer de chiffre', () => {
    expect(responseTrend(null)).toBeUndefined()
    expect(responseTrend(17.5)).toBe('Objectif 20 min tenu')
    expect(responseTrend(26)).toBe('Au-delà de 20 min')
  })
})
