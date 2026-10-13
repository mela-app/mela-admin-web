import { getRouteApi } from '@tanstack/react-router'
import { ShieldOff } from 'lucide-react'
import type { HostingSearch, HostingTab } from '../../app/search'
import { Card } from '../../components/ui/Card'
import { Pagination } from '../../components/ui/DataTable'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/feedback'
import { Avatar, PageHeader, RelativeTime, Tabs } from '../../components/ui/misc'
import { SearchInput } from '../../components/ui/SearchInput'
import { cn } from '../../lib/cn'
import { formatNumber } from '../../lib/format'
import { liveName } from '../../lib/live-name'
import { useHostingRestrictions } from '../../lib/queries'
import { DEFAULT_PAGE_SIZE } from '../../lib/search'
import type { HostingRestrictionRow } from '../../lib/types'
import { HostingReasonsPanel } from './HostingReasonsPanel'
import { RestrictionBadges, RestrictionView } from './RestrictionView'

const routeApi = getRouteApi('/_app/hosting')

type ListTab = Exclude<HostingTab, 'reasons'>

const EMPTY: Record<ListTab, { title: string; description: string }> = {
  waiting: { title: 'No appeals waiting', description: "You're all caught up. New appeals show here as hosts send them." },
  active: { title: 'Nobody is paused', description: "Pause someone's hosting from Live chat, or from the live's page." },
  ended: { title: 'None yet', description: 'Restrictions that were lifted or ran out show here.' },
  all: { title: 'None yet', description: "Pause someone's hosting from Live chat, or from the live's page." },
}

/**
 * Whose hosting is paused (docs/features/hosting-restrictions.md): appeals
 * waiting for an answer first, then all in force, the ones that ended and
 * every one - each opened beside the list - and the reasons staff pick from.
 */
export function HostingPage() {
  const search = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const tab: HostingTab = search.tab ?? 'waiting'
  const update = (patch: Partial<HostingSearch>) => void navigate({ search: (previous) => ({ ...previous, ...patch }) })
  // The counts on the tabs, whichever is open.
  const counts = useHostingRestrictions({ state: 'waiting' }, { pageSize: 1 }).data?.counts

  return (
    <>
      <PageHeader
        title="Hosting restrictions"
        description="Hosts whose hosting is paused because of a live. They can't go live or join a stage, but still watch, chat and message - and may appeal. Pause someone from Live chat, while reading their chat."
      />
      <Card flush>
        <div className="px-4 pt-3">
          <Tabs<HostingTab>
            label="Hosting restrictions"
            value={tab}
            onChange={(next) =>
              update({ tab: next === 'waiting' ? undefined : next, page: undefined, restriction: undefined })
            }
            tabs={[
              { value: 'waiting', label: 'Appeals waiting', count: counts?.waiting },
              { value: 'active', label: 'In force', count: counts?.active },
              { value: 'ended', label: 'Ended' },
              { value: 'all', label: 'All' },
              { value: 'reasons', label: 'Reasons library' },
            ]}
          />
        </div>
        {tab === 'reasons' ? <HostingReasonsPanel /> : <RestrictionList tab={tab} search={search} update={update} />}
      </Card>
    </>
  )
}

function RestrictionList({
  tab,
  search,
  update,
}: {
  tab: ListTab
  search: HostingSearch
  update: (patch: Partial<HostingSearch>) => void
}) {
  const restrictions = useHostingRestrictions({ state: tab, q: search.q }, search)
  const page = restrictions.data
  const rows = page?.items ?? []

  return (
    <div className="grid xl:grid-cols-[26rem_minmax(0,1fr)]">
      <section aria-label="Restrictions" className="border-b border-zinc-200 xl:border-r xl:border-b-0">
        <div className="border-b border-zinc-100 p-3">
          <SearchInput
            value={search.q}
            onChange={(q) => update({ q, page: undefined, restriction: undefined })}
            placeholder="Search a host…"
            label="Search by host"
          />
        </div>
        {page && (
          <p className="border-b border-zinc-100 px-4 py-2 text-xs text-zinc-500">
            {formatNumber(page.total)} {page.total === 1 ? 'restriction' : 'restrictions'}
            {search.q ? ' matching' : ''}
          </p>
        )}
        {restrictions.isPending && <ListSkeleton />}
        {restrictions.isError && !page && <ErrorState error={restrictions.error} onRetry={() => void restrictions.refetch()} />}
        {page && rows.length === 0 && (
          <EmptyState
            icon={<ShieldOff />}
            {...(search.q ? { title: 'No matching hosts', description: 'Try another name.' } : EMPTY[tab])}
          />
        )}
        {rows.length > 0 && (
          <ul className="divide-y divide-zinc-100">
            {rows.map((row) => (
              <li key={row.id}>
                <RestrictionRow row={row} selected={row.id === search.restriction} onOpen={() => update({ restriction: row.id })} />
              </li>
            ))}
          </ul>
        )}
        {page && page.total > page.pageSize && (
          <Pagination
            page={search.page ?? 1}
            pageSize={search.pageSize ?? DEFAULT_PAGE_SIZE}
            total={page.total}
            onPageChange={(next) => update({ page: next > 1 ? next : undefined, restriction: undefined })}
          />
        )}
      </section>
      <section aria-label="The restriction" className="min-w-0">
        {search.restriction ? (
          <RestrictionView key={search.restriction} restrictionId={search.restriction} />
        ) : (
          <EmptyState
            icon={<ShieldOff />}
            title="Pick a restriction"
            description="What the host was told, their appeal, and your answer show here."
          />
        )}
      </section>
    </div>
  )
}

function RestrictionRow({ row, selected, onOpen }: { row: HostingRestrictionRow; selected: boolean; onOpen(): void }) {
  const waiting = row.status === 'ACTIVE' && row.appealState === 'WAITING_STAFF'
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={selected || undefined}
      className={cn(
        'flex w-full items-start gap-3 border-l-2 px-4 py-3 text-left hover:bg-zinc-50',
        waiting ? 'border-l-amber-400' : 'border-l-transparent',
        selected && 'bg-brand-50 hover:bg-brand-50',
      )}
    >
      <Avatar name={row.user.displayName} url={row.user.avatarUrl} size="sm" />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="flex items-baseline gap-1.5">
          <span className="truncate text-[13px] font-medium text-zinc-900">{row.user.displayName}</span>
          <span className="truncate text-xs text-zinc-500">@{row.user.username}</span>
        </span>
        <span className="mt-1 block truncate text-xs text-zinc-700">{row.title}</span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <RestrictionBadges status={row.status} appealState={row.appealState} />
        </span>
        {row.stream && (
          <span className="mt-1 block truncate text-xs text-zinc-400">{liveName({ ...row.stream, host: row.user })}</span>
        )}
      </span>
      <span className="shrink-0 text-right text-xs leading-tight tabular-nums">
        <RelativeTime value={row.updatedAt} className="block text-zinc-600" />
        <span className="mt-0.5 block text-zinc-400">
          {formatNumber(row.messageCount)} {row.messageCount === 1 ? 'message' : 'messages'}
        </span>
      </span>
    </button>
  )
}

function ListSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="flex gap-3">
          <Skeleton className="size-7 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}
