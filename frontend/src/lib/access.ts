/**
 * Droits d'accès par rôle — miroir de backend/security/roles.py
 * (DOMAIN_ROLES : écriture, DOMAIN_VIEW_ROLES : lecture).
 *
 * Le backend reste la vraie protection : ce module ne sert qu'à ne pas
 * afficher un module, un bouton ou une requête que le serveur refuserait.
 */
import type { Role } from '@/types/api'
import { WEB_ROLES } from '@/lib/constants'

export type Domain = 'beds' | 'blood' | 'ambulances'

/**
 * Rôles qui OPÈRENT chaque domaine (écriture, dans leur périmètre). Sans
 * l'administrateur général : il supervise sans effectuer d'opérations métier.
 */
export const DOMAIN_ROLES: Record<Domain, Role[]> = {
  beds: ['hospital_staff', 'bed_manager'],
  blood: ['hospital_staff', 'blood_manager'],
  ambulances: ['hospital_staff', 'ambulance_manager'],
}

/** Rôles qui CONSULTENT chaque domaine : ceux qui l'opèrent et l'administrateur général. */
export const DOMAIN_VIEW_ROLES: Record<Domain, Role[]> = {
  beds: [...DOMAIN_ROLES.beds, 'admin'],
  blood: [...DOMAIN_ROLES.blood, 'admin'],
  ambulances: [...DOMAIN_ROLES.ambulances, 'admin'],
}

/** Autres rôles qui peuvent CONSULTER un domaine sans l'opérer. */
const READ_ONLY_ROLES: Record<Domain, Role[]> = {
  // La régulation oriente les patients vers les lits libres.
  beds: ['ambulance_manager'],
  blood: [],
  ambulances: [],
}

/** Accès aux pages de l'interface web. */
export const PAGE_ROLES: Record<string, Role[]> = {
  '/blood': DOMAIN_VIEW_ROLES.blood,
  '/beds': [...DOMAIN_VIEW_ROLES.beds, ...READ_ONLY_ROLES.beds],
  '/ambulances': DOMAIN_VIEW_ROLES.ambulances,
  '/ml': DOMAIN_VIEW_ROLES.blood,
  '/facilities': ['admin'],
  '/rapport': ['admin', ...DOMAIN_ROLES.beds, ...DOMAIN_ROLES.blood, ...DOMAIN_ROLES.ambulances],
}

/** Libellés des rôles, du plus large au plus spécialisé (ordre d'affichage). */
export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrateur général',
  hospital_staff: 'Personnel hospitalier',
  ambulance_manager: 'Administrateur des ambulances',
  blood_manager: 'Administrateur du sang',
  bed_manager: 'Administrateur des lits',
  ambulance_driver: 'Ambulancier',
  donor: 'Donneur',
}

const PRIORITY = Object.keys(ROLE_LABELS) as Role[]

export function rolesOf(user: { role?: Role | null; roles?: Role[] } | null | undefined): Role[] {
  if (!user) return []
  return Array.from(new Set([...(user.roles ?? []), ...(user.role ? [user.role] : [])]))
}

const hasAny = (roles: Role[], allowed: Role[]) => allowed.some((role) => roles.includes(role))

/**
 * Administrateur général : supervision nationale, lecture seule sur les
 * domaines métier (backend : security.roles.is_supervisor).
 */
export const isSupervisor = (roles: Role[]) => roles.includes('admin')

/** L'utilisateur OPÈRE-t-il ce domaine (écriture) ? Jamais l'administrateur général. */
export const canManage = (roles: Role[], domain: Domain) =>
  !isSupervisor(roles) && hasAny(roles, DOMAIN_ROLES[domain])

/**
 * Administration de la flotte (ajout, modification, chauffeurs, disponibilité) :
 * administrateur des ambulances seulement (backend : CanEditFleet). Le
 * personnel hospitalier régule les missions sans gérer les véhicules ;
 * l'administrateur général consulte la flotte sans la modifier.
 */
export const canEditFleet = (roles: Role[]) => !isSupervisor(roles) && hasAny(roles, ['ambulance_manager'])

/** L'utilisateur peut-il consulter ce domaine ? (administrateur général compris) */
export const canView = (roles: Role[], domain: Domain) =>
  hasAny(roles, DOMAIN_VIEW_ROLES[domain]) || hasAny(roles, READ_ONLY_ROLES[domain])

/** L'utilisateur peut-il ouvrir cette page ? (pages non listées : tout utilisateur connecté) */
export function canOpen(roles: Role[], path: string): boolean {
  const section = `/${path.split('/')[1] ?? ''}`
  const allowed = PAGE_ROLES[section]
  return allowed === undefined || hasAny(roles, allowed)
}

/** Le compte a-t-il accès à l'interface web ? (donneurs et ambulanciers : application mobile) */
export const canUseWeb = (roles: Role[]) => hasAny(roles, WEB_ROLES)

/** Libellé du rôle principal (ex. « Administrateur des lits »). */
export function primaryRoleLabel(roles: Role[]): string {
  const main = PRIORITY.find((role) => roles.includes(role))
  return main ? ROLE_LABELS[main] : 'Utilisateur'
}
