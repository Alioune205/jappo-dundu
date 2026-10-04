/** Contrôles de saisie côté téléphone ; le serveur reste juge (unicité, format du numéro). */
import type { FieldErrors } from '@/lib/api'
import { ageOn, parseFrDate, toIsoDate } from '@/lib/dates'
import type { BloodGroup, RegionCode, Sex } from '@/types/api'

export interface RegistrationForm {
  first_name: string
  last_name: string
  /** Saisie libre : « 77 123 45 67 », « 771234567 »… (le préfixe +221 est affiché à part). */
  phone_number: string
  region: RegionCode | null
  password: string
  confirm: string
  terms: boolean
}

export const EMPTY_REGISTRATION: RegistrationForm = {
  first_name: '',
  last_name: '',
  phone_number: '',
  region: null,
  password: '',
  confirm: '',
  terms: false,
}

/** Les 9 chiffres nationaux d'un numéro sénégalais (préfixes +221 / 00221 retirés), ou null. */
export function nationalDigits(phone: string): string | null {
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('00221')) digits = digits.slice(5)
  else if (digits.startsWith('221') && digits.length === 12) digits = digits.slice(3)
  return /^[37]\d{8}$/.test(digits) ? digits : null
}

/** Affichage groupé pendant la frappe : « 77 123 45 67 ». */
export function formatPhoneInput(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 9)
  return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(' ')
}

/** Solidité indicative d'un mot de passe (0 à 3) ; le serveur reste juge. */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 {
  if (password.length < 8) return 0
  let score = 1
  if (/[a-zA-Z]/.test(password) && /\d/.test(password)) score += 1
  if (password.length >= 12 || /[^a-zA-Z0-9]/.test(password)) score += 1
  return Math.min(3, score) as 1 | 2 | 3
}

export function validateRegistration(form: RegistrationForm): FieldErrors {
  const errors: FieldErrors = {}
  if (!form.first_name.trim()) errors.first_name = ['Prénom requis.']
  if (!form.last_name.trim()) errors.last_name = ['Nom requis.']
  if (!nationalDigits(form.phone_number)) errors.phone_number = ['Numéro à 9 chiffres, ex. 77 123 45 67.']
  if (!form.region) errors.region = ['Choisissez votre région.']
  if (form.password.length < 8) errors.password = ['8 caractères minimum.']
  else if (/^\d+$/.test(form.password)) errors.password = ['Pas uniquement des chiffres.']
  if (!errors.password && form.confirm !== form.password) errors.confirm = ['Les deux mots de passe diffèrent.']
  if (!form.terms) errors.terms = ['Acceptez les conditions pour continuer.']
  return errors
}

// =============================================================
// Profil donneur
// =============================================================

export const MIN_DONOR_AGE = 18
export const MAX_DONOR_AGE = 65

export interface DonorForm {
  blood_group: BloodGroup | null
  sex: Sex | null
  /** Saisie « JJ/MM/AAAA ». */
  date_of_birth: string
  /** Saisie « JJ/MM/AAAA », facultative. */
  last_donation_date: string
  is_available: boolean
}

export const EMPTY_DONOR: DonorForm = {
  blood_group: null,
  sex: null,
  date_of_birth: '',
  last_donation_date: '',
  is_available: true,
}

/**
 * Mêmes règles que le serveur (sang/serializers.py, sang/eligibility.py) :
 * le donneur corrige avant d'envoyer. Au-delà de 65 ans, le profil reste
 * enregistrable : le serveur le marque inéligible et l'écran Alertes l'explique.
 */
export function validateDonor(form: DonorForm, today = new Date()): FieldErrors {
  const errors: FieldErrors = {}
  if (!form.blood_group) errors.blood_group = ['Choisissez votre groupe sanguin.']
  if (!form.sex) errors.sex = ['Précisez votre sexe : il fixe le délai entre deux dons.']

  const birth = parseFrDate(form.date_of_birth)
  const age = birth ? ageOn(birth, today) : null
  if (!birth || age === null || birth > toIsoDate(today) || Number(birth.slice(0, 4)) < 1900) {
    errors.date_of_birth = ['Date au format JJ/MM/AAAA.']
  } else if (age < MIN_DONOR_AGE) {
    errors.date_of_birth = [`Il faut avoir au moins ${MIN_DONOR_AGE} ans pour donner son sang.`]
  }

  if (form.last_donation_date.trim()) {
    const last = parseFrDate(form.last_donation_date)
    if (!last) errors.last_donation_date = ['Date au format JJ/MM/AAAA, ou laissez vide.']
    else if (last > toIsoDate(today)) errors.last_donation_date = ['Cette date est dans le futur.']
    else if (birth && last < birth) errors.last_donation_date = ['Antérieure à votre date de naissance.']
  }
  return errors
}
