import { getRouteApi, Link } from '@tanstack/react-router'
import { Download, Radio } from 'lucide-react'
import type { AnalyticsRange } from '../../app/search'
import { DailyBars } from '../../components/DailyBars'
import { Button } from '../../components/ui/Button'
import { Card, Stat } from '../../components/ui/Card'
import { Callout, EmptyState, ErrorState, Skeleton } from '../../components/ui/feedback'
import { Segmented } from '../../components/ui/forms'
import { Avatar, PageHeader } from '../../components/ui/misc'
import { useAuth } from '../../lib/auth-context'
import { formatDate, formatNumber } from '../../lib/format'
import { useAnalytics } from '../../lib/queries'
import type { AnalyticsOverview } from '../../lib/types'
import { analyticsCsv, downloadCsv, PHONE_LABELS, rangeEnding, SOURCE_LABELS } from './analytics-data'

const routeApi = getRouteApi('/_app/analytics')

const RANGES: Array<{ value: AnalyticsRange; label: string }> = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
]

const hours = (minutes: number) => (minutes < 600 ? `${formatNumber(minutes)} min` : `${formatNumber(Math.round(minutes / 60))} h`)

const percentText = (value: number | null) => (value === null ? '—' : `${value}%`)

/**
 * Whether Mela grows (docs/features/analytics.md): who uses it and comes
 * back, lives and watching, the hosts watched most, and where installs come
 * from. Days are UTC.
 */
export function AnalyticsPage() {
  const search = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const range = search.range ?? '30'
  const { from, to } = rangeEnding(Number(range))
  const analytics = useAnalytics(from, to)
  const data = analytics.data

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Whether Mela is growing: who uses it and comes back, how much is watched, and where new people come from. Days are UTC."
        actions={
          <>
            <Segmented<AnalyticsRange>
              label="Period"
              value={range}
              options={RANGES}
              onChange={(next) => void navigate({ search: { range: next === '30' ? undefined : next }, replace: true })}
            />
            <Button
              icon={<Download />}
              disabled={!data}
              onClick={() => data && downloadCsv(analyticsCsv(data), `mela-analytics-${data.from}-to-${data.to}.csv`)}
            >
              Export CSV
            </Button>
          </>
        }
      />
      {analytics.isPending && <AnalyticsSkeleton />}
      {analytics.isError && !data && <ErrorState error={analytics.error} onRetry={() => void analytics.refetch()} />}
      {data && <AnalyticsBody data={data} />}
    </>
  )
}

function AnalyticsBody({ data }: { data: AnalyticsOverview }) {
  const { totals } = data
  const tracking = data.trackingSince
  return (
    <div className="space-y-6">
      {(!tracking || tracking > data.from) && (
        <Callout title={tracking ? `Active users are counted from ${formatDate(tracking)}` : 'Active users are counted from now on'}>
          Coming back and watch time started being recorded with this update, so earlier days show none. New accounts
          and lives go back further. Install sources need the app version that reports them.
        </Callout>
      )}

      <div className="grid gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Active today" value={formatNumber(totals.dailyActive)} hint={`${formatNumber(totals.users)} accounts in total`} />
        <Kpi label="Active this week" value={formatNumber(totals.weeklyActive)} hint="The last 7 days" />
        <Kpi
          label="Active this month"
          value={formatNumber(totals.monthlyActive)}
          hint={totals.stickiness === null ? 'The last 30 days' : `${totals.stickiness}% of them come on a given day`}
        />
        <Kpi
          label="New accounts"
          value={formatNumber(totals.newUsers)}
          hint={`${formatNumber(totals.installs)} installs reported`}
        />
      </div>

      <Card title="Active users and new accounts" description="People who used the app each day, and accounts created.">
        <DailyBars
          label="Active users and new accounts per day"
          data={data.days}
          series={[
            { key: 'activeUsers', label: 'Active users', fill: 'fill-brand-500', swatch: 'bg-brand-500' },
            { key: 'newUsers', label: 'New accounts', fill: 'fill-zinc-300', swatch: 'bg-zinc-300' },
          ]}
        />
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card
          title="Lives"
          description={`${formatNumber(totals.lives)} lives, ${hours(totals.liveMinutes)} live in all.`}
        >
          <DailyBars
            label="Lives started per day"
            data={data.days}
            series={[{ key: 'lives', label: 'Lives started', fill: 'fill-brand-500', swatch: 'bg-brand-500' }]}
          />
        </Card>
        <Card
          title="Watching"
          description={`${hours(totals.viewerMinutes)} watched in all - one viewer for a minute is a minute.`}
        >
          <DailyBars
            label="Minutes watched per day"
            data={data.days}
            series={[{ key: 'viewerMinutes', label: 'Minutes watched', fill: 'fill-emerald-500', swatch: 'bg-emerald-500' }]}
          />
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <RetentionCard data={data} />
        <div className="space-y-6">
          <InstallSourcesCard data={data} />
          <PlatformsCard data={data} />
        </div>
      </div>

      <TopHostsCard data={data} />
    </div>
  )
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white p-5">
      <Stat label={label} value={value} hint={hint} />
    </div>
  )
}

function RetentionCard({ data }: { data: AnalyticsOverview }) {
  return (
    <Card
      title="Coming back"
      description="Of the people who joined each week, how many used the app again: the next day, in their second week, and a month later."
      flush
    >
      {data.retention.length === 0 ? (
        <EmptyState title="No sign-ups in these weeks" description="Weeks with new accounts show here." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                <th className="px-5 py-2 font-medium">Joined in the week of</th>
                <th className="px-3 py-2 text-right font-medium">People</th>
                <th className="px-3 py-2 text-right font-medium">Next day</th>
                <th className="px-3 py-2 text-right font-medium">Week 2</th>
                <th className="px-5 py-2 text-right font-medium">A month on</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 tabular-nums">
              {data.retention.map((row) => (
                <tr key={row.week}>
                  <td className="px-5 py-2.5 text-zinc-900">{formatDate(row.week)}</td>
                  <td className="px-3 py-2.5 text-right text-zinc-700">{formatNumber(row.size)}</td>
                  <td className="px-3 py-2.5 text-right">{percentText(row.d1)}</td>
                  <td className="px-3 py-2.5 text-right">{percentText(row.d7)}</td>
                  <td className="px-5 py-2.5 text-right">{percentText(row.d30)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-5 py-3 text-xs text-zinc-500">— : not long enough ago to tell yet.</p>
        </div>
      )}
    </Card>
  )
}

function ShareBars({ rows }: { rows: Array<{ label: string; count: number }> }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0)
  return (
    <ul className="space-y-3">
      {rows.map((row) => {
        const share = total > 0 ? Math.round((row.count / total) * 100) : 0
        return (
          <li key={row.label}>
            <div className="flex justify-between gap-3 text-[13px]">
              <span className="text-zinc-700">{row.label}</span>
              <span className="text-zinc-500 tabular-nums">
                {formatNumber(row.count)} · {share}%
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${share}%` }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function InstallSourcesCard({ data }: { data: AnalyticsOverview }) {
  return (
    <Card title="Where installs come from" description="As Google Play tells the app on its first launch.">
      {data.installSources.length === 0 ? (
        <p className="text-[13px] text-zinc-500">None reported in this period yet.</p>
      ) : (
        <ShareBars
          rows={data.installSources.map((row) => ({ label: SOURCE_LABELS[row.source] ?? row.source, count: row.count }))}
        />
      )}
    </Card>
  )
}

function PlatformsCard({ data }: { data: AnalyticsOverview }) {
  const rows = data.totals.monthlyByPlatform
  return (
    <Card title="This month's users, by phone" description="The app reports it with this update; older versions show as unknown.">
      {rows.length === 0 ? (
        <p className="text-[13px] text-zinc-500">Nobody yet.</p>
      ) : (
        <ShareBars rows={rows.map((row) => ({ label: PHONE_LABELS[row.platform], count: row.users }))} />
      )}
    </Card>
  )
}

function TopHostsCard({ data }: { data: AnalyticsOverview }) {
  const auth = useAuth()
  return (
    <Card title="Hosts watched most" description="By minutes watched in their lives this period." flush>
      {data.topHosts.length === 0 ? (
        <EmptyState icon={<Radio />} title="No lives in this period" description="The hosts watched most show here." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                <th className="px-5 py-2 font-medium">Host</th>
                <th className="px-3 py-2 text-right font-medium">Lives</th>
                <th className="px-3 py-2 text-right font-medium">Watched</th>
                <th className="px-3 py-2 text-right font-medium">Viewers</th>
                <th className="px-3 py-2 text-right font-medium">Most at once</th>
                <th className="px-5 py-2 text-right font-medium">Likes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 tabular-nums">
              {data.topHosts.map((row) => {
                const who = (
                  <span className="flex items-center gap-2.5">
                    <Avatar name={row.host.displayName} url={row.host.avatarUrl} size="sm" />
                    <span className="min-w-0 leading-tight">
                      <span className="block truncate font-medium text-zinc-900">{row.host.displayName}</span>
                      <span className="block truncate text-xs text-zinc-500">@{row.host.username}</span>
                    </span>
                  </span>
                )
                return (
                  <tr key={row.host.id}>
                    <td className="px-5 py-2.5">
                      {auth.can('VIEW_USERS') ? (
                        <Link to="/users/$userId" params={{ userId: row.host.id }} className="hover:underline">
                          {who}
                        </Link>
                      ) : (
                        who
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">{formatNumber(row.lives)}</td>
                    <td className="px-3 py-2.5 text-right">{hours(row.viewerMinutes)}</td>
                    <td className="px-3 py-2.5 text-right">{formatNumber(row.viewers)}</td>
                    <td className="px-3 py-2.5 text-right">{formatNumber(row.peakViewers)}</td>
                    <td className="px-5 py-2.5 text-right">{formatNumber(row.likes)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-28 w-full rounded-lg" />
      <Skeleton className="h-64 w-full rounded-lg" />
      <div className="grid gap-6 xl:grid-cols-2">
        <Skeleton className="h-64 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    </div>
  )
}
