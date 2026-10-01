import { getRouteApi, Link } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Lock, MessagesSquare, X } from 'lucide-react'
import type { MessagesSearch } from '../../app/search'
import { Button, IconButton } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Pagination } from '../../components/ui/DataTable'
import { Callout, EmptyState, ErrorState, Skeleton } from '../../components/ui/feedback'
import { Input } from '../../components/ui/forms'
import { Avatar, PageHeader } from '../../components/ui/misc'
import { SearchInput } from '../../components/ui/SearchInput'
import { useAuth } from '../../lib/auth-context'
import { cn } from '../../lib/cn'
import { addDays, dayBoundary, formatDateTime, formatDay, formatNumber, formatPrecise, localDay } from '../../lib/format'
import { usePrivateConversations, usePrivateTranscript } from '../../lib/queries'
import { DEFAULT_PAGE_SIZE } from '../../lib/search'
import type { Person, PrivateConversationRow, PrivateMessage } from '../../lib/types'

const routeApi = getRouteApi('/_app/messages')
const clock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

interface DayRange {
  from: string
  to: string
}

/**
 * Direct messages between users, a day at a time - today unless another
 * day is picked. The list is who wrote to whom; the text shows only in the
 * conversation opened beside it, and the server records each one opened.
 */
export function MessagesPage() {
  const search = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const today = localDay()
  const day = search.day ?? today
  const isToday = day === today
  const range: DayRange = { from: dayBoundary(day, 'start')!, to: dayBoundary(day, 'end')! }
  const conversations = usePrivateConversations(search, range, isToday)

  const update = (patch: Partial<MessagesSearch>) => void navigate({ search: (previous) => ({ ...previous, ...patch }) })
  // Another day or person starts over: the first page, nothing open.
  const refilter = (patch: Partial<MessagesSearch>) => update({ ...patch, page: undefined, conversation: undefined })
  const goToDay = (next: string) => refilter({ day: next === today ? undefined : next })

  const page = conversations.data
  const rows = page?.items ?? []
  const onlyPerson = search.userId ? rows.flatMap((row) => row.people).find((person) => person.id === search.userId) : undefined

  return (
    <>
      <PageHeader
        title="Private messages"
        description="Conversations between users, one day at a time. The list shows who wrote to whom; messages show only in the conversation you open."
      />
      <Callout className="mb-6" title="Opening a conversation is recorded">
        The audit log keeps who opened which conversation, when, and for which day. Open one only when there's a reason to.
      </Callout>

      <Card flush>
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 p-4">
          <div className="flex items-center gap-1">
            <IconButton label="Previous day" onClick={() => goToDay(addDays(day, -1))}>
              <ChevronLeft />
            </IconButton>
            <Input
              type="date"
              aria-label="Day"
              className="w-40"
              value={day}
              max={today}
              onChange={(event) => {
                if (event.target.value) goToDay(event.target.value)
              }}
            />
            <IconButton label="Next day" disabled={isToday} onClick={() => goToDay(addDays(day, 1))}>
              <ChevronRight />
            </IconButton>
          </div>
          {!isToday && (
            <Button variant="ghost" size="sm" onClick={() => goToDay(today)}>
              Today
            </Button>
          )}
          <SearchInput
            className="w-full sm:w-72"
            value={search.q}
            onChange={(q) => refilter({ q })}
            placeholder="Search a person…"
            label="Search by person"
          />
          {search.userId && (
            <span className="inline-flex h-8 items-center gap-1 rounded-full bg-zinc-100 pr-0.5 pl-3 text-[13px] text-zinc-700">
              Only {onlyPerson ? `@${onlyPerson.username}` : 'one person'}
              <IconButton label="Show everyone" onClick={() => refilter({ userId: undefined })}>
                <X />
              </IconButton>
            </span>
          )}
        </div>

        <div className="grid xl:grid-cols-[22rem_minmax(0,1fr)]">
          <section aria-label="Conversations" className="border-b border-zinc-200 xl:border-r xl:border-b-0">
            <p className="border-b border-zinc-100 px-4 py-2.5 text-[13px] text-zinc-500">
              <span className="font-medium text-zinc-900">{formatDay(day)}</span>
              {page && (
                <>
                  {' · '}
                  {formatNumber(page.total)} {page.total === 1 ? 'conversation' : 'conversations'} · {formatNumber(page.messageCount)}{' '}
                  {page.messageCount === 1 ? 'message' : 'messages'}
                </>
              )}
            </p>
            {conversations.isPending && <ListSkeleton />}
            {conversations.isError && !page && (
              <ErrorState error={conversations.error} onRetry={() => void conversations.refetch()} />
            )}
            {page && rows.length === 0 && (
              <EmptyState
                icon={<MessagesSquare />}
                title={search.q || search.userId ? 'No matching conversations' : 'No private messages'}
                description={`Nobody${search.q || search.userId ? ' matching' : ''} wrote a private message ${isToday ? 'today' : 'that day'}. Pick another day to look further back.`}
              />
            )}
            {rows.length > 0 && (
              <ul className="divide-y divide-zinc-100">
                {rows.map((row) => (
                  <li key={row.id}>
                    <ConversationRow
                      row={row}
                      selected={row.id === search.conversation}
                      onOpen={() => update({ conversation: row.id })}
                    />
                  </li>
                ))}
              </ul>
            )}
            {page && page.total > page.pageSize && (
              <Pagination
                page={search.page ?? 1}
                pageSize={search.pageSize ?? DEFAULT_PAGE_SIZE}
                total={page.total}
                onPageChange={(next) => update({ page: next > 1 ? next : undefined, conversation: undefined })}
              />
            )}
          </section>

          <section aria-label="Messages" className="min-w-0">
            {search.conversation ? (
              <Transcript key={`${search.conversation}:${day}`} conversationId={search.conversation} range={range} />
            ) : (
              <EmptyState
                icon={<Lock />}
                title="Pick a conversation"
                description={`Its messages from ${isToday ? 'today' : formatDay(day)} show here. Opening it is recorded in the audit log.`}
              />
            )}
          </section>
        </div>
      </Card>
    </>
  )
}

function ConversationRow({ row, selected, onOpen }: { row: PrivateConversationRow; selected: boolean; onOpen(): void }) {
  const [a, b] = row.people
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={selected || undefined}
      className={cn(
        'flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50',
        selected && 'bg-brand-50 hover:bg-brand-50',
      )}
    >
      <span className="flex shrink-0 -space-x-2" aria-hidden>
        <span className="rounded-full ring-2 ring-white">
          <Avatar name={a.displayName} url={a.avatarUrl} size="sm" />
        </span>
        <span className="rounded-full ring-2 ring-white">
          <Avatar name={b.displayName} url={b.avatarUrl} size="sm" />
        </span>
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[13px] font-medium text-zinc-900">
          {a.displayName} and {b.displayName}
        </span>
        <span className="block truncate text-xs text-zinc-500">
          @{a.username} · @{b.username}
        </span>
      </span>
      <span className="shrink-0 text-right text-xs leading-tight tabular-nums">
        <time dateTime={row.lastMessageAt} title={formatPrecise(row.lastMessageAt)} className="block text-zinc-600">
          {clock.format(new Date(row.lastMessageAt))}
        </time>
        <span className="block text-zinc-400">
          {formatNumber(row.messageCount)} {row.messageCount === 1 ? 'message' : 'messages'}
        </span>
      </span>
    </button>
  )
}

function Transcript({ conversationId, range }: { conversationId: string; range: DayRange }) {
  const transcript = usePrivateTranscript(conversationId, range)
  if (transcript.isPending) {
    return (
      <div className="space-y-4 p-5">
        {[0, 1, 2].map((row) => (
          <div key={row} className={cn('flex gap-2.5', row === 1 && 'flex-row-reverse')}>
            <Skeleton className="size-7 rounded-full" />
            <Skeleton className="h-9 w-1/2 rounded-2xl" />
          </div>
        ))}
      </div>
    )
  }
  if (transcript.isError) return <ErrorState error={transcript.error} onRetry={() => void transcript.refetch()} />

  const [a, b] = transcript.data.pages[0].people
  const messages = transcript.data.pages.flatMap((page) => page.messages)
  return (
    <div>
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-zinc-200 px-5 py-3 text-[13px]">
        <PersonName person={a} />
        <span className="text-zinc-400">and</span>
        <PersonName person={b} />
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-zinc-500">
          <Lock className="size-3.5" aria-hidden />
          Opened by you - recorded in the audit log
        </span>
      </header>
      {messages.length === 0 ? (
        <EmptyState title="No messages that day" description="They wrote to each other on other days. Pick one to read it." />
      ) : (
        <ol className="space-y-3 px-5 py-4" aria-label={`Messages between ${a.displayName} and ${b.displayName}, oldest first`}>
          {messages.map((message) => (
            <Bubble key={message.id} message={message} sender={message.senderId === a.id ? a : b} left={message.senderId === a.id} />
          ))}
        </ol>
      )}
      {transcript.hasNextPage && (
        <div className="border-t border-zinc-200 p-3 text-center">
          <Button size="sm" loading={transcript.isFetchingNextPage} onClick={() => void transcript.fetchNextPage()}>
            Load later messages
          </Button>
        </div>
      )}
    </div>
  )
}

function Bubble({ message, sender, left }: { message: PrivateMessage; sender: Person; left: boolean }) {
  return (
    <li className={cn('flex gap-2.5', !left && 'flex-row-reverse')}>
      <Avatar name={sender.displayName} url={sender.avatarUrl} size="sm" />
      <div className={cn('flex max-w-[75%] flex-col', left ? 'items-start' : 'items-end')}>
        <p
          className={cn(
            'rounded-2xl px-3.5 py-2 text-sm break-words whitespace-pre-wrap',
            left ? 'rounded-tl-sm bg-zinc-100 text-zinc-900' : 'rounded-tr-sm bg-brand-700 text-white',
          )}
        >
          {message.text}
        </p>
        <p className="mt-1 text-[11px] text-zinc-500 tabular-nums">
          {sender.displayName} ·{' '}
          <time dateTime={message.createdAt} title={formatPrecise(message.createdAt)}>
            {clock.format(new Date(message.createdAt))}
          </time>{' '}
          · {readLabel(message)}
        </p>
      </div>
    </li>
  )
}

function readLabel(message: PrivateMessage): string {
  if (!message.readAt) return 'not read'
  const sameDay = localDay(message.readAt) === localDay(message.createdAt)
  return `read ${sameDay ? clock.format(new Date(message.readAt)) : formatDateTime(message.readAt)}`
}

function PersonName({ person }: { person: Person }) {
  const auth = useAuth()
  const name = (
    <>
      <span className="font-medium text-zinc-900">{person.displayName}</span>{' '}
      <span className="text-zinc-500">@{person.username}</span>
    </>
  )
  if (!auth.can('VIEW_USERS')) return <span>{name}</span>
  return (
    <Link to="/users/$userId" params={{ userId: person.id }} className="hover:underline">
      {name}
    </Link>
  )
}

function ListSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="flex items-center gap-3">
          <Skeleton className="size-7 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  )
}
