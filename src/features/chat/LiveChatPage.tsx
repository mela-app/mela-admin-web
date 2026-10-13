import { liveName } from '../../lib/live-name'
import { getRouteApi, Link } from '@tanstack/react-router'
import { ExternalLink, MessageSquareText, Radio, ShieldOff, UserRound } from 'lucide-react'
import { useState } from 'react'
import type { LiveChatSearch } from '../../app/search'
import { DayNavigation } from '../../components/DayNavigation'
import { StreamStatusBadge } from '../../components/StatusBadges'
import { buttonClasses } from '../../components/ui/button-styles'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Pagination } from '../../components/ui/DataTable'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/feedback'
import { Avatar, PageHeader } from '../../components/ui/misc'
import { SearchInput } from '../../components/ui/SearchInput'
import { useAuth } from '../../lib/auth-context'
import { cn } from '../../lib/cn'
import { dayBoundary, formatDateTime, formatDay, formatNumber, formatPrecise, localDay } from '../../lib/format'
import { useHostChat, useHostingInForce, useLiveChatHosts, type ChatLogFilter } from '../../lib/queries'
import { DEFAULT_PAGE_SIZE } from '../../lib/search'
import type { HostingInForce, LiveChatHostRow, LiveChatLive, Person } from '../../lib/types'
import { HostHostingCard, HostingBadge } from '../hosting/HostingStatus'
import { RestrictHostDialog } from '../hosting/RestrictHostDialog'
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
 * Where staff inspect lives' chat, a day at a time - today unless another
 * day is picked: the hosts whose lives had chat that day; one host's chat,
 * live by live; and beside it the host - their lives that day and their
 * hosting, paused from here when a live broke the rules
 * (docs/features/hosting-restrictions.md).
 */
export function LiveChatPage() {
  const auth = useAuth()
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
  const hosting = useHostingInForce(
    [...rows.map((row) => row.host.id), ...(search.host ? [search.host] : [])],
    auth.can('VIEW_HOSTING_RESTRICTIONS'),
  )

  return (
    <>
      <PageHeader
        title="Live chat"
        description="Inspect what was said in lives, a day at a time. Pick a host to read their chat live by live - including what the filter hid or a host or moderator deleted - and act on it: delete messages, suspend someone, or pause the host's hosting."
      />

      <Card flush>
        <div className="flex flex-wrap items-center gap-3 border-b border-zinc-200 p-3">
          <DayNavigation day={day} today={today} onChange={goToDay} />
          {page && (
            <span className="text-[13px] text-zinc-500">
              {formatNumber(page.total)} {page.total === 1 ? 'host' : 'hosts'} · {formatNumber(page.messageCount)}{' '}
              {page.messageCount === 1 ? 'message' : 'messages'}
            </span>
          )}
        </div>

        <div className="grid lg:grid-cols-[19rem_minmax(0,1fr)] 2xl:grid-cols-[19rem_minmax(0,1fr)_20rem]">
          <section aria-label="Hosts" className="border-b border-zinc-200 lg:row-span-2 lg:border-r lg:border-b-0">
            <div className="border-b border-zinc-100 p-3">
              <SearchInput
                value={search.q}
                onChange={(q) => update({ q, page: undefined })}
                placeholder="Search a host…"
                label="Search by host"
              />
            </div>
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
                    <HostRow
                      row={row}
                      hosting={hosting.get(row.host.id)}
                      selected={row.host.id === search.host}
                      onOpen={() => update({ host: row.host.id })}
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
                onPageChange={(next) => update({ page: next > 1 ? next : undefined })}
              />
            )}
          </section>

          {search.host ? (
            <HostChatView
              key={`${search.host}:${day}`}
              hostId={search.host}
              day={day}
              range={range}
              isToday={isToday}
              hosting={hosting.get(search.host)}
            />
          ) : (
            <section aria-label="Chat" className="min-w-0 2xl:col-span-2">
              <EmptyState
                icon={<MessageSquareText />}
                title="Pick a host"
                description={`Their chat ${isToday ? 'today' : `on ${formatDay(day)}`} shows here, live by live, with what you can do about it.`}
              />
            </section>
          )}
        </div>
      </Card>
    </>
  )
}

function HostRow({
  row,
  hosting,
  selected,
  onOpen,
}: {
  row: LiveChatHostRow
  hosting: HostingInForce | undefined
  selected: boolean
  onOpen(): void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={selected || undefined}
      className={cn(
        'flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-zinc-50',
        selected && 'bg-brand-50 hover:bg-brand-50',
      )}
    >
      <Avatar name={row.host.displayName} url={row.host.avatarUrl} size="sm" />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[13px] font-medium text-zinc-900">{row.host.displayName}</span>
        <span className="block truncate text-xs text-zinc-500">
          @{row.host.username} · {formatNumber(row.liveCount)} {row.liveCount === 1 ? 'live' : 'lives'}
        </span>
        {hosting && (
          <span className="mt-1.5 block">
            <HostingBadge appealState={hosting.appealState} />
          </span>
        )}
      </span>
      <span className="shrink-0 text-right text-xs leading-tight tabular-nums">
        <time dateTime={row.lastMessageAt} title={formatPrecise(row.lastMessageAt)} className="block text-zinc-600">
          {clock.format(new Date(row.lastMessageAt))}
        </time>
        <span className="block text-zinc-400">
          {formatNumber(row.messageCount)} {row.messageCount === 1 ? 'msg' : 'msgs'}
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
  hosting: HostingInForce | undefined
}

function HostChatView({ hostId, day, range, isToday, hosting }: HostChatViewProps) {
  const auth = useAuth()
  const [filter, setFilter] = useState<ChatLogFilter>({})
  // The live the dialog opens on.
  const [restricting, setRestricting] = useState<string | null>(null)
  const chat = useHostChat(hostId, range, filter, isToday)
  const moderation = useChatModeration()
  const pages = chat.data?.pages ?? []
  const host = pages[0]?.host
  // The same on every page; the last one fetched is the freshest.
  const lives = pages.at(-1)?.lives ?? []
  const messages = pages.flatMap((page) => page.messages)
  const filtered = Boolean(filter.q || filter.status)
  const canPause = auth.can('MANAGE_HOSTING_RESTRICTIONS') && !hosting
  const liveNow = lives.some((live) => live.status === 'LIVE')
  // The dialog picks the last one: the live it was opened on.
  const choices = (first: string) => [
    ...lives.filter((live) => live.id !== first),
    ...lives.filter((live) => live.id === first),
  ]

  return (
    <>
      {host && (
        <aside
          aria-label="About the host"
          className="space-y-6 border-b border-zinc-200 p-5 lg:col-start-2 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0 xl:grid-cols-3 2xl:col-start-3 2xl:row-span-2 2xl:row-start-1 2xl:block 2xl:space-y-6 2xl:border-b-0 2xl:border-l"
        >
          <HostPanel host={host} lives={lives} day={day} isToday={isToday} />
        </aside>
      )}

      <section aria-label="Chat" className="min-w-0 lg:col-start-2 2xl:row-span-2 2xl:row-start-1">
        {host && (
          <header className="flex flex-wrap items-center gap-3 border-b border-zinc-200 px-5 py-3">
            <Avatar name={host.displayName} url={host.avatarUrl} />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-semibold text-zinc-900">{host.displayName}</span>
                {hosting && <HostingBadge appealState={hosting.appealState} />}
                {liveNow && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
                    <span className="size-1.5 animate-pulse rounded-full bg-red-500" aria-hidden />
                    Live now - updating
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-zinc-500">
                @{host.username} · {formatNumber(lives.length)} {lives.length === 1 ? 'live' : 'lives'}{' '}
                {isToday ? 'today' : formatDay(day)}
              </p>
            </div>
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
            <section key={`${section.streamId}:${section.messages[0].id}`} aria-label={section.live?.title || 'A live'}>
              {section.live && (
                <LiveHeading
                  live={section.live}
                  host={host}
                  day={day}
                  pausedForIt={hosting?.streamId === section.live.id}
                  onPause={canPause ? () => setRestricting(section.live!.id) : undefined}
                />
              )}
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
      </section>

      {host && restricting && (
        <RestrictHostDialog open onClose={() => setRestricting(null)} host={host} lives={choices(restricting)} />
      )}
    </>
  )
}

/** Beside the chat: who the host is, their hosting, and their lives that day. */
function HostPanel({ host, lives, day, isToday }: { host: Person; lives: LiveChatLive[]; day: string; isToday: boolean }) {
  const auth = useAuth()
  return (
    <>
      <section aria-label="Host">
        <h3 className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Host</h3>
        <div className="mt-2.5 flex items-center gap-3">
          <Avatar name={host.displayName} url={host.avatarUrl} />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-medium text-zinc-900">{host.displayName}</p>
            <p className="truncate text-xs text-zinc-500">@{host.username}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {auth.can('VIEW_USERS') && (
            <Link to="/users/$userId" params={{ userId: host.id }} className={buttonClasses('secondary', 'sm')}>
              <UserRound /> Account
            </Link>
          )}
          {auth.can('VIEW_LIVES') && (
            <Link to="/streams" search={{ hostId: host.id }} className={buttonClasses('secondary', 'sm')}>
              <Radio /> All their lives
            </Link>
          )}
        </div>
      </section>

      <HostHostingCard key={host.id} host={host} lives={lives} />

      <section aria-label="Lives">
        <h3 className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
          Lives {isToday ? 'today' : formatDay(day)}
        </h3>
        {lives.length === 0 ? (
          <p className="mt-2.5 text-[13px] text-zinc-500">None with matching chat.</p>
        ) : (
          <ul className="mt-2.5 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            {[...lives].reverse().map((live) => (
              <li key={live.id} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-[13px] font-medium text-zinc-900">{liveName({ ...live, host })}</p>
                  <p className="text-xs text-zinc-500">
                    {clock.format(new Date(live.startedAt))} · {formatNumber(live.messageCount)}{' '}
                    {live.messageCount === 1 ? 'msg' : 'msgs'}
                  </p>
                </div>
                <StreamStatusBadge status={live.status} />
                {auth.can('VIEW_LIVES') && (
                  <Link
                    to="/streams/$streamId"
                    params={{ streamId: live.id }}
                    className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                    aria-label={`Open ${liveName({ ...live, host })}`}
                  >
                    <ExternalLink className="size-3.5" />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

function LiveHeading({
  live,
  host,
  day,
  pausedForIt,
  onPause,
}: {
  live: LiveChatLive
  host: Person
  day: string
  pausedForIt: boolean
  onPause?: () => void
}) {
  const auth = useAuth()
  // A live that began the day before shows its date too.
  const started = localDay(live.startedAt) === day ? clock.format(new Date(live.startedAt)) : formatDateTime(live.startedAt)
  const name = liveName({ ...live, host })
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-y border-zinc-200 bg-zinc-50 px-5 py-2 text-xs text-zinc-600">
      <Radio className="size-3.5 text-zinc-400" aria-hidden />
      {auth.can('VIEW_LIVES') ? (
        <Link to="/streams/$streamId" params={{ streamId: live.id }} className="font-medium text-zinc-900 hover:underline">
          {name}
        </Link>
      ) : (
        <span className="font-medium text-zinc-900">{name}</span>
      )}
      <span>started {started}</span>
      <StreamStatusBadge status={live.status} />
      {pausedForIt && <span className="font-medium text-amber-700">Hosting paused for this live</span>}
      <span className="ml-auto flex items-center gap-3">
        <span className="tabular-nums">
          {formatNumber(live.messageCount)} {live.messageCount === 1 ? 'message' : 'messages'}
        </span>
        {onPause && (
          <Button size="sm" variant="ghost" icon={<ShieldOff />} className="text-red-700 hover:bg-red-50" onClick={onPause}>
            Pause hosting
          </Button>
        )}
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
