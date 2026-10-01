import { describe, expect, it } from 'vitest'
import { addDays, dayBoundary, formatDay, formatDuration, formatRelative, initials, localDay } from './format'

describe('format', () => {
  it('shows how long a live ran', () => {
    expect(formatDuration('2026-09-27T10:00:00Z', '2026-09-27T10:04:05Z')).toBe('4:05')
    expect(formatDuration('2026-09-27T10:00:00Z', '2026-09-27T11:02:03Z')).toBe('1:02:03')
    expect(formatDuration('2026-09-27T10:00:00Z', '2026-09-27T09:00:00Z')).toBe('0:00')
  })

  it('says roughly when something happened', () => {
    const now = new Date('2026-09-27T12:00:00Z')
    expect(formatRelative('2026-09-27T11:59:50Z', now)).toBe('just now')
    expect(formatRelative('2026-09-27T11:55:00Z', now)).toMatch(/5 minutes ago/)
    expect(formatRelative('2026-09-25T12:00:00Z', now)).toMatch(/2 days ago/)
    expect(formatRelative(null, now)).toBe('Never')
  })

  it('turns a picked day into the start or end of that local day', () => {
    const start = new Date(dayBoundary('2026-09-27', 'start')!)
    const end = new Date(dayBoundary('2026-09-27', 'end')!)
    expect([start.getFullYear(), start.getMonth(), start.getDate(), start.getHours()]).toEqual([2026, 8, 27, 0])
    expect([end.getDate(), end.getHours(), end.getMinutes()]).toEqual([27, 23, 59])
    expect(dayBoundary('not-a-day', 'start')).toBeUndefined()
    expect(dayBoundary(undefined, 'end')).toBeUndefined()
  })

  it('makes initials for an avatar', () => {
    expect(initials('Tsegaye Abewa')).toBe('TA')
    expect(initials('mia')).toBe('MI')
    expect(initials('  ')).toBe('?')
  })

  it('steps through local calendar days, across months and years', () => {
    expect(localDay(new Date(2026, 8, 30, 23, 59))).toBe('2026-09-30')
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
  })

  it('names today and yesterday, and spells out other days', () => {
    const now = new Date(2026, 8, 30, 12)
    expect(formatDay('2026-09-30', now)).toBe('Today')
    expect(formatDay('2026-09-29', now)).toBe('Yesterday')
    expect(formatDay('2026-09-01', now)).toMatch(/2026/)
  })
})
