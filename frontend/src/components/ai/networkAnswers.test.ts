import { describe, expect, it } from 'vitest'
import { ambulance, bloodRequest, capacity, facility } from '@/test/fixtures'
import { answerNetworkQuestion, findBloodGroup, findCategory, findFacility } from './networkAnswers'

const principal = facility({ id: 1, name: 'Hôpital Principal de Dakar' })
const fann = facility({ id: 2, name: 'Centre Hospitalier Universitaire de Fann' })
const samu = facility({ id: 3, name: 'SAMU National 15', facility_type: 'ambulance_service' })

const ctx = {
  facilities: [principal, fann, samu],
  capacities: [
    capacity({ id: 1, facility: principal, category: 'intensive_care', category_display: 'Réanimation', total_beds: 20, occupied_beds: 20 }),
    capacity({ id: 2, facility: fann, category: 'intensive_care', category_display: 'Réanimation', total_beds: 16, occupied_beds: 12 }),
    capacity({ id: 3, facility: fann, category: 'emergency', category_display: 'Urgences', total_beds: 30, occupied_beds: 26 }),
  ],
  bloodRequests: [bloodRequest({ id: 1, facility: principal, blood_group: 'O-', urgency: 'critical', units_remaining: 3 })],
  ambulances: [ambulance({ id: 1, facility: samu })],
}

describe('Questions rapides sur le réseau', () => {
  it('reconnaît un établissement, un service et un groupe sanguin', () => {
    expect(findFacility('Situation de Fann ?', ctx.facilities)).toBe(fann)
    expect(findFacility('état de la flotte SAMU', ctx.facilities)).toBeUndefined()
    expect(findCategory('Où reste-t-il des lits en réanimation ?')).toBe('intensive_care')
    expect(findCategory('Quelles sont les urgences prioritaires ?')).toBeUndefined()
    expect(findCategory('lits libres aux urgences')).toBe('emergency')
    expect(findBloodGroup('demandes O−')).toBe('O-')
    expect(findBloodGroup('du sang AB positif')).toBe('AB+')
    expect(findBloodGroup('c’est-à-dire')).toBeUndefined()
  })

  it('donne la situation d’un établissement', () => {
    const answer = answerNetworkQuestion('situation de fann', ctx)!
    expect(answer.summary).toContain('Centre Hospitalier Universitaire de Fann')
    expect(answer.summary).toContain('8 lits libres sur 46')
    expect(answer.tableRows?.map((r) => r.col1)).toEqual(['Urgences', 'Réanimation'])
  })

  it('liste les lits libres d’un service, établissement par établissement', () => {
    const answer = answerNetworkQuestion('lits en réanimation', ctx)!
    expect(answer.summary).toBe('4 lits libres en réanimation / soins intensifs sur 36, dans 2 établissements. Le plus de places : Centre Hospitalier Universitaire de Fann.')
    expect(answer.tableRows?.[1]).toMatchObject({ col1: 'Hôpital Principal de Dakar', badge: { text: 'Complet' } })
  })

  it('résume les demandes d’un groupe sanguin', () => {
    const answer = answerNetworkQuestion('Demandes de sang O-', ctx)!
    expect(answer.summary).toBe('1 demande O- ouverte, 3 poches manquantes, dont 1 en urgence vitale.')
  })

  it('classe les hôpitaux et laisse les questions générales à la synthèse', () => {
    const answer = answerNetworkQuestion('Quels hôpitaux sont les plus saturés ?', ctx)!
    expect(answer.tableRows?.map((r) => r.col1)).toEqual(['Hôpital Principal de Dakar', 'Centre Hospitalier Universitaire de Fann'])
    expect(answerNetworkQuestion('Quelles sont les urgences prioritaires et tensions actuelles ?', ctx)).toBeUndefined()
  })
})
