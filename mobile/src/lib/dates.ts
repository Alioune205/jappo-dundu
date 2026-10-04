/**
 * Dates en français, sans dépendre de l'Intl du moteur JS (incomplet selon
 * les versions d'Hermes) : rendu identique sur tous les téléphones et en test.
 */
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

const pad = (n: number) => String(n).padStart(2, '0')

/** « AAAA-MM-JJ » (format API) → Date locale à minuit, ou null. */
export function fromIsoDate(value: string | null | undefined): Date | null {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

export function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Saisie « JJ/MM/AAAA » → « AAAA-MM-JJ », ou null si la date n'existe pas
 * (31/02, 00/01…). Les séparateurs « / », « . », « - » et espace sont acceptés.
 */
export function parseFrDate(input: string): string | null {
  const match = /^\s*(\d{1,2})[/.\- ](\d{1,2})[/.\- ](\d{4})\s*$/.exec(input)
  if (!match) return null
  const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return toIsoDate(date)
}

/** « AAAA-MM-JJ » → « JJ/MM/AAAA » (valeur initiale d'un champ). */
export function toFrInput(iso: string | null | undefined) {
  const date = fromIsoDate(iso)
  return date ? `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}` : ''
}

/** Masque de saisie : ajoute les « / » au fil de la frappe (chiffres seuls). */
export function maskFrDate(raw: string) {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

/** « 12 mars 2025 » ; année omise si c'est l'année en cours et `short`. */
export function formatDate(value: string | Date | null | undefined, { short = false } = {}) {
  const date = typeof value === 'string' ? (value.length > 10 ? new Date(value) : fromIsoDate(value)) : value
  if (!date || Number.isNaN(date.getTime())) return ''
  const months = short ? MONTHS_SHORT : MONTHS
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return `${date.getDate()} ${months[date.getMonth()]}${short && sameYear ? '' : ` ${date.getFullYear()}`}`
}

export function formatTime(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function monthLabel(date: Date) {
  const label = `${MONTHS[date.getMonth()]} ${date.getFullYear()}`
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** « à l'instant », « il y a 12 min », « il y a 3 h », « hier », puis la date. */
export function timeAgo(value: string | number | Date, now = Date.now()) {
  const time = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : new Date(value).getTime()
  const seconds = Math.max(0, Math.round((now - time) / 1000))
  if (seconds < 45) return 'à l’instant'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `il y a ${hours} h`
  if (hours < 48) return 'hier'
  return `le ${formatDate(new Date(time), { short: true })}`
}

/** Échéance d'une demande : « avant 18:00 », « avant demain 08:00 », « avant le 14 mars ». */
export function deadline(value: string, now = new Date()) {
  const date = new Date(value)
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOf(date) - startOf(now)) / 86_400_000)
  if (days <= 0) return `avant ${formatTime(date)}`
  if (days === 1) return `avant demain ${formatTime(date)}`
  return `avant le ${formatDate(date, { short: true })}`
}

/** Âge révolu à une date donnée. */
export function ageOn(birthIso: string, today = new Date()) {
  const birth = fromIsoDate(birthIso)
  if (!birth) return null
  let age = today.getFullYear() - birth.getFullYear()
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age -= 1
  return age
}

/** Nombre de jours entiers entre aujourd'hui et une date (négatif si passée). */
export function daysUntil(iso: string, today = new Date()) {
  const date = fromIsoDate(iso)
  if (!date) return null
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((date.getTime() - start.getTime()) / 86_400_000)
}
