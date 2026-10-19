/**
 * Droits sur les réservations de lits — miroir de lits/views.py
 * (can_reserve_at, can_fulfill, can_cancel). Le backend reste la vraie
 * protection : ces règles ne servent qu'à afficher les bons boutons.
 */
import { canManage } from '@/lib/access'
import type { Account, BedReservation, FacilitySummary, Role } from '@/types/api'

export interface ReservationViewer {
  user: Account | null
  roles: Role[]
  isAdmin: boolean
}

const DISPATCH_ROLES: Role[] = ['ambulance_manager', 'hospital_staff']

/** Réserver dans cet établissement : son hôpital (lits), ou sa région (régulation). */
export function canReserveAt({ user, roles, isAdmin }: ReservationViewer, facility: FacilitySummary | null | undefined) {
  if (!facility) return false
  if (isAdmin) return true
  const own = user?.facility
  if (canManage(roles, 'beds') && own?.id === facility.id) return true
  return roles.some((r) => DISPATCH_ROLES.includes(r)) && !!own && own.region === facility.region
}

/** Admettre le patient attendu : l'hôpital qui l'accueille. */
export function canFulfill({ user, roles, isAdmin }: ReservationViewer, reservation: BedReservation) {
  return isAdmin || (canManage(roles, 'beds') && user?.facility?.id === reservation.facility.id)
}

export function canCancel(viewer: ReservationViewer, reservation: BedReservation) {
  return (
    reservation.created_by?.id === viewer.user?.id ||
    canFulfill(viewer, reservation) ||
    canReserveAt(viewer, reservation.facility)
  )
}

/** Libellé du temps restant avant expiration (« 32 min », « expirée »). */
export function remainingLabel(expiresAt: string, now: number): string {
  const minutes = Math.ceil((new Date(expiresAt).getTime() - now) / 60_000)
  if (minutes <= 0) return 'expirée'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} h ${rest.toString().padStart(2, '0')}` : `${hours} h`
}
