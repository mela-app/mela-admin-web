import type { VideoProviderKind } from '../../lib/types'

export const PROVIDER_NAMES: Record<VideoProviderKind, string> = { AGORA: 'Agora', LIVEKIT: 'LiveKit' }

/** Until [iso], roughly: "3 days", "5 h", "12 min". */
export function timeUntil(iso: string, now: Date = new Date()): string {
  const left = Math.max(0, new Date(iso).getTime() - now.getTime())
  const mins = Math.round(left / 60_000)
  if (mins < 60) return `${mins} min`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours} h`
  return `${Math.round(hours / 24)} days`
}
