/**
 * Droits d'accès par rôle — miroir de backend/security/roles.py (DOMAIN_ROLES).
 *
 * Le backend reste la vraie protection : ce module ne sert qu'à ne pas
 * afficher un module, un bouton ou une requête que le serveur refuserait.
 */
import type { Role } from '@/types/api'

export type Domain = 'beds' | 'blood' | 'ambulances'

/** Rôles qui administrent chaque domaine (lecture et écriture, dans leur périmètre). */
export const DOMAIN_ROLES: Record<Domain, Role[]> = {
  beds: ['admin', 'hospital_staff', 'bed_manager'],
  blood: ['admin', 'hospital_staff', 'blood_manager'],
  ambulances: ['admin', 'hospital_staff', 'ambulance_manager'],
}

/** Rôles qui peuvent CONSULTER un domaine sans l'administrer. */
const READ_ONLY_ROLES: Record<Domain, Role[]> = {
  // La régulation oriente les patients vers les lits libres.
  beds: ['ambulance_manager'],
  blood: [],
  ambulances: [],
}

/** Accès aux pages de l'interface web. */
export const PAGE_ROLES: Record<string, Role[]> = {
  '/blood': DOMAIN_ROLES.blood,
  '/beds': [...DOMAIN_ROLES.beds, ...READ_ONLY_ROLES.beds],
  '/ambulances': DOMAIN_ROLES.ambulances,
  '/ml': DOMAIN_ROLES.blood,
  '/facilities': ['admin'],
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

/** L'utilisateur administre-t-il ce domaine ? */
export const canManage = (roles: Role[], domain: Domain) => hasAny(roles, DOMAIN_ROLES[domain])

/** L'utilisateur peut-il consulter ce domaine ? */
export const canView = (roles: Role[], domain: Domain) =>
  canManage(roles, domain) || hasAny(roles, READ_ONLY_ROLES[domain])

/** L'utilisateur peut-il ouvrir cette page ? (pages non listées : tout utilisateur connecté) */
export function canOpen(roles: Role[], path: string): boolean {
  const section = `/${path.split('/')[1] ?? ''}`
  const allowed = PAGE_ROLES[section]
  return allowed === undefined || hasAny(roles, allowed)
}

/** Libellé du rôle principal (ex. « Administrateur des lits »). */
export function primaryRoleLabel(roles: Role[]): string {
  const main = PRIORITY.find((role) => roles.includes(role))
  return main ? ROLE_LABELS[main] : 'Utilisateur'
}
