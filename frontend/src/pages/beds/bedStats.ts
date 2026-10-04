/** Calculs purs de la page « Capacité en lits » (testés dans bedStats.test.ts). */
import type { BedCapacity } from '@/types/api'

export type OccupancyLevel = 'saturated' | 'high' | 'normal'

/** Saturé : aucun lit libre ; tension : plus de 85 % d'occupation. */
export function occupancyLevel(cap: Pick<BedCapacity, 'available_beds' | 'occupancy_rate'>): OccupancyLevel {
  if (cap.available_beds === 0) return 'saturated'
  if (cap.occupancy_rate > 0.85) return 'high'
  return 'normal'
}

export interface BedStats {
  totalBeds: number
  occupiedBeds: number
  availableBeds: number
  /** Taux d'occupation global, en pourcentage (0–100). */
  globalRate: number
  reaBeds: number
  urgBeds: number
  saturatedCount: number
}

export function computeBedStats(capacities: readonly BedCapacity[]): BedStats {
  const sum = (items: readonly BedCapacity[], pick: (c: BedCapacity) => number) =>
    items.reduce((acc, c) => acc + pick(c), 0)

  const totalBeds = sum(capacities, (c) => c.total_beds)
  const occupiedBeds = sum(capacities, (c) => c.occupied_beds)
  return {
    totalBeds,
    occupiedBeds,
    availableBeds: sum(capacities, (c) => c.available_beds),
    globalRate: totalBeds > 0 ? (occupiedBeds / totalBeds) * 100 : 0,
    reaBeds: sum(capacities.filter((c) => c.category === 'intensive_care'), (c) => c.available_beds),
    urgBeds: sum(capacities.filter((c) => c.category === 'emergency'), (c) => c.available_beds),
    saturatedCount: capacities.filter((c) => c.available_beds === 0).length,
  }
}

/** Filtre local par établissement, ville ou service (insensible à la casse). */
export function filterCapacities(capacities: readonly BedCapacity[], query: string): BedCapacity[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...capacities]
  return capacities.filter(
    (c) =>
      c.facility?.name?.toLowerCase().includes(q) ||
      c.facility?.city?.toLowerCase().includes(q) ||
      c.category_display?.toLowerCase().includes(q)
  )
}

/** Actions de ligne partagées par la vue tableau et la vue cartes. */
export interface CapacityActions {
  onAdmit: (id: number) => void
  onDischarge: (id: number) => void
  onEdit: (capacity: BedCapacity) => void
  /** Admission en cours pour ce service. */
  isAdmitting: (id: number) => boolean
  isDischarging: (id: number) => boolean
  /** Une admission / sortie est en cours ailleurs : on bloque les autres lignes. */
  admitBusy: boolean
  dischargeBusy: boolean
}
