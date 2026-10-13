import { getRouteApi } from '@tanstack/react-router'
import { ShieldOff } from 'lucide-react'
import type { HostingSearch, HostingTab } from '../../app/search'
import { Card } from '../../components/ui/Card'
import { Pagination } from '../../components/ui/DataTable'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/feedback'
import { PageHeader, RelativeTime, Tabs } from '../../components/ui/misc'
import { cn } from '../../lib/cn'
import { formatNumber } from '../../lib/format'
import { liveName } from '../../lib/live-name'
import { useHostingRestrictions } from '../../lib/queries'
import { DEFAULT_PAGE_SIZE } from '../../lib/search'
import type { HostingRestrictionRow } from '../../lib/types'
import { HostingReasonsPanel } from './HostingReasonsPanel'
import { RestrictionBadges, RestrictionView } from './RestrictionView'

const routeApi = getRouteApi('/_app/hosting')

const EMPTY: Record<Exclude<HostingTab, 'reasons'>, { title: string; description: string }> = {
  waiting: { title: 'No appeals waiting', description: 'Appeals from hosts whose hosting is paused show here as they come in.' },
  active: { title: 'Nobody is restricted', description: "Pause someone's hosting from the live it's about." },
  ended: { title: 'None yet', description: 'Restrictions lifted or run out show here.' },
}

/**
 * Whose hosting is paused (docs/features/hosting-restrictions.md): the
 * appeals waiting for the team first, then all in force and the ones that
 * ended - each open beside the list - and the reasons staff pick from.
 */
export function HostingPage() {
  const search = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const tab: HostingTab = search.tab ?? 'waiting'
  const update = (patch: Partial<HostingSearch>) => void navigate({ search: (previous) => ({ ...previous, ...patch }) })

  return (
    <>
      <PageHeader
        title="Hosting restrictions"
        description="Hosts whose hosting is paused because of a live: they can't go live or join a stage, but can still watch, chat and message. Answer their appeals here or on the live's page."
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
              { value: 'waiting', label: 'Appeals waiting' },
              { value: 'active', label: 'In force' },
              { value: 'ended', label: 'Ended' },
              { value: 'reasons', label: 'Reasons' },
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
  tab: Exclude<HostingTab, 'reasons'>
  search: HostingSearch
  update: (patch: Partial<HostingSearch>) => void
}) {
  const restrictions = useHostingRestrictions({ state: tab }, search)
  const page = restrictions.data
  const rows = page?.items ?? []

  return (
    <div className="grid xl:grid-cols-[24rem_minmax(0,1fr)]">
      <section aria-label="Restrictions" className="border-b border-zinc-200 xl:border-r xl:border-b-0">
        {page && (
          <p className="border-b border-zinc-100 px-4 py-2.5 text-[13px] text-zinc-500">
            {formatNumber(page.total)} {page.total === 1 ? 'restriction' : 'restrictions'} ·{' '}
            {formatNumber(page.counts.waiting)} waiting · {formatNumber(page.counts.active)} in force
          </p>
        )}
        {restrictions.isPending && <ListSkeleton />}
        {restrictions.isError && !page && <ErrorState error={restrictions.error} onRetry={() => void restrictions.refetch()} />}
        {page && rows.length === 0 && <EmptyState icon={<ShieldOff />} {...EMPTY[tab]} />}
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
            description="What the host was told, their appeal and what you can do about it show here."
          />
        )}
      </section>
    </div>
  )
}

function RestrictionRow({ row, selected, onOpen }: { row: HostingRestrictionRow; selected: boolean; onOpen(): void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={selected || undefined}
      className={cn('flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-zinc-50', selected && 'bg-brand-50 hover:bg-brand-50')}
    >
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[13px] font-medium text-zinc-900">
          {row.user.displayName} <span className="font-normal text-zinc-500">@{row.user.username}</span>
        </span>
        <span className="mt-1 block truncate text-xs text-zinc-600">{row.title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          <RestrictionBadges status={row.status} appealState={row.appealState} />
          {row.stream && <span className="truncate text-xs text-zinc-400">{liveName(row.stream)}</span>}
        </span>
      </span>
      <span className="shrink-0 text-right text-xs leading-tight tabular-nums">
        <RelativeTime value={row.updatedAt} className="block text-zinc-600" />
        <span className="block text-zinc-400">
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
        <div key={row} className="space-y-2">
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  )
}
