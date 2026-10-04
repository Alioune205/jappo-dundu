/** Données de test réalistes (formes conformes aux réponses de l'API). */
import type { Ambulance, BedCapacity, BloodRequest, FacilitySummary, Mission } from '@/types/api'

export const facility = (overrides: Partial<FacilitySummary> = {}): FacilitySummary =>
  ({
    id: 1,
    name: 'Hôpital Principal de Dakar',
    city: 'Dakar',
    region: 'dakar',
    facility_type: 'hospital',
    facility_type_display: 'Hôpital',
    latitude: 14.66,
    longitude: -17.43,
    phone_number: '33 839 50 50',
    ...overrides,
  }) as FacilitySummary

export const capacity = (overrides: Partial<BedCapacity> = {}): BedCapacity => {
  const total = overrides.total_beds ?? 10
  const occupied = overrides.occupied_beds ?? 6
  return {
    id: 1,
    facility: facility(),
    category: 'emergency',
    category_display: 'Urgences',
    total_beds: total,
    occupied_beds: occupied,
    available_beds: total - occupied,
    occupancy_rate: occupied / total,
    updated_at: '2026-10-04T06:00:00Z',
    ...overrides,
  } as BedCapacity
}

export const bloodRequest = (overrides: Partial<BloodRequest> = {}): BloodRequest =>
  ({
    id: 100,
    blood_group: 'O-',
    facility: facility(),
    urgency: 'critical',
    urgency_display: 'Critique',
    status: 'open',
    status_display: 'Ouverte',
    units_needed: 4,
    units_collected: 1,
    units_remaining: 3,
    search_radius_km: 25,
    notes: '',
    created_at: '2026-10-04T05:00:00Z',
    ...overrides,
  }) as BloodRequest

export const ambulance = (overrides: Partial<Ambulance> = {}): Ambulance =>
  ({
    id: 1,
    plate_number: 'DK-2041-A',
    status: 'available',
    status_display: 'Disponible',
    ambulance_type: 'medicalized',
    ambulance_type_display: 'SMUR médicalisée',
    facility: facility(),
    driver: null,
    latitude: 14.7,
    longitude: -17.45,
    location_updated_at: null,
    ...overrides,
  }) as Ambulance

export const mission = (overrides: Partial<Mission> = {}): Mission =>
  ({
    id: 520,
    status: 'pending',
    status_display: 'En attente',
    priority: 'critical',
    priority_display: 'Critique',
    pickup_address: 'Rond-point Liberté 6',
    region_display: 'Dakar',
    description: '',
    ambulance: null,
    destination: null,
    pickup_latitude: 14.71,
    pickup_longitude: -17.45,
    created_at: '2026-10-04T06:00:00Z',
    ...overrides,
  }) as Mission
