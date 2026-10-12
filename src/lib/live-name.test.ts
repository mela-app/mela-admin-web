import { describe, expect, it } from 'vitest'
import { liveName } from './live-name'

describe('liveName', () => {
  it("shows a title when there is one, else the host's live", () => {
    expect(liveName({ title: 'Bingo night', host: { displayName: 'Abebe' } })).toBe('Bingo night')
    expect(liveName({ title: '', host: { displayName: 'Abebe' } })).toBe("Abebe's live")
    expect(liveName({ title: '  ', host: { username: 'abebe' } })).toBe("@abebe's live")
    expect(liveName({ title: '' })).toBe('Untitled live')
  })
})
