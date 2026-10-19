import { describe, expect, it } from 'vitest'
import { facility } from '@/test/fixtures'
import type { Account, BedReservation, Role } from '@/types/api'
import { canFulfill, canReserveAt, remainingLabel } from './reservationAccess'

const hospital = facility({ id: 1, region: 'dakar' })
const otherDakar = facility({ id: 2, region: 'dakar' })
const thies = facility({ id: 3, region: 'thies' })
const samu = facility({ id: 9, region: 'dakar', facility_type: 'ambulance_service' })

const viewer = (roles: Role[], own: typeof hospital | null) => ({
  user: { id: 5, facility: own } as Account,
  roles,
  isAdmin: roles.includes('admin'),
})

describe('droits sur les réservations de lits (miroir de lits/views.py)', () => {
  it('administrateur des lits : son hôpital seulement', () => {
    const v = viewer(['bed_manager'], hospital)
    expect(canReserveAt(v, hospital)).toBe(true)
    expect(canReserveAt(v, otherDakar)).toBe(false)
  })

  it('régulation : toute sa région, mais pas l’admission', () => {
    const v = viewer(['ambulance_manager'], samu)
    expect(canReserveAt(v, otherDakar)).toBe(true)
    expect(canReserveAt(v, thies)).toBe(false)
    expect(canFulfill(v, { facility: otherDakar } as BedReservation)).toBe(false)
  })

  it('administrateur du sang : aucun droit', () => {
    expect(canReserveAt(viewer(['blood_manager'], hospital), hospital)).toBe(false)
  })

  it('temps restant lisible', () => {
    const now = Date.parse('2026-10-17T10:00:00Z')
    expect(remainingLabel('2026-10-17T10:32:00Z', now)).toBe('32 min')
    expect(remainingLabel('2026-10-17T11:30:00Z', now)).toBe('1 h 30')
    expect(remainingLabel('2026-10-17T09:59:00Z', now)).toBe('expirée')
  })
})
