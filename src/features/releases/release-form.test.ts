import { describe, expect, it } from 'vitest'
import { compareVersions, isDownloadLink, noteLines, releaseProblem } from './release-form'

const draft = {
  version: '1.3.0',
  build: 13,
  notes: 'Search in live chat',
  downloadUrl: 'https://example.com/mela-13.apk',
}
const latest = { version: '1.2.0', build: 12 }

describe('publishing an app update', () => {
  it('a newer version and build with notes and a link is ready', () => {
    expect(releaseProblem(draft, latest)).toBeNull()
    expect(releaseProblem({ ...draft, version: '1.2.0' }, latest)).toBeNull()
    expect(releaseProblem({ ...draft, build: 1 }, null)).toBeNull()
  })

  it('says what is missing or wrong, one thing at a time', () => {
    expect(releaseProblem({ ...draft, version: '1.3' }, latest)).toMatch(/three numbers/)
    expect(releaseProblem({ ...draft, build: Number('') }, latest)).toMatch(/whole number/)
    expect(releaseProblem({ ...draft, build: 12.5 }, latest)).toMatch(/whole number/)
    expect(releaseProblem({ ...draft, build: 12 }, latest)).toBe('The build number must be higher than 12.')
    expect(releaseProblem({ ...draft, version: '1.1.9' }, latest)).toBe("The version can't be lower than 1.2.0.")
    expect(releaseProblem({ ...draft, notes: '' }, latest)).toBe("Say what's new.")
    expect(releaseProblem({ ...draft, downloadUrl: 'http://example.com/mela.apk' }, latest)).toMatch(/https/)
  })

  it('compares versions as numbers, part by part', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0)
    expect(compareVersions('2.0.0', '10.0.0')).toBeLessThan(0)
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
  })

  it('downloads only over https, or from this machine while developing', () => {
    expect(isDownloadLink('https://play.google.com/store/apps/details?id=com.melalive.app')).toBe(true)
    expect(isDownloadLink('http://localhost:9090/mela.apk')).toBe(true)
    expect(isDownloadLink('http://192.168.0.5/mela.apk')).toBe(false)
    expect(isDownloadLink('javascript:alert(1)')).toBe(false)
  })

  it('shows one point per line, without the bullets people type', () => {
    expect(noteLines('- Faster lives\n\n• Search in chat\n  * Fixes  \n')).toEqual(['Faster lives', 'Search in chat', 'Fixes'])
  })
})
