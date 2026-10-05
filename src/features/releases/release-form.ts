import type { AppRelease } from '../../lib/types'

/** major.minor.patch, as people see it - the same rule as the server's. */
export const VERSION_PATTERN = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/

export interface ReleaseDraft {
  version: string
  build: number
  notes: string
  downloadUrl: string
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

/** https anywhere; plain http only to this machine, while developing. */
export function isDownloadLink(url: string): boolean {
  return /^https:\/\/\S+$/i.test(url) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/\S*)?$/i.test(url)
}

/** What still keeps [draft] from being published after [latest], or null when it can be. */
export function releaseProblem(draft: ReleaseDraft, latest: Pick<AppRelease, 'version' | 'build'> | null): string | null {
  if (!VERSION_PATTERN.test(draft.version)) return 'Write the version as three numbers, like 1.2.0.'
  if (!Number.isInteger(draft.build) || draft.build < 1) return 'Give the build number - a whole number.'
  if (latest && draft.build <= latest.build) return `The build number must be higher than ${latest.build}.`
  if (latest && compareVersions(draft.version, latest.version) < 0) return `The version can't be lower than ${latest.version}.`
  if (draft.notes.length < 3) return "Say what's new."
  if (!isDownloadLink(draft.downloadUrl)) return 'Give the download link, starting with https://.'
  return null
}

/** The points the app shows for [notes]: one a line, bullets and blank lines dropped. */
export function noteLines(notes: string): string[] {
  return notes
    .split('\n')
    .map((line) => line.replace(/^\s*[-*•]\s*/, '').trim())
    .filter(Boolean)
}
