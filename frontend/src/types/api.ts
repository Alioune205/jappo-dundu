/**
 * Contrat de l'API REST Jappo Dundu, calqué sur les sérialiseurs DRF du backend
 * (users, sang, lits, ambulances, ml, security). Toute évolution d'un
 * sérialiseur doit être répercutée ici.
 */

export type Role = 'admin' | 'hospital_staff' | 'ambulance_driver' | 'donor'
export type RegionCode =
  | 'dakar'
  | 'thies'
  | 'saint_louis'
  | 'kaolack'
  | 'ziguinchor'
  | 'tambacounda'
  | 'louga'
  | 'fatick'
  | 'kolda'
  | 'matam'
  | 'kaffrine'
  | 'kedougou'
  | 'sedhiou'
  | 'diourbel'
export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-'
export type Urgency = 'critical' | 'urgent' | 'normal'
export type FacilityType = 'hospital' | 'health_center' | 'clinic' | 'blood_bank' | 'ambulance_service'

export interface Paginated<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface PersonRef {
  id: number
  full_name: string
}

// ---------------------------------------------------------------- Comptes

export interface TokenUser {
  id: number
  username: string
  email: string
  full_name: string
  role: Role | null
  roles: Role[]
  groups: string[]
}

export interface TokenPair {
  access: string
  refresh: string
}

export interface LoginResponse extends TokenPair {
  user: TokenUser
}

export interface FacilitySummary {
  id: number
  name: string
  facility_type: FacilityType
  facility_type_display: string
  region: RegionCode
  region_display: string
  city: string
  phone_number: string | null
  latitude: number | null
  longitude: number | null
}

export interface Facility extends FacilitySummary {
  address: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Account {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
  full_name: string
  phone_number: string | null
  region: RegionCode | null
  region_display: string | null
  role: Role | null
  roles: Role[]
  facility: FacilitySummary | null
  date_joined: string
  last_login: string | null
}

export interface AdminUser extends Account {
  is_active: boolean
}

export interface AdminUserInput {
  username?: string
  password?: string
  role?: Role
  facility_id?: number | null
  first_name?: string
  last_name?: string
  email?: string
  phone_number?: string
  region?: RegionCode | ''
  is_active?: boolean
}

export interface FacilityInput {
  name: string
  facility_type: FacilityType
  region: RegionCode
  city: string
  address: string
  phone_number: string
  latitude: number | null
  longitude: number | null
  is_active: boolean
}

// ---------------------------------------------------------------- Sang

export type BloodRequestStatus = 'open' | 'fulfilled' | 'cancelled'
export type DonorResponseStatus = 'accepted' | 'declined' | 'cancelled' | 'donated' | 'no_show'

export interface BloodRequest {
  id: number
  facility: FacilitySummary
  blood_group: BloodGroup
  blood_group_display: string
  units_needed: number
  units_collected: number
  units_remaining: number
  urgency: Urgency
  urgency_display: string
  status: BloodRequestStatus
  status_display: string
  notes: string
  needed_by: string | null
  search_radius_km: number
  created_by: PersonRef | null
  response_counts: { accepted: number; declined: number; donated: number } | null
  created_at: string
  updated_at: string
  closed_at: string | null
}

export interface BloodRequestInput {
  blood_group?: BloodGroup
  units_needed: number
  urgency: Urgency
  notes: string
  needed_by: string | null
  search_radius_km: number
  facility_id?: number
}

export interface DonorResponse {
  id: number
  status: DonorResponseStatus
  status_display: string
  donor: {
    id: number
    blood_group: BloodGroup
    full_name?: string
    phone_number?: string | null
  }
  created_at: string
  updated_at: string
}

export interface DonorMatch {
  donor_id: number
  blood_group: BloodGroup
  blood_group_display: string
  is_exact_match: boolean
  distance_km: number | null
}

export interface DonorLookup {
  id: number
  full_name: string
  blood_group: BloodGroup
  blood_group_display: string
  last_donation_date: string | null
  next_eligible_date: string | null
  is_eligible: boolean
}

export interface Donation {
  id: number
  donor: PersonRef & { blood_group: BloodGroup }
  facility: FacilitySummary
  donated_on: string
  blood_request: number | null
  recorded_by: PersonRef | null
  created_at: string
}

// ---------------------------------------------------------------- Lits

export type BedCategory =
  | 'emergency'
  | 'intensive_care'
  | 'surgery'
  | 'internal_medicine'
  | 'maternity'
  | 'pediatrics'
  | 'neonatology'

export interface BedCapacity {
  id: number
  facility: FacilitySummary
  category: BedCategory
  category_display: string
  total_beds: number
  occupied_beds: number
  available_beds: number
  occupancy_rate: number
  updated_at: string
  updated_by: PersonRef | null
}

export interface BedSummaryRow {
  region: RegionCode
  region_display: string
  category: BedCategory
  category_display: string
  total_beds: number
  occupied_beds: number
  available_beds: number
  occupancy_rate: number | null
}

// ---------------------------------------------------------------- Ambulances

export type AmbulanceType = 'basic' | 'medicalized'
export type AmbulanceStatus = 'available' | 'on_mission' | 'out_of_service'
export type MissionStatus = 'pending' | 'assigned' | 'on_site' | 'transporting' | 'completed' | 'cancelled'

export interface Ambulance {
  id: number
  plate_number: string
  facility: FacilitySummary
  ambulance_type: AmbulanceType
  ambulance_type_display: string
  status: AmbulanceStatus
  status_display: string
  driver: PersonRef | null
  latitude: number | null
  longitude: number | null
  location_updated_at: string | null
  created_at: string
  updated_at: string
}

export interface NearbyAmbulance extends Ambulance {
  distance_km: number | null
}

export interface AmbulanceInput {
  plate_number: string
  facility_id: number
  ambulance_type: AmbulanceType
  driver_id: number | null
}

export interface Mission {
  id: number
  priority: Urgency
  priority_display: string
  status: MissionStatus
  status_display: string
  description: string
  pickup_address: string
  pickup_latitude: number
  pickup_longitude: number
  region: RegionCode
  region_display: string
  caller_phone: string
  ambulance: Ambulance | null
  destination: FacilitySummary | null
  cancellation_reason: string
  created_by: PersonRef | null
  created_at: string
  updated_at: string
  assigned_at: string | null
  on_site_at: string | null
  transporting_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  response_time_minutes: number | null
}

export interface MissionInput {
  priority: Urgency
  description: string
  pickup_address: string
  pickup_latitude: number
  pickup_longitude: number
  region: RegionCode
  caller_phone: string
  destination_id: number | null
}

export interface NearbyBedFacility extends FacilitySummary {
  distance_km: number | null
  available_beds: number
}

export interface MissionDestinations {
  origin: { latitude: number; longitude: number }
  category: BedCategory
  results: NearbyBedFacility[]
}

export interface DelayStats {
  count: number
  average: number | null
  median: number | null
}

export interface MissionStats {
  period_days: number
  missions: { total: number; by_status: Record<MissionStatus, number> }
  assignment_delay_minutes: DelayStats
  response_time_minutes: DelayStats
  fleet: Record<AmbulanceStatus, number>
}

// ---------------------------------------------------------------- Prévisions (ML)

export type RiskLevel = 'CRITICAL' | 'WARNING' | 'NORMAL'

export interface Prediction {
  id: number
  center_name: string
  region: RegionCode
  region_display: string
  blood_group: BloodGroup
  blood_group_display: string
  prediction_date: string
  predicted_units: number
  lower_bound: number | null
  upper_bound: number | null
  days_of_supply: number | null
  risk_level: RiskLevel
  risk_level_display: string
  confidence_score: number | null
  created_at: string
  model_version: string
}

export interface PredictionSummaryRow {
  region: RegionCode
  region_display: string
  total_predictions: number
  critical_count: number
  warning_count: number
  normal_count: number
}

export interface ModelMetadata {
  id: number
  version: string
  algorithm: string
  trained_at: string
  training_samples: number
  mae: number | null
  rmse: number | null
  r2_score: number | null
  metrics: Record<string, unknown>
  is_active: boolean
  notes: string
}

export type PredictionJobStatus = 'pending' | 'running' | 'succeeded' | 'failed'

/**
 * Prédiction à la demande, exécutée en arrière-plan (POST /api/ml/predict/ → 202).
 * Les champs de résultat ne sont présents qu'une fois la tâche réussie.
 */
export interface PredictionJob {
  job_id: string
  status: PredictionJobStatus
  status_url: string
  filters: { region: RegionCode | null; blood_group: BloodGroup | null; days_ahead: number }
  created_at: string
  finished_at: string | null
  message?: string
  predictions_count?: number
  risk_summary?: Partial<Record<RiskLevel, number>>
  skipped_series?: number | unknown[]
  model_version?: string
}

export interface StockRecord {
  id: number
  center_name: string
  region: RegionCode
  region_display: string
  blood_group: BloodGroup
  blood_group_display: string
  date: string
  units_available: number
  units_donated: number | null
  units_used: number | null
  units_expired: number | null
  source: 'synthetic' | 'import' | 'manual'
}

// ---------------------------------------------------------------- Supervision

export interface DependencyCheck {
  status: 'up' | 'down'
  latency_ms?: number
  error?: string
  [key: string]: unknown
}

export interface SystemStatus {
  status: 'healthy' | 'degraded'
  service: string
  checks: Record<'database' | 'channel_layer' | 'ml_model', DependencyCheck>
}
