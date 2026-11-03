import type { AnalyticsOverview, SessionPlatform } from '../../lib/types'

const quote = (value: string | number) => {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** The days of [data] as CSV, one row a day - for a spreadsheet. */
export function analyticsCsv(data: AnalyticsOverview): string {
  const header = [
    'Day (UTC)',
    'Active users',
    'New accounts',
    'Installs',
    'Lives started',
    'Minutes live',
    'Minutes watched',
  ]
  const rows = data.days.map((day) => [
    day.day,
    day.activeUsers,
    day.newUsers,
    day.installs,
    day.lives,
    day.liveMinutes,
    day.viewerMinutes,
  ])
  return [header, ...rows].map((row) => row.map(quote).join(',')).join('\n') + '\n'
}

/** Hands [csv] to the browser as a file download. */
export function downloadCsv(csv: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

export const SOURCE_LABELS: Record<string, string> = {
  shared_live: 'A shared live',
  shared_profile: 'A shared profile',
  play_store: 'Google Play',
  campaign: 'A campaign link',
  other: 'Other',
}

// What people used Mela on; the web player and older app versions don't say.
export const PHONE_LABELS: Record<SessionPlatform, string> = {
  ANDROID: 'Android',
  IOS: 'iPhone',
  WEB: 'Web',
  UNKNOWN: 'Not reported',
}

const dayOf = (at: Date) => at.toISOString().slice(0, 10)

/** The last [days] UTC days, today included. */
export function rangeEnding(days: number, now: Date = new Date()): { from: string; to: string } {
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const from = new Date(to.getTime() - (days - 1) * 24 * 60 * 60 * 1000)
  return { from: dayOf(from), to: dayOf(to) }
}
