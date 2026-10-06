import { describe, expect, it } from 'vitest'
import { canManage, canOpen, canView, primaryRoleLabel, rolesOf } from './access'
import type { Role } from '@/types/api'

const PAGES = ['/', '/beds', '/blood', '/ambulances', '/ml', '/facilities', '/profile']

const openable = (roles: Role[]) => PAGES.filter((page) => canOpen(roles, page))

describe('droits par rôle (miroir de security/roles.py)', () => {
  it("l'administrateur général ouvre tout", () => {
    expect(openable(['admin'])).toEqual(PAGES)
  })

  it("l'administrateur des lits n'ouvre que les lits", () => {
    expect(openable(['bed_manager'])).toEqual(['/', '/beds', '/profile'])
    expect(canManage(['bed_manager'], 'beds')).toBe(true)
    expect(canManage(['bed_manager'], 'blood')).toBe(false)
  })

  it("l'administrateur du sang ouvre le sang et les prévisions", () => {
    expect(openable(['blood_manager'])).toEqual(['/', '/blood', '/ml', '/profile'])
  })

  it("l'administrateur des ambulances consulte les lits sans les gérer", () => {
    expect(openable(['ambulance_manager'])).toEqual(['/', '/beds', '/ambulances', '/profile'])
    expect(canView(['ambulance_manager'], 'beds')).toBe(true)
    expect(canManage(['ambulance_manager'], 'beds')).toBe(false)
  })

  it('le rôle historique garde ses trois domaines, sans les structures', () => {
    expect(openable(['hospital_staff'])).toEqual(['/', '/beds', '/blood', '/ambulances', '/ml', '/profile'])
  })

  it('les rôles se cumulent', () => {
    expect(openable(['bed_manager', 'blood_manager'])).toEqual(['/', '/beds', '/blood', '/ml', '/profile'])
  })

  it('libellé du rôle principal et fusion role / roles', () => {
    expect(primaryRoleLabel(['bed_manager'])).toBe('Administrateur des lits')
    expect(primaryRoleLabel(['admin', 'donor'])).toBe('Administrateur général')
    expect(rolesOf({ role: 'blood_manager', roles: ['blood_manager', 'donor'] })).toEqual(['blood_manager', 'donor'])
    expect(rolesOf(null)).toEqual([])
  })
})
