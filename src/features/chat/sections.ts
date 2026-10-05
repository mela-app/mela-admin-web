import type { LiveChatLive } from '../../lib/types'

export interface ChatSection<M> {
  streamId: string
  // Undefined only if the live wasn't sent along.
  live: LiveChatLive | undefined
  messages: M[]
}

/**
 * [messages], oldest first, in runs from the same live - a new run each
 * time the live changes. A host runs one live at a time, so a run is a live.
 */
export function chatSections<M extends { streamId: string }>(messages: M[], lives: LiveChatLive[]): Array<ChatSection<M>> {
  const byId = new Map(lives.map((live) => [live.id, live]))
  const sections: Array<ChatSection<M>> = []
  for (const message of messages) {
    const last = sections.at(-1)
    if (last && last.streamId === message.streamId) {
      last.messages.push(message)
    } else {
      sections.push({ streamId: message.streamId, live: byId.get(message.streamId), messages: [message] })
    }
  }
  return sections
}
