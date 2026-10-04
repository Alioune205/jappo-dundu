/**
 * Référentiels métier (mêmes codes que le backend : ml/constants.py,
 * modèles sang, lits, ambulances, users) avec leur libellé et leur ton visuel.
 */
import type {
  AmbulanceStatus,
  AmbulanceType,
  BedCategory,
  BloodGroup,
  BloodRequestStatus,
  DonorResponseStatus,
  FacilityType,
  MissionStatus,
  RegionCode,
  RiskLevel,
  Role,
  Urgency,
} from '@/types/api'

export type Tone = 'neutral' | 'brand' | 'danger' | 'warning' | 'success' | 'info' | 'violet'

/**
 * Traduction des tons vers les quatre couleurs de sens du système
 * (critique, vigilance, nominal, information). « brand » rejoint le critique
 * et « violet » l'information ; le reste est neutre.
 */
export const TONE_DOT: Record<Tone, string> = {
  neutral: 'bg-subtle',
  brand: 'bg-critical',
  danger: 'bg-critical',
  warning: 'bg-warning',
  success: 'bg-ok',
  info: 'bg-info',
  violet: 'bg-info',
}

export const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-muted',
  brand: 'text-critical',
  danger: 'text-critical',
  warning: 'text-warning',
  success: 'text-ok',
  info: 'text-info',
  violet: 'text-info',
}

export interface Option<T extends string> {
  value: T
  label: string
}

export const REGIONS: Option<RegionCode>[] = [
  { value: 'dakar', label: 'Dakar' },
  { value: 'thies', label: 'Thiès' },
  { value: 'saint_louis', label: 'Saint-Louis' },
  { value: 'kaolack', label: 'Kaolack' },
  { value: 'ziguinchor', label: 'Ziguinchor' },
  { value: 'tambacounda', label: 'Tambacounda' },
  { value: 'louga', label: 'Louga' },
  { value: 'fatick', label: 'Fatick' },
  { value: 'kolda', label: 'Kolda' },
  { value: 'matam', label: 'Matam' },
  { value: 'kaffrine', label: 'Kaffrine' },
  { value: 'kedougou', label: 'Kédougou' },
  { value: 'sedhiou', label: 'Sédhiou' },
  { value: 'diourbel', label: 'Diourbel' },
]

export const BLOOD_GROUPS: BloodGroup[] = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+']

export const URGENCIES: (Option<Urgency> & { tone: Tone })[] = [
  { value: 'critical', label: 'Critique', tone: 'danger' },
  { value: 'urgent', label: 'Urgente', tone: 'warning' },
  { value: 'normal', label: 'Normale', tone: 'info' },
]

export const REQUEST_STATUSES: (Option<BloodRequestStatus> & { tone: Tone })[] = [
  // L'urgence porte la gravité : une demande ouverte n'est qu'une information.
  { value: 'open', label: 'Ouverte', tone: 'info' },
  { value: 'fulfilled', label: 'Satisfaite', tone: 'success' },
  { value: 'cancelled', label: 'Annulée', tone: 'neutral' },
]

export const RESPONSE_STATUSES: (Option<DonorResponseStatus> & { tone: Tone })[] = [
  { value: 'accepted', label: 'Engagé', tone: 'info' },
  { value: 'donated', label: 'Don effectué', tone: 'success' },
  { value: 'declined', label: 'Décline', tone: 'neutral' },
  { value: 'cancelled', label: 'Désistement', tone: 'neutral' },
  { value: 'no_show', label: 'Absent', tone: 'warning' },
]

export const BED_CATEGORIES: (Option<BedCategory> & { vital: boolean })[] = [
  { value: 'emergency', label: 'Urgences', vital: true },
  { value: 'intensive_care', label: 'Réanimation / soins intensifs', vital: true },
  { value: 'neonatology', label: 'Néonatologie', vital: true },
  { value: 'surgery', label: 'Chirurgie', vital: false },
  { value: 'internal_medicine', label: 'Médecine', vital: false },
  { value: 'maternity', label: 'Maternité', vital: false },
  { value: 'pediatrics', label: 'Pédiatrie', vital: false },
]

export const FACILITY_TYPES: Option<FacilityType>[] = [
  { value: 'hospital', label: 'Hôpital' },
  { value: 'health_center', label: 'Centre de santé' },
  { value: 'clinic', label: 'Clinique' },
  { value: 'blood_bank', label: 'Centre de transfusion sanguine' },
  { value: 'ambulance_service', label: "Service d'ambulances" },
]

/** Seuls ces établissements gèrent des lits (règle du module Lits). */
export const BED_FACILITY_TYPES: FacilityType[] = ['hospital', 'health_center', 'clinic']

export const AMBULANCE_TYPES: Option<AmbulanceType>[] = [
  { value: 'basic', label: 'Transport' },
  { value: 'medicalized', label: 'Médicalisée (SMUR)' },
]

export const AMBULANCE_STATUSES: (Option<AmbulanceStatus> & { tone: Tone; color: string })[] = [
  { value: 'available', label: 'Disponible', tone: 'success', color: '#17b26a' },
  { value: 'on_mission', label: 'En mission', tone: 'warning', color: '#f79009' },
  { value: 'out_of_service', label: 'Hors service', tone: 'neutral', color: '#8d96a0' },
]

export const MISSION_STATUSES: (Option<MissionStatus> & { tone: Tone; active: boolean })[] = [
  { value: 'pending', label: 'En attente', tone: 'danger', active: true },
  { value: 'assigned', label: 'Ambulance en route', tone: 'warning', active: true },
  { value: 'on_site', label: 'Sur place', tone: 'info', active: true },
  { value: 'transporting', label: 'Transport patient', tone: 'violet', active: true },
  { value: 'completed', label: 'Terminée', tone: 'success', active: false },
  { value: 'cancelled', label: 'Annulée', tone: 'neutral', active: false },
]

export const RISK_LEVELS: (Option<RiskLevel> & { tone: Tone; color: string })[] = [
  { value: 'CRITICAL', label: 'Critique', tone: 'danger', color: '#f04438' },
  { value: 'WARNING', label: 'Vigilance', tone: 'warning', color: '#f79009' },
  { value: 'NORMAL', label: 'Normal', tone: 'success', color: '#17b26a' },
]

export const ROLES: (Option<Role> & { tone: Tone })[] = [
  { value: 'admin', label: 'Administrateur', tone: 'brand' },
  { value: 'hospital_staff', label: 'Personnel hospitalier', tone: 'info' },
  { value: 'ambulance_driver', label: 'Ambulancier', tone: 'warning' },
  { value: 'donor', label: 'Donneur', tone: 'success' },
]

/** Rôles ayant accès à l'interface web (les autres utilisent l'application mobile). */
export const WEB_ROLES: Role[] = ['admin', 'hospital_staff']

export function labelOf<T extends string>(options: readonly Option<T>[], value: T | null | undefined): string {
  if (value == null) return '—'
  return options.find((option) => option.value === value)?.label ?? value
}

export function toneOf<T extends string>(
  options: readonly (Option<T> & { tone: Tone })[],
  value: T | null | undefined,
): Tone {
  return options.find((option) => option.value === value)?.tone ?? 'neutral'
}

/** Centre géographique du Sénégal et de Dakar (cartes). */
export const SENEGAL_CENTER: [number, number] = [14.45, -14.45]
export const DAKAR_CENTER: [number, number] = [14.6928, -17.4467]
