import { MessageSquareText } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/feedback'
import { useChatLog, type ChatLogFilter } from '../../lib/queries'
import { useChatModeration } from './chat-moderation'
import { ChatFilters, ChatMessageRow } from './ChatMessages'

interface ChatLogProps {
  streamId: string
  hostId: string
  live: boolean
}

/** The live's whole chat, as the room saw it and as the filters left it. */
export function ChatLog({ streamId, hostId, live }: ChatLogProps) {
  const [filter, setFilter] = useState<ChatLogFilter>({})
  const log = useChatLog(streamId, filter, live)
  const moderation = useChatModeration()
  const messages = log.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 p-4">
        <ChatFilters filter={filter} onChange={(patch) => setFilter((current) => ({ ...current, ...patch }))} />
        {live && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-zinc-500">
            <span className="size-1.5 rounded-full bg-red-500" aria-hidden />
            Updating as the live runs
          </span>
        )}
      </div>

      {log.isPending && (
        <div className="space-y-4 p-5">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="flex gap-3">
              <Skeleton className="size-7 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3.5 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      )}
      {log.isError && !log.data && <ErrorState error={log.error} onRetry={() => void log.refetch()} />}
      {log.data && messages.length === 0 && (
        <EmptyState
          icon={<MessageSquareText />}
          title={filter.q || filter.status ? 'No matching messages' : 'No messages yet'}
          description={filter.q || filter.status ? 'Try another search or filter.' : 'Chat messages appear here as they are sent.'}
        />
      )}
      {moderation.pickBar(messages)}
      {messages.length > 0 && (
        <ol className="divide-y divide-zinc-100" aria-label="Chat messages, newest first">
          {messages.map((message) => (
            <ChatMessageRow
              key={message.id}
              message={message}
              hostId={hostId}
              {...moderation.actionsFor(streamId, hostId, message)}
            />
          ))}
        </ol>
      )}
      {log.hasNextPage && (
        <div className="border-t border-zinc-200 p-3 text-center">
          <Button size="sm" loading={log.isFetchingNextPage} onClick={() => void log.fetchNextPage()}>
            Load older messages
          </Button>
        </div>
      )}

      {moderation.dialogs}
    </div>
  )
}
