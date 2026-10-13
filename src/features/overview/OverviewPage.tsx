import { liveName } from '../../lib/live-name'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowRight, Radio } from 'lucide-react'
import { DailyBars } from '../../components/DailyBars'
import { PersonLink } from '../../components/PersonLink'
import { Card, Stat } from '../../components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/feedback'
import { PageHeader, RelativeTime } from '../../components/ui/misc'
import { useAuth } from '../../lib/auth-context'
import { cn } from '../../lib/cn'
import { formatDuration, formatNumber } from '../../lib/format'
import { useOverview } from '../../lib/queries'
import type { Overview } from '../../lib/types'

export function OverviewPage() {
  const auth = useAuth()
  const overview = useOverview()
  const firstName = auth.admin?.displayName.split(' ')[0]

  return (
    <>
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : 'Overview'}
        description="What is happening on the platform right now. Figures refresh every 30 seconds."
        meta={
          overview.data && (
            <span className="text-xs text-zinc-500">
              Updated <RelativeTime value={overview.data.generatedAt} />
            </span>
          )
        }
      />
      {overview.isError && !overview.data ? (
        <Card>
          <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
        </Card>
      ) : (
        <OverviewBody data={overview.data} />
      )}
    </>
  )
}

function OverviewBody({ data }: { data: Overview | undefined }) {
  const auth = useAuth()
  const showLives = auth.can('VIEW_LIVES')
  const showReports = auth.can('VIEW_REPORTS')
  const reports = data?.reports
  return (
    <div className="space-y-6">
      <div
        className={cn(
          'grid gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200',
          showReports ? 'sm:grid-cols-2 xl:grid-cols-4' : 'sm:grid-cols-3',
        )}
      >
        {showReports && (
          <KpiCell
            label="Open reports"
            value={reports?.open}
            hint={reports ? (reports.urgent > 0 ? `${formatNumber(reports.urgent)} urgent` : 'None urgent') : undefined}
            to="/reports"
          />
        )}
        <KpiCell
          label="Live now"
          value={data?.live.streams}
          hint={data && `${formatNumber(data.live.viewers)} watching`}
          to={showLives ? '/streams' : undefined}
        />
        <KpiCell
          label="New accounts, 24 h"
          value={data?.users.new24h}
          hint={data && `${formatNumber(data.users.total)} in total`}
          to={auth.can('VIEW_USERS') ? '/users' : undefined}
        />
        <KpiCell
          label="Suspended accounts"
          value={data?.users.suspended}
          hint="Across the platform"
          to={auth.can('VIEW_USERS') ? '/users' : undefined}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Last 14 days" description="Lives started and accounts created, per day (UTC)." className="xl:col-span-2">
          {data ? (
            <DailyBars
              label="Lives started and new accounts per day, last 14 days"
              data={data.daily}
              series={[
                { key: 'streams', label: 'Lives started', fill: 'fill-brand-500', swatch: 'bg-brand-500' },
                { key: 'signups', label: 'New accounts', fill: 'fill-zinc-300', swatch: 'bg-zinc-300' },
              ]}
            />
          ) : (
            <Skeleton className="h-56 w-full" />
          )}
        </Card>
        <Card title="Last 24 hours">
          <div className="space-y-4">
            <Stat label="Chat messages" value={data ? formatNumber(data.activity24h.messages) : <Skeleton className="h-7 w-16" />} />
            <Stat label="Lives started" value={data ? formatNumber(data.activity24h.streamsStarted) : <Skeleton className="h-7 w-16" />} />
            <Stat label="Alerts sent" value={data ? formatNumber(data.activity24h.alertsSent) : <Skeleton className="h-7 w-16" />} />
          </div>
        </Card>
      </div>

      {showLives && <LiveNowCard data={data} />}
    </div>
  )
}

function KpiCell({
  label,
  value,
  hint,
  to,
}: {
  label: string
  value: number | undefined
  hint?: string
  // Only a link for staff who can open the page.
  to?: '/streams' | '/users' | '/reports'
}) {
  const stat = (
    <Stat
      label={label}
      value={value === undefined ? <Skeleton className="h-8 w-14" /> : formatNumber(value)}
      hint={hint}
    />
  )
  if (!to) return <div className="bg-white px-5 py-4">{stat}</div>
  return (
    <Link to={to} className="group bg-white px-5 py-4 hover:bg-zinc-50">
      {stat}
    </Link>
  )
}

function LiveNowCard({ data }: { data: Overview | undefined }) {
  const navigate = useNavigate()
  return (
    <Card
      title="Live now"
      description="The busiest lives running at this moment."
      flush
      actions={
        <Link to="/streams" search={{ status: 'LIVE' }} className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-700 hover:underline">
          All lives <ArrowRight className="size-3.5" />
        </Link>
      }
    >
      {!data && <ListSkeleton />}
      {data && data.live.top.length === 0 && (
        <EmptyState icon={<Radio />} title="Nobody is live" description="Lives appear here as soon as they start." />
      )}
      {data && data.live.top.length > 0 && (
        <ul className="divide-y divide-zinc-100">
          {data.live.top.map((live) => (
            <li
              key={live.id}
              className="flex cursor-pointer items-center gap-4 px-5 py-3 hover:bg-zinc-50"
              onClick={(event) => {
                if ((event.target as HTMLElement).closest('a')) return
                void navigate({ to: '/streams/$streamId', params: { streamId: live.id } })
              }}
            >
              <div className="min-w-0 flex-1">
                <Link
                  to="/streams/$streamId"
                  params={{ streamId: live.id }}
                  className="block truncate font-medium text-zinc-900 hover:underline"
                >
                  {liveName(live)}
                </Link>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
                  <PersonLink person={live.host} compact className="text-xs font-normal text-zinc-600" />
                  <span aria-hidden>·</span>
                  <span className="tabular-nums">{formatDuration(live.startedAt)}</span>
                </div>
              </div>
              <div className="text-right">
                <p className="font-medium text-zinc-900 tabular-nums">{formatNumber(live.viewerCount)}</p>
                <p className="text-xs text-zinc-500">watching</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function ListSkeleton() {
  return (
    <div className="space-y-4 p-5">
      {[0, 1, 2].map((row) => (
        <div key={row} className="space-y-2">
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  )
}
