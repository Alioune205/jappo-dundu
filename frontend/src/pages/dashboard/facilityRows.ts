import type { Ambulance, BedCapacity, BloodRequest, FacilitySummary } from '@/types/api'

/** Seuils d'occupation (mêmes repères que le graphique par spécialité). */
export const SATURATED = 0.85
export const VIGILANCE = 0.7

export type NetworkLevel = 'normal' | 'vigilance' | 'alert'

export interface FacilityRow {
  facility: FacilitySummary
  totalBeds: number
  availableBeds: number
  occupancy: number | null
  saturatedServices: number
  openRequests: number
  criticalRequests: number
  ambulances: number
  availableAmbulances: number
  level: NetworkLevel
}

const LEVEL_RANK: Record<NetworkLevel, number> = { alert: 2, vigilance: 1, normal: 0 }

/** Situation de chaque établissement : lits, sang, ambulances, et niveau de tension. */
export function facilityRows(
  facilities: FacilitySummary[],
  capacities: BedCapacity[],
  bloodRequests: BloodRequest[],
  ambulances: Ambulance[]
): FacilityRow[] {
  return facilities
    .map((facility) => {
      const services = capacities.filter((c) => c.facility?.id === facility.id)
      const requests = bloodRequests.filter((r) => r.facility?.id === facility.id)
      const fleet = ambulances.filter((a) => a.facility?.id === facility.id)
      const totalBeds = services.reduce((acc, c) => acc + c.total_beds, 0)
      const availableBeds = services.reduce((acc, c) => acc + c.available_beds, 0)
      const occupancy = totalBeds > 0 ? (totalBeds - availableBeds) / totalBeds : null
      const saturatedServices = services.filter(
        (c) => c.total_beds > 0 && (c.total_beds - c.available_beds) / c.total_beds >= SATURATED
      ).length
      const criticalRequests = requests.filter((r) => r.urgency === 'critical').length
      const level: NetworkLevel =
        criticalRequests > 0 || (occupancy ?? 0) >= SATURATED
          ? 'alert'
          : saturatedServices > 0 || requests.length > 0 || (occupancy ?? 0) >= VIGILANCE
            ? 'vigilance'
            : 'normal'
      return {
        facility,
        totalBeds,
        availableBeds,
        occupancy,
        saturatedServices,
        openRequests: requests.length,
        criticalRequests,
        ambulances: fleet.length,
        availableAmbulances: fleet.filter((a) => a.status === 'available').length,
        level,
      }
    })
    .sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || (b.occupancy ?? -1) - (a.occupancy ?? -1))
}
