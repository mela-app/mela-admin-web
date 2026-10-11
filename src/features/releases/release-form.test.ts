import { describe, expect, it } from 'vitest'
import { compareVersions, noteLines, releaseProblem, whereFrom } from './release-form'

const draft = { version: '1.3.0', notes: 'Search in live chat' }
const latest = { version: '1.2.0' }

describe('publishing an app update', () => {
  it('a newer version with notes is ready - no build number, no link', () => {
    expect(releaseProblem(draft, latest)).toBeNull()
    expect(releaseProblem({ ...draft, version: '1.2.1' }, latest)).toBeNull()
    expect(releaseProblem(draft, null)).toBeNull()
  })

  it('says what is missing or wrong, one thing at a time', () => {
    expect(releaseProblem({ ...draft, version: '1.3' }, latest)).toMatch(/three numbers/)
    expect(releaseProblem({ ...draft, version: '1.2.0' }, latest)).toBe('The version must be newer than 1.2.0.')
    expect(releaseProblem({ ...draft, version: '1.1.9' }, latest)).toBe('The version must be newer than 1.2.0.')
    expect(releaseProblem({ ...draft, notes: '' }, latest)).toBe("Say what's new.")
  })

  it('compares versions as numbers, part by part', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0)
    expect(compareVersions('2.0.0', '10.0.0')).toBeLessThan(0)
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
  })

  it('says where phones get it', () => {
    expect(whereFrom({ platform: 'ANDROID', downloadUrl: null })).toBe('Google Play')
    expect(whereFrom({ platform: 'IOS', downloadUrl: null })).toBe('App Store')
    expect(whereFrom({ platform: 'ANDROID', downloadUrl: 'https://example.com/mela-12.apk' })).toBe('example.com')
  })

  it('shows one point per line, without the bullets people type', () => {
    expect(noteLines('- Faster lives\n\n• Search in chat\n  * Fixes  \n')).toEqual(['Faster lives', 'Search in chat', 'Fixes'])
  })
})
