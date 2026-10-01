const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const dateOnly = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
const precise = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZoneName: 'short',
})
const stamp = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
})
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
const number = new Intl.NumberFormat()
const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 })

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value)
}

export function formatDateTime(value: string | Date | null | undefined): string {
  return value ? dateTime.format(toDate(value)) : '—'
}

export function formatDate(value: string | Date | null | undefined): string {
  return value ? dateOnly.format(toDate(value)) : '—'
}

/** Down to the second, with the time zone - for the audit trail. */
export function formatPrecise(value: string | Date | null | undefined): string {
  return value ? precise.format(toDate(value)) : '—'
}

/** Down to the second, without the zone - for a table column. */
export function formatTimestamp(value: string | Date | null | undefined): string {
  return value ? stamp.format(toDate(value)) : '—'
}

export function formatRelative(value: string | Date | null | undefined, now: Date = new Date()): string {
  if (!value) return 'Never'
  const seconds = Math.round((toDate(value).getTime() - now.getTime()) / 1000)
  if (Math.abs(seconds) < 45) return 'just now'
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit)
  }
  return relative.format(Math.round(seconds / 60), 'minute')
}

export function formatNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : number.format(value)
}

export function formatCompact(value: number): string {
  return value < 10_000 ? number.format(value) : compact.format(value)
}

/** 1:02:03 or 4:05 - how long a live ran. */
export function formatDuration(fromIso: string, toIso?: string | null, now: Date = new Date()): string {
  const end = toIso ? new Date(toIso) : now
  const total = Math.max(0, Math.round((end.getTime() - new Date(fromIso).getTime()) / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

/** A `<input type="date">` value as the start or end of that local day, in ISO. */
export function dayBoundary(day: string | undefined, edge: 'start' | 'end'): string | undefined {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined
  const [year, month, date] = day.split('-').map(Number)
  const local =
    edge === 'start' ? new Date(year, month - 1, date, 0, 0, 0, 0) : new Date(year, month - 1, date, 23, 59, 59, 999)
  return local.toISOString()
}

/** The local calendar day of [value], as a `<input type="date">` value. */
export function localDay(value: string | Date = new Date()): string {
  const date = toDate(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** [day] moved by [days] calendar days. */
export function addDays(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number)
  return localDay(new Date(year, month - 1, date + days))
}

const weekdayDate = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

/** "Today", "Yesterday", or the full date of a `<input type="date">` value. */
export function formatDay(day: string, now: Date = new Date()): string {
  if (day === localDay(now)) return 'Today'
  if (day === addDays(localDay(now), -1)) return 'Yesterday'
  const [year, month, date] = day.split('-').map(Number)
  return weekdayDate.format(new Date(year, month - 1, date))
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] ?? '?').slice(0, 2)
  return letters.toUpperCase()
}
