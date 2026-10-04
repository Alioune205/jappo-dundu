import { ageOn, deadline, maskFrDate, parseFrDate, timeAgo, toFrInput } from '@/lib/dates'
import { formatDistance, roundCoords } from '@/lib/location'
import { EMPTY_DONOR, validateDonor } from '@/lib/validation'
import { pendingCount, sortRequests } from '@/features/alerts/format'
import { buildTimeline, recoveryProgress } from '@/features/history/timeline'
import type { FacilitySummary, MyDonation, MyResponse, NearbyRequest } from '@/types/api'

const TODAY = new Date(2026, 9, 4, 12, 0)

describe('dates', () => {
  it('lit une date française et refuse celles qui n’existent pas', () => {
    expect(parseFrDate('07/03/1995')).toBe('1995-03-07')
    expect(parseFrDate('7.3.1995')).toBe('1995-03-07')
    expect(parseFrDate('31/02/2000')).toBeNull()
    expect(parseFrDate('1995-03-07')).toBeNull()
    expect(toFrInput('1995-03-07')).toBe('07/03/1995')
  })

  it('masque la saisie au fil de la frappe', () => {
    expect(maskFrDate('0703')).toBe('07/03')
    expect(maskFrDate('07031995')).toBe('07/03/1995')
    expect(maskFrDate('07/03/19951')).toBe('07/03/1995')
  })

  it('calcule l’âge révolu', () => {
    expect(ageOn('2008-10-04', TODAY)).toBe(18)
    expect(ageOn('2008-10-05', TODAY)).toBe(17)
  })

  it('formule les durées et échéances', () => {
    const now = TODAY.getTime()
    expect(timeAgo(now - 20_000, now)).toBe('à l’instant')
    expect(timeAgo(now - 12 * 60_000, now)).toBe('il y a 12 min')
    expect(timeAgo(now - 3 * 3600_000, now)).toBe('il y a 3 h')
    expect(deadline(new Date(2026, 9, 4, 18, 0).toISOString(), TODAY)).toBe('avant 18:00')
    expect(deadline(new Date(2026, 9, 5, 8, 30).toISOString(), TODAY)).toBe('avant demain 08:30')
  })
})

describe('position', () => {
  it('arrondit à ~100 m avant tout envoi', () => {
    expect(roundCoords({ latitude: 14.716777, longitude: -17.467321 })).toEqual({ latitude: 14.717, longitude: -17.467 })
  })

  it('affiche une distance lisible', () => {
    expect(formatDistance(0.24)).toBe('200 m')
    expect(formatDistance(2.43)).toBe('2,4 km')
    expect(formatDistance(37.6)).toBe('38 km')
    expect(formatDistance(null)).toBeNull()
  })
})

describe('validateDonor', () => {
  const valid = { ...EMPTY_DONOR, blood_group: 'O-' as const, sex: 'F' as const, date_of_birth: '07/03/1995' }

  it('accepte un profil complet', () => {
    expect(validateDonor(valid, TODAY)).toEqual({})
  })

  it('exige groupe, sexe et une date de naissance valide', () => {
    const errors = validateDonor(EMPTY_DONOR, TODAY)
    expect(Object.keys(errors).sort()).toEqual(['blood_group', 'date_of_birth', 'sex'])
  })

  it('refuse un donneur mineur, comme le serveur', () => {
    expect(validateDonor({ ...valid, date_of_birth: '05/10/2008' }, TODAY).date_of_birth?.[0]).toMatch(/18 ans/)
  })

  it('contrôle la date du dernier don', () => {
    expect(validateDonor({ ...valid, last_donation_date: '01/01/2030' }, TODAY).last_donation_date).toBeDefined()
    expect(validateDonor({ ...valid, last_donation_date: '01/01/1990' }, TODAY).last_donation_date).toBeDefined()
    expect(validateDonor({ ...valid, last_donation_date: '12/06/2026' }, TODAY)).toEqual({})
  })
})

const facility: FacilitySummary = { id: 1, name: 'CHU de Fann', city: 'Dakar', region: 'dakar', latitude: 14.69, longitude: -17.46 }

function request(id: number, my_response: NearbyRequest['my_response']): NearbyRequest {
  return {
    id,
    facility,
    blood_group: 'O-',
    blood_group_display: 'O-',
    units_remaining: 2,
    urgency: 'urgent',
    urgency_display: 'Urgente',
    needed_by: null,
    created_at: TODAY.toISOString(),
    distance_km: id,
    my_response,
  }
}

describe('liste des alertes', () => {
  it('met les engagements en tête et les demandes écartées en fin, sans casser l’ordre des distances', () => {
    const sorted = sortRequests([request(1, 'declined'), request(2, null), request(3, 'accepted'), request(4, null)])
    expect(sorted.map((r) => r.id)).toEqual([3, 2, 4, 1])
  })

  it('compte les demandes en attente de réponse (badge)', () => {
    expect(pendingCount([request(1, null), request(2, 'accepted'), request(3, 'cancelled'), request(4, 'declined')])).toBe(2)
    expect(pendingCount(undefined)).toBe(0)
  })
})

describe('historique', () => {
  const donation: MyDonation = { id: 7, facility, donated_on: '2026-06-12', blood_request: 40, created_at: '2026-06-12T10:00:00Z' }
  const response = (id: number, status: MyResponse['status'], requestId: number, at: string): MyResponse => ({
    id,
    status,
    status_display: status,
    blood_request: { id: requestId, facility, blood_group: 'O-', urgency: 'urgent', status: 'open', status_display: 'Ouverte', created_at: at },
    created_at: at,
    updated_at: at,
  })

  it('fusionne dons et réponses par mois, sans doublon pour un même don', () => {
    const sections = buildTimeline({
      donations: [donation],
      responses: [
        response(1, 'donated', 40, '2026-06-12T09:00:00Z'),
        response(2, 'declined', 41, '2026-09-20T08:00:00Z'),
        response(3, 'accepted', 42, '2026-09-28T08:00:00Z'),
      ],
    })
    expect(sections.map((s) => s.title)).toEqual(['Septembre 2026', 'Juin 2026'])
    expect(sections[0].data.map((i) => i.key)).toEqual(['r3', 'r2'])
    expect(sections[1].data.map((i) => i.key)).toEqual(['d7'])
  })

  it('mesure la récupération entre deux dons', () => {
    expect(recoveryProgress('2026-06-12', '2026-10-10', new Date(2026, 7, 11))).toBeCloseTo(0.5, 1)
    expect(recoveryProgress(null, null)).toBe(1)
  })
})
