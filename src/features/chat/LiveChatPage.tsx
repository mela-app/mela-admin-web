import { liveName } from '../../lib/live-name'
import { getRouteApi, Link } from '@tanstack/react-router'
import { MessageSquareText, Radio } from 'lucide-react'
import { useState } from 'react'
import type { LiveChatSearch } from '../../app/search'
import { DayNavigation } from '../../components/DayNavigation'
import { PersonLink } from '../../components/PersonLink'
import { StreamStatusBadge } from '../../components/StatusBadges'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Pagination } from '../../components/ui/DataTable'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/feedback'
import { Avatar, PageHeader } from '../../components/ui/misc'
import { SearchInput } from '../../components/ui/SearchInput'
import { useAuth } from '../../lib/auth-context'
import { cn } from '../../lib/cn'
import { dayBoundary, formatDateTime, formatDay, formatNumber, formatPrecise, localDay } from '../../lib/format'
import { useHostChat, useLiveChatHosts, type ChatLogFilter } from '../../lib/queries'
import { DEFAULT_PAGE_SIZE } from '../../lib/search'
import type { LiveChatHostRow, LiveChatLive } from '../../lib/types'
import { useChatModeration } from '../streams/chat-moderation'
import { ChatFilters, ChatMessageRow } from '../streams/ChatMessages'
import { chatSections } from './sections'

const routeApi = getRouteApi('/_app/chat')
const clock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

interface DayRange {
  from: string
  to: string
}

/**
 * Chat from lives a day at a time - today unless another day is picked -
 * arranged like private messages: the hosts whose lives had chat that day,
 * then one host's chat beside the list, live by live.
 */
export function LiveChatPage() {
  const search = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const today = localDay()
  const day = search.day ?? today
  const isToday = day === today
  const range: DayRange = { from: dayBoundary(day, 'start')!, to: dayBoundary(day, 'end')! }
  const hosts = useLiveChatHosts(search, range, isToday)

  const update = (patch: Partial<LiveChatSearch>) => void navigate({ search: (previous) => ({ ...previous, ...patch }) })
  // The open host stays, to read their chat on another day.
  const goToDay = (next: string) => update({ day: next === today ? undefined : next, page: undefined })

  const page = hosts.data
  const rows = page?.items ?? []

  return (
    <>
      <PageHeader
        title="Live chat"
        description="Chat from lives, one day at a time. Pick a host to read their chat that day, live by live - every message, including the ones the filter hid or a host or moderator deleted. Messages you delete here are erased for good."
      />

      <Card flush>
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 p-4">
          <DayNavigation day={day} today={today} onChange={goToDay} />
          <SearchInput
            className="w-full sm:w-72"
            value={search.q}
            onChange={(q) => update({ q, page: undefined })}
            placeholder="Search a host…"
            label="Search by host"
          />
        </div>

        <div className="grid xl:grid-cols-[22rem_minmax(0,1fr)]">
          <section aria-label="Hosts" className="border-b border-zinc-200 xl:border-r xl:border-b-0">
            <p className="border-b border-zinc-100 px-4 py-2.5 text-[13px] text-zinc-500">
              <span className="font-medium text-zinc-900">{formatDay(day)}</span>
              {page && (
                <>
                  {' · '}
                  {formatNumber(page.total)} {page.total === 1 ? 'host' : 'hosts'} · {formatNumber(page.messageCount)}{' '}
                  {page.messageCount === 1 ? 'message' : 'messages'}
                </>
              )}
            </p>
            {hosts.isPending && <ListSkeleton />}
            {hosts.isError && !page && <ErrorState error={hosts.error} onRetry={() => void hosts.refetch()} />}
            {page && rows.length === 0 && (
              <EmptyState
                icon={<MessageSquareText />}
                title={search.q ? 'No matching hosts' : 'No live chat'}
                description={`No${search.q ? ' matching' : ''} host's live had chat ${isToday ? 'today' : 'that day'}. Pick another day to look further back.`}
              />
            )}
            {rows.length > 0 && (
              <ul className="divide-y divide-zinc-100">
                {rows.map((row) => (
                  <li key={row.host.id}>
                    <HostRow row={row} selected={row.host.id === search.host} onOpen={() => update({ host: row.host.id })} />
                  </li>
                ))}
              </ul>
            )}
            {page && page.total > page.pageSize && (
              <Pagination
                page={search.page ?? 1}
                pageSize={search.pageSize ?? DEFAULT_PAGE_SIZE}
                total={page.total}
                onPageChange={(next) => update({ page: next > 1 ? next : undefined })}
              />
            )}
          </section>

          <section aria-label="Chat" className="min-w-0">
            {search.host ? (
              <HostChatView key={`${search.host}:${day}`} hostId={search.host} day={day} range={range} isToday={isToday} />
            ) : (
              <EmptyState
                icon={<MessageSquareText />}
                title="Pick a host"
                description={`Chat from their lives ${isToday ? 'today' : `on ${formatDay(day)}`} shows here, live by live.`}
              />
            )}
          </section>
        </div>
      </Card>
    </>
  )
}

function HostRow({ row, selected, onOpen }: { row: LiveChatHostRow; selected: boolean; onOpen(): void }) {
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
      <Avatar name={row.host.displayName} url={row.host.avatarUrl} size="sm" />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[13px] font-medium text-zinc-900">{row.host.displayName}</span>
        <span className="block truncate text-xs text-zinc-500">
          @{row.host.username} · {formatNumber(row.liveCount)} {row.liveCount === 1 ? 'live' : 'lives'}
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

interface HostChatViewProps {
  hostId: string
  day: string
  range: DayRange
  isToday: boolean
}

function HostChatView({ hostId, day, range, isToday }: HostChatViewProps) {
  const [filter, setFilter] = useState<ChatLogFilter>({})
  const chat = useHostChat(hostId, range, filter, isToday)
  const moderation = useChatModeration()
  const pages = chat.data?.pages ?? []
  const host = pages[0]?.host
  // The same on every page; the last one fetched is the freshest.
  const lives = pages.at(-1)?.lives ?? []
  const messages = pages.flatMap((page) => page.messages)
  const filtered = Boolean(filter.q || filter.status)

  return (
    <div>
      {host && (
        <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-zinc-200 px-5 py-3 text-[13px]">
          <PersonLink person={host} compact />
          <span className="text-zinc-500">@{host.username}</span>
          <span className="text-zinc-400">·</span>
          <span className="text-zinc-500">
            {formatNumber(lives.length)} {lives.length === 1 ? 'live' : 'lives'} {isToday ? 'today' : formatDay(day)}
          </span>
          {lives.some((live) => live.status === 'LIVE') && (
            <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-zinc-500">
              <span className="size-1.5 rounded-full bg-red-500" aria-hidden />
              Updating as the live runs
            </span>
          )}
        </header>
      )}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 px-5 py-3">
        <ChatFilters filter={filter} onChange={(patch) => setFilter((current) => ({ ...current, ...patch }))} />
      </div>

      {chat.isPending && <TranscriptSkeleton />}
      {chat.isError && !chat.data && <ErrorState error={chat.error} onRetry={() => void chat.refetch()} />}
      {chat.data && messages.length === 0 && (
        <EmptyState
          icon={<MessageSquareText />}
          title={filtered ? 'No matching messages' : 'No chat that day'}
          description={filtered ? 'Try another search or filter.' : 'Pick another day to read their chat then.'}
        />
      )}
      {host && moderation.pickBar(messages)}
      {host &&
        chatSections(messages, lives).map((section) => (
          <section key={`${section.streamId}:${section.messages[0].id}`} aria-label={section.live?.title ?? 'A live'}>
            {section.live && <LiveHeading live={section.live} day={day} />}
            <ol className="divide-y divide-zinc-100" aria-label="Chat messages, oldest first">
              {section.messages.map((message) => (
                <ChatMessageRow
                  key={message.id}
                  message={message}
                  hostId={host.id}
                  {...moderation.actionsFor(message.streamId, host.id, message)}
                />
              ))}
            </ol>
          </section>
        ))}
      {chat.hasNextPage && (
        <div className="border-t border-zinc-200 p-3 text-center">
          <Button size="sm" loading={chat.isFetchingNextPage} onClick={() => void chat.fetchNextPage()}>
            Load later messages
          </Button>
        </div>
      )}

      {moderation.dialogs}
    </div>
  )
}

function LiveHeading({ live, day }: { live: LiveChatLive; day: string }) {
  const auth = useAuth()
  // A live that began the day before shows its date too.
  const started = localDay(live.startedAt) === day ? clock.format(new Date(live.startedAt)) : formatDateTime(live.startedAt)
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-zinc-100 bg-zinc-50/80 px-5 py-2 text-xs text-zinc-600">
      <Radio className="size-3.5 text-zinc-400" aria-hidden />
      {auth.can('VIEW_LIVES') ? (
        <Link to="/streams/$streamId" params={{ streamId: live.id }} className="font-medium text-zinc-900 hover:underline">
          {liveName(live)}
        </Link>
      ) : (
        <span className="font-medium text-zinc-900">{liveName(live)}</span>
      )}
      <span>started {started}</span>
      <StreamStatusBadge status={live.status} />
      <span className="ml-auto tabular-nums">
        {formatNumber(live.messageCount)} {live.messageCount === 1 ? 'message' : 'messages'}
      </span>
    </div>
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

function TranscriptSkeleton() {
  return (
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
  )
}
