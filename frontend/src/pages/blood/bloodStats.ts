/** Calculs purs de la page « Banque de sang » (testés dans bloodStats.test.ts). */
import { REQUEST_STATUSES, RESPONSE_STATUSES, URGENCIES, toneOf } from '@/lib/constants'
import type { BloodRequest, BloodRequestStatus, DonorResponseStatus, Urgency } from '@/types/api'

export const urgencyTone = (u: Urgency) => toneOf(URGENCIES, u)
export const statusTone = (s: BloodRequestStatus) => toneOf(REQUEST_STATUSES, s)
export const responseTone = (s: DonorResponseStatus) => toneOf(RESPONSE_STATUSES, s)

export interface BloodStats {
  totalOpen: number
  criticalCount: number
  /** Poches encore manquantes sur les demandes ouvertes. */
  totalUnitsNeeded: number
  fulfilledCount: number
}

export function computeBloodStats(requests: readonly BloodRequest[]): BloodStats {
  const open = requests.filter((r) => r.status === 'open')
  return {
    totalOpen: open.length,
    criticalCount: open.filter((r) => r.urgency === 'critical').length,
    totalUnitsNeeded: open.reduce((acc, r) => acc + r.units_remaining, 0),
    fulfilledCount: requests.filter((r) => r.status === 'fulfilled').length,
  }
}

/** Liseré de ligne : seules les demandes encore ouvertes sont signalées. */
export function requestSeverity(request: Pick<BloodRequest, 'status' | 'urgency'>): 'critical' | 'warning' | undefined {
  if (request.status !== 'open') return undefined
  if (request.urgency === 'critical') return 'critical'
  if (request.urgency === 'urgent') return 'warning'
  return undefined
}

export interface BloodFilterValues {
  status: string
  bloodGroup: string
  urgency: string
  region: string
}

export const DEFAULT_BLOOD_FILTERS: BloodFilterValues = { status: 'open', bloodGroup: '', urgency: '', region: '' }
