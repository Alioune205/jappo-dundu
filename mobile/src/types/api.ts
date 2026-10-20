/**
 * Types des réponses de l'API utilisées par l'application donneur
 * (formes des serializers backend : users/serializers.py, sang/serializers.py).
 */
export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-'
export type Urgency = 'critical' | 'urgent' | 'normal'
export type ResponseStatus = 'accepted' | 'declined' | 'cancelled' | 'donated' | 'no_show'
export type RegionCode =
  | 'dakar' | 'thies' | 'saint_louis' | 'kaolack' | 'ziguinchor' | 'tambacounda' | 'louga'
  | 'fatick' | 'kolda' | 'matam' | 'kaffrine' | 'kedougou' | 'sedhiou' | 'diourbel'

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
  role: string | null
  roles: string[]
  date_joined: string
}

export interface TokenPair {
  access: string
  refresh: string
}

export interface RegisterInput {
  username: string
  password: string
  first_name: string
  last_name: string
  phone_number: string
  region: RegionCode
  email?: string
}

export interface FacilitySummary {
  id: number
  name: string
  city: string
  region: RegionCode
  latitude: number | null
  longitude: number | null
  phone_number?: string | null
}

export type FacilityType = 'hospital' | 'health_center' | 'clinic' | 'blood_bank' | 'ambulance_service'

/** Établissement trouvé autour d'un point (GET /api/facilities/nearest/). */
export interface NearbyFacility extends FacilitySummary {
  facility_type: FacilityType
  facility_type_display: string
  region_display: string
  distance_km: number | null
}

export type Sex = 'M' | 'F'

export interface DonorProfile {
  id: number
  /** Code aléatoire de la carte donneur (« JD-7KQ4-M9PX »), contenu du QR code. */
  card_code: string
  blood_group: BloodGroup
  blood_group_display: string
  sex: Sex
  sex_display: string
  date_of_birth: string
  weight_kg: number | null
  is_available: boolean
  latitude: number | null
  longitude: number | null
  location_updated_at: string | null
  last_donation_date: string | null
  next_eligible_date: string | null
  is_eligible: boolean
  ineligibility_reasons: string[]
}

/** Corps de PUT /api/sang/donors/me/ (création ou remplacement). */
export interface DonorInput {
  blood_group: BloodGroup
  sex: Sex
  date_of_birth: string
  weight_kg: number | null
  is_available: boolean
  last_donation_date: string | null
  latitude: number | null
  longitude: number | null
}

export interface NearbyRequest {
  id: number
  facility: FacilitySummary
  blood_group: BloodGroup
  blood_group_display: string
  units_remaining: number
  urgency: Urgency
  urgency_display: string
  needed_by: string | null
  created_at: string
  distance_km: number | null
  my_response: ResponseStatus | null
}

export interface MyDonation {
  id: number
  facility: FacilitySummary
  donated_on: string
  blood_request: number | null
  created_at: string
}

export interface MyResponse {
  id: number
  status: ResponseStatus
  status_display: string
  blood_request: {
    id: number
    facility: FacilitySummary
    blood_group: BloodGroup
    urgency: Urgency
    status: string
    status_display: string
    created_at: string
  }
  created_at: string
  updated_at: string
}

export interface Paginated<T> {
  count: number
  next: string | null
  results: T[]
}

/** Message « blood_alert » du flux /ws/alerts/ (sang/notifications.py). */
export interface BloodAlertEvent {
  type: 'blood_alert'
  id: string
  sent_at: string
  data: {
    event: 'blood_request_created' | 'blood_request_updated' | 'blood_request_closed'
    request_id: number
    blood_group: BloodGroup
    units_remaining: number
    urgency: Urgency
    status: string
  }
}

export type BadgeCategory = 'milestone' | 'special' | 'solidarity'

export interface GamificationBadge {
  id: number
  code: string
  name: string
  description: string
  /** Nom de pictogramme choisi côté serveur (heart, award, shield…). */
  icon: string
  points_bonus: number
  category: BadgeCategory
  /** Nombre de dons du palier (0 : condition particulière). */
  required_donations: number
  awarded_at?: string
  unlocked: boolean
}

/** GET /api/sang/donors/me/gamification/ */
export interface GamificationProfile {
  points: number
  donation_points: number
  badge_points: number
  donations_count: number
  level: number
  title: string
  progress_percent: number
  next_level_points: number | null
  points_to_next_level: number
  earned_badges_count: number
  badges: GamificationBadge[]
  locked_badges: GamificationBadge[]
}
