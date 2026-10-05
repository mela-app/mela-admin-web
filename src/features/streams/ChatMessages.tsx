import { Link } from '@tanstack/react-router'
import { Trash, UserX } from 'lucide-react'
import { MessageStatusBadge } from '../../components/StatusBadges'
import { IconButton } from '../../components/ui/Button'
import { Select } from '../../components/ui/forms'
import { Avatar } from '../../components/ui/misc'
import { SearchInput } from '../../components/ui/SearchInput'
import { useAuth } from '../../lib/auth-context'
import { cn } from '../../lib/cn'
import { formatPrecise } from '../../lib/format'
import type { ChatLogFilter } from '../../lib/queries'
import type { ChatLogEntry, ChatModerationStatus } from '../../lib/types'

const timeOnly = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })

/** Search the text, and pick which moderation status to show. */
export function ChatFilters({ filter, onChange }: { filter: ChatLogFilter; onChange: (patch: ChatLogFilter) => void }) {
  return (
    <>
      <SearchInput className="w-full sm:w-72" value={filter.q} onChange={(q) => onChange({ q })} placeholder="Search messages…" />
      <Select
        aria-label="Messages to show"
        className="w-48"
        value={filter.status ?? ''}
        onChange={(event) => onChange({ status: (event.target.value || undefined) as ChatModerationStatus | undefined })}
      >
        <option value="">All messages</option>
        <option value="VISIBLE">Visible</option>
        <option value="HIDDEN">Hidden by the filter</option>
        <option value="DELETED">Deleted</option>
      </Select>
    </>
  )
}

interface ChatMessageRowProps {
  message: ChatLogEntry
  hostId: string
  onDelete?: () => void
  onSuspend?: () => void
}

/** One chat message as the room saw it, with how the filters or moderators left it. */
export function ChatMessageRow({ message, hostId, onDelete, onSuspend }: ChatMessageRowProps) {
  const auth = useAuth()
  return (
    <li className={cn('group flex gap-3 px-5 py-3', message.moderationStatus !== 'VISIBLE' && 'bg-zinc-50/70')}>
      <Avatar name={message.user.displayName} url={message.user.avatarUrl} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
          {auth.can('VIEW_USERS') ? (
            <Link to="/users/$userId" params={{ userId: message.user.id }} className="font-medium text-zinc-900 hover:underline">
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
        {onDelete && (
          <IconButton label="Delete message" onClick={onDelete}>
            <Trash />
          </IconButton>
        )}
        {onSuspend && (
          <IconButton label={`Suspend @${message.user.username}`} onClick={onSuspend}>
            <UserX />
          </IconButton>
        )}
      </div>
    </li>
  )
}
