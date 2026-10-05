import { describe, expect, it } from 'vitest'
import type { LiveChatLive } from '../../lib/types'
import { chatSections } from './sections'

const live = (id: string): LiveChatLive => ({
  id,
  title: `Live ${id}`,
  category: null,
  status: 'ENDED',
  startedAt: '2026-10-04T08:00:00.000Z',
  endedAt: '2026-10-04T09:00:00.000Z',
  messageCount: 2,
})

describe('chatSections', () => {
  it('groups the day into one run of messages per live, in order', () => {
    const messages = [
      { id: 'm1', streamId: 's1' },
      { id: 'm2', streamId: 's1' },
      { id: 'm3', streamId: 's2' },
      { id: 'm4', streamId: 's2' },
    ]

    const sections = chatSections(messages, [live('s1'), live('s2')])

    expect(sections.map((section) => [section.live?.title, section.messages.map((message) => message.id)])).toEqual([
      ['Live s1', ['m1', 'm2']],
      ['Live s2', ['m3', 'm4']],
    ])
  })

  it('a message from a live it was not told about still shows, without its heading', () => {
    expect(chatSections([{ id: 'm1', streamId: 'gone' }], [live('s1')])).toEqual([
      { streamId: 'gone', live: undefined, messages: [{ id: 'm1', streamId: 'gone' }] },
    ])
    expect(chatSections([], [live('s1')])).toEqual([])
  })
})
