// How long it lasts; null: until someone lifts it.
export const DURATIONS: Array<{ value: string; label: string; hours: number | null }> = [
  { value: 'lifted', label: 'Until the team lifts it', hours: null },
  { value: '24h', label: '24 hours', hours: 24 },
  { value: '3d', label: '3 days', hours: 72 },
  { value: '7d', label: '7 days', hours: 168 },
  { value: '30d', label: '30 days', hours: 720 },
]
