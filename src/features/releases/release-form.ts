import type { AppRelease } from '../../lib/types'

/** major.minor.patch, as people see it - the same rule as the server's. */
export const VERSION_PATTERN = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/

/**
 * A release is a version and what's new in it: phones compare versions and
 * get the update from Google Play or the App Store - no build number, no link.
 */
export interface ReleaseDraft {
  version: string
  notes: string
}

/** Below zero when [a] is older than [b]; both match VERSION_PATTERN. */
export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number)
  const right = b.split('.').map(Number)
  for (let part = 0; part < 3; part++) {
    const difference = (left[part] ?? 0) - (right[part] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

/** What still keeps [draft] from being published after [latest], or null when it can be. */
export function releaseProblem(draft: ReleaseDraft, latest: Pick<AppRelease, 'version'> | null): string | null {
  if (!VERSION_PATTERN.test(draft.version)) return 'Write the version as three numbers, like 1.2.0.'
  if (latest && compareVersions(draft.version, latest.version) <= 0) {
    return `The version must be newer than ${latest.version}.`
  }
  if (draft.notes.length < 3) return "Say what's new."
  return null
}

/** The points the app shows for [notes]: one a line, bullets and blank lines dropped. */
export function noteLines(notes: string): string[] {
  return notes
    .split('\n')
    .map((line) => line.replace(/^\s*[-*•]\s*/, '').trim())
    .filter(Boolean)
}

/** "Google Play", "App Store", or the host of an older release's own link. */
export function whereFrom(release: Pick<AppRelease, 'platform' | 'downloadUrl'>): string {
  if (!release.downloadUrl) return release.platform === 'IOS' ? 'App Store' : 'Google Play'
  try {
    return new URL(release.downloadUrl).host
  } catch {
    return release.downloadUrl
  }
}
