import { Link } from '@tanstack/react-router'
import { MessageSquareText, Trash, UserX } from 'lucide-react'
import { useState } from 'react'
import { MessageStatusBadge } from '../../components/StatusBadges'
import { Button, IconButton } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/feedback'
import { Select } from '../../components/ui/forms'
import { Avatar } from '../../components/ui/misc'
import { SearchInput } from '../../components/ui/SearchInput'
import { useAuth } from '../../lib/auth-context'
import { cn } from '../../lib/cn'
import { formatPrecise } from '../../lib/format'
import { actions, useAdminMutation, useChatLog, type ChatLogFilter } from '../../lib/queries'
import type { ChatLogEntry, ChatModerationStatus } from '../../lib/types'
import { SuspendUserDialog } from '../users/UserActionDialogs'

const timeOnly = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })

interface ChatLogProps {
  streamId: string
  hostId: string
  live: boolean
}

/** The live's whole chat, as the room saw it and as the filters left it. */
export function ChatLog({ streamId, hostId, live }: ChatLogProps) {
  const auth = useAuth()
  const canDelete = auth.can('MANAGE_LIVES')
  const canSuspend = auth.can('MANAGE_USERS')
  const [filter, setFilter] = useState<ChatLogFilter>({})
  const log = useChatLog(streamId, filter, live)
  const [deleting, setDeleting] = useState<ChatLogEntry | null>(null)
  const [suspending, setSuspending] = useState<ChatLogEntry['user'] | null>(null)
  const remove = useAdminMutation(
    ({ messageId }: { messageId: string }) => actions.deleteMessage(streamId, messageId),
    { toastErrors: false, success: 'Message deleted. It disappears from everyone’s chat.' },
  )
  const messages = log.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 p-4">
        <SearchInput
          className="w-full sm:w-72"
          value={filter.q}
          onChange={(q) => setFilter((current) => ({ ...current, q }))}
          placeholder="Search messages…"
        />
        <Select
          aria-label="Messages to show"
          className="w-48"
          value={filter.status ?? ''}
          onChange={(event) =>
            setFilter((current) => ({ ...current, status: (event.target.value || undefined) as ChatModerationStatus | undefined }))
          }
        >
          <option value="">All messages</option>
          <option value="VISIBLE">Visible</option>
          <option value="HIDDEN">Hidden by the filter</option>
          <option value="DELETED">Deleted</option>
        </Select>
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
      {messages.length > 0 && (
        <ol className="divide-y divide-zinc-100" aria-label="Chat messages, newest first">
          {messages.map((message) => (
            <li
              key={message.id}
              className={cn('group flex gap-3 px-5 py-3', message.moderationStatus !== 'VISIBLE' && 'bg-zinc-50/70')}
            >
              <Avatar name={message.user.displayName} url={message.user.avatarUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
                  {auth.can('VIEW_USERS') ? (
                    <Link
                      to="/users/$userId"
                      params={{ userId: message.user.id }}
                      className="font-medium text-zinc-900 hover:underline"
                    >
                      {message.user.displayName}
                    </Link>
                  ) : (
                    <span className="font-medium text-zinc-900">{message.user.displayName}</span>
                  )}
                  <span className="text-zinc-500">@{message.user.username}</span>
                  {message.user.id === hostId && <span className="text-xs font-medium text-brand-700">Host</span>}
                  <time dateTime={message.createdAt} title={formatPrecise(message.createdAt)} className="text-xs text-zinc-400 tabular-nums">
                    {timeOnly.format(new Date(message.createdAt))}
                  </time>
                  <MessageStatusBadge status={message.moderationStatus} />
                </div>
                {message.imageUrl && /^https?:\/\//.test(message.imageUrl) && (
                  <a href={message.imageUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block w-fit">
                    <img
                      src={message.imageUrl}
                      alt={`Photo from ${message.user.displayName}`}
                      loading="lazy"
                      className={cn(
                        'max-h-40 max-w-56 rounded-md border border-zinc-200 bg-zinc-100 object-contain',
                        message.moderationStatus === 'DELETED' && 'opacity-50',
                      )}
                    />
                  </a>
                )}
                {message.text && (
                  <p
                    className={cn(
                      'mt-0.5 text-sm break-words whitespace-pre-wrap text-zinc-800',
                      message.moderationStatus === 'DELETED' && 'text-zinc-500 line-through decoration-zinc-300',
                    )}
                  >
                    {message.text}
                  </p>
                )}
                {message.flaggedReason && <p className="mt-0.5 text-xs text-amber-700">Filter: {message.flaggedReason}</p>}
              </div>
              <div className="flex shrink-0 items-start gap-0.5 opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                {canDelete && message.moderationStatus !== 'DELETED' && (
                  <IconButton label="Delete message" onClick={() => setDeleting(message)}>
                    <Trash />
                  </IconButton>
                )}
                {canSuspend && message.user.id !== hostId && (
                  <IconButton label={`Suspend @${message.user.username}`} onClick={() => setSuspending(message.user)}>
                    <UserX />
                  </IconButton>
                )}
              </div>
            </li>
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

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this message?"
        description="It's removed from the chat for everyone in the live. The deletion is recorded in the audit log."
        confirmLabel="Delete message"
        tone="danger"
        onConfirm={() => remove.mutateAsync({ messageId: deleting!.id })}
      >
        {deleting && (
          <blockquote className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
            <span className="mb-0.5 block text-xs font-medium text-zinc-500">@{deleting.user.username}</span>
            {deleting.imageUrl ? `📷 ${deleting.text || 'Photo'}` : deleting.text}
          </blockquote>
        )}
      </ConfirmDialog>
      <SuspendUserDialog user={suspending} onClose={() => setSuspending(null)} />
    </div>
  )
}
