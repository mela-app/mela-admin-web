/** Who a live is shown as, for one without a title. */
interface LiveHost {
  displayName?: string | null
  username?: string | null
}

/**
 * What a live is called in the console. Lives have no title of their own any
 * more (the app stopped asking, 2026-10) - only one started from a scheduled
 * live keeps that one's title - so most read as their host's: "Abebe's live".
 */
export function liveName(live: { title?: string | null; host?: LiveHost | null }): string {
  const title = live.title?.trim()
  if (title) return title
  const host = live.host?.displayName || (live.host?.username ? `@${live.host.username}` : null)
  return host ? `${host}'s live` : 'Untitled live'
}
