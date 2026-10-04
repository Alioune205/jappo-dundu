/**
 * Formatage (fuseau Africa/Dakar, conventions françaises).
 */

const TIME_ZONE = 'Africa/Dakar'
const LOCALE = 'fr-FR'

const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})
const dateFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})
const shortDateFormat = new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, day: '2-digit', month: 'short' })
const timeFormat = new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' })
const numberFormat = new Intl.NumberFormat(LOCALE)
const relativeFormat = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' })

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDateTime(value: string | Date | null | undefined): string {
  const date = toDate(value)
  return date ? dateTimeFormat.format(date) : '—'
}

/** Date seule (champ `DateField` AAAA-MM-JJ : interprété à midi pour éviter tout décalage de jour). */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = toDate(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value)
  return date ? dateFormat.format(date) : '—'
}

export function formatShortDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = toDate(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value)
  return date ? shortDateFormat.format(date) : '—'
}

export function formatTime(value: string | Date | null | undefined): string {
  const date = toDate(value)
  return date ? timeFormat.format(date) : '—'
}

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value == null || Number.isNaN(value)) return '—'
  return digits
    ? new Intl.NumberFormat(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
    : numberFormat.format(value)
}

/** Taux entre 0 et 1 → « 87 % ». */
export function formatPercent(rate: number | null | undefined, digits = 0): string {
  if (rate == null || Number.isNaN(rate)) return '—'
  return new Intl.NumberFormat(LOCALE, {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(rate)
}

export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes == null) return '—'
  if (minutes < 60) return `${formatNumber(minutes, minutes < 10 ? 1 : 0)} min`
  const hours = Math.floor(minutes / 60)
  const rest = Math.round(minutes % 60)
  return rest ? `${hours} h ${String(rest).padStart(2, '0')}` : `${hours} h`
}

export function formatDistance(km: number | null | undefined): string {
  if (km == null) return '—'
  return km < 1 ? `${Math.round(km * 1000)} m` : `${formatNumber(km, km < 10 ? 1 : 0)} km`
}

/** « il y a 5 min », « dans 2 h »… `now` est fourni par l'appelant (rendu pur). */
export function formatRelative(value: string | Date | null | undefined, now: number): string {
  const date = toDate(value)
  if (!date) return '—'
  const seconds = Math.round((date.getTime() - now) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 45) return "à l'instant"
  if (abs < 3600) return relativeFormat.format(Math.round(seconds / 60), 'minute')
  if (abs < 86400) return relativeFormat.format(Math.round(seconds / 3600), 'hour')
  if (abs < 86400 * 30) return relativeFormat.format(Math.round(seconds / 86400), 'day')
  return formatDate(date.toISOString())
}

/** +221771234567 → +221 77 123 45 67 */
export function formatPhone(value: string | null | undefined): string {
  if (!value) return '—'
  const match = /^\+221(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(value)
  return match ? `+221 ${match[1]} ${match[2]} ${match[3]} ${match[4]}` : value
}

/** Valeur d'un <input type="datetime-local"> (heure locale du poste) → ISO 8601 UTC. */
export function localInputToIso(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** ISO 8601 → valeur d'un <input type="datetime-local"> (heure locale du poste). */
export function isoToLocalInput(value: string | null | undefined): string {
  const date = toDate(value)
  if (!date) return ''
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

/** Date du jour (AAAA-MM-JJ) dans le fuseau de Dakar. */
export function todayInDakar(now: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date(now))
}

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?'
  )
}
