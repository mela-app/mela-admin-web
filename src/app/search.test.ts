import { describe, expect, it } from 'vitest'
import { appUpdatesSearch, auditSearch, liveChatSearch, messagesSearch, safeRedirect, streamsSearch, usersSearch } from './search'

describe('search params', () => {
  it('keeps valid filters and drops anything else', () => {
    expect(usersSearch({ q: '  ana ', status: 'SUSPENDED', role: 'GOD', sort: 'username', order: 'up', page: '3' })).toEqual({
      q: 'ana',
      status: 'SUSPENDED',
      role: undefined,
      sort: 'username',
      order: undefined,
      page: 3,
      pageSize: undefined,
    })
  })

  it('keeps defaults out of the URL', () => {
    expect(streamsSearch({ page: 1, pageSize: 25, sort: 'startedAt' })).toMatchObject({
      page: undefined,
      pageSize: undefined,
      sort: undefined,
    })
    expect(streamsSearch({ pageSize: 50 }).pageSize).toBe(50)
    expect(streamsSearch({ pageSize: 33 }).pageSize).toBeUndefined()
  })

  it('only accepts real calendar-day inputs for date ranges', () => {
    expect(auditSearch({ from: '2026-09-01', to: '2026-09-30T00:00' })).toMatchObject({ from: '2026-09-01', to: undefined })
  })

  it('keeps the private messages day, person and open conversation', () => {
    expect(messagesSearch({ day: '2026-09-29', q: ' ana ', userId: 'u1', conversation: 'c1', page: '2' })).toEqual({
      day: '2026-09-29',
      q: 'ana',
      userId: 'u1',
      conversation: 'c1',
      page: 2,
      pageSize: undefined,
    })
    // No day means today.
    expect(messagesSearch({ day: 'yesterday' }).day).toBeUndefined()
  })

  it('keeps the live chat day, host search and open host', () => {
    expect(liveChatSearch({ day: '2026-10-04', q: ' ana ', host: 'u1', page: '2', conversation: 'c1' })).toEqual({
      day: '2026-10-04',
      q: 'ana',
      host: 'u1',
      page: 2,
      pageSize: undefined,
    })
    expect(liveChatSearch({}).day).toBeUndefined()
    expect(appUpdatesSearch({ page: '3', platform: 'IOS' })).toEqual({ page: 3, pageSize: undefined })
  })

  it('never redirects off the console after sign-in', () => {
    expect(safeRedirect('/users?q=ana')).toBe('/users?q=ana')
    expect(safeRedirect('https://evil.example')).toBeUndefined()
    expect(safeRedirect('//evil.example')).toBeUndefined()
    expect(safeRedirect('/\\evil.example')).toBeUndefined()
    expect(safeRedirect('/login')).toBeUndefined()
    expect(safeRedirect(42)).toBeUndefined()
  })
})
