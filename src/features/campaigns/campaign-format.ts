import type { Announcement, CampaignAudience } from '../../lib/types'

const pad = (value: number) => String(value).padStart(2, '0')

/** An instant as a datetime-local field shows it: the admin's own time zone, to the minute. */
export function toLocalInput(value: string | Date | null | undefined): string {
  if (!value) return ''
  const at = new Date(value)
  if (Number.isNaN(at.getTime())) return ''
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`
}

/** A datetime-local field's value as an ISO instant; null when blank or unreadable. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null
  const at = new Date(value)
  return Number.isNaN(at.getTime()) ? null : at.toISOString()
}

/** "/live/<id>" or "/profile/<id>" out of what staff paste: the path itself, or a Mela share link. */
export function appPathOf(value: string): string | null {
  const match = value.trim().match(/\/(live|profile)\/([0-9a-fA-F-]{36})(?:[/?#]|$)/)
  return match ? `/${match[1]}/${match[2]}` : null
}

/** Who it's for, in words: "Android · hosts · not seen for 14 days". */
export function audienceText(audience: CampaignAudience): string {
  const parts = [
    audience.platform === 'ANDROID' ? 'Android' : audience.platform === 'IOS' ? 'iPhone' : null,
    audience.appVersions?.length ? `version ${audience.appVersions.join(', ')}` : null,
    audience.hostsOnly ? 'hosts' : null,
    audience.activeWithinDays ? `active in the last ${audience.activeWithinDays} days` : null,
    audience.inactiveForDays ? `not seen for ${audience.inactiveForDays} days` : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Everyone'
}

export const BANNER_STATES = { showing: 'Showing now', upcoming: 'Starts later', ended: 'Ended' } as const

export function bannerState(
  banner: Pick<Announcement, 'startsAt' | 'endsAt'>,
  now: Date = new Date(),
): keyof typeof BANNER_STATES {
  if (banner.endsAt && new Date(banner.endsAt) <= now) return 'ended'
  return new Date(banner.startsAt) > now ? 'upcoming' : 'showing'
}
