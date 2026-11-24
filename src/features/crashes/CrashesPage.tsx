import { getRouteApi } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { Bug } from 'lucide-react'
import { useMemo } from 'react'
import { PersonLink } from '../../components/PersonLink'
import { Badge, type BadgeTone } from '../../components/ui/Badge'
import { Card, Stat } from '../../components/ui/Card'
import { DataTable, Pagination } from '../../components/ui/DataTable'
import { Dialog } from '../../components/ui/Dialog'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/feedback'
import { Checkbox, Segmented, Select } from '../../components/ui/forms'
import { PageHeader, RelativeTime } from '../../components/ui/misc'
import { formatPrecise } from '../../lib/format'
import { useCrashGroups, useCrashReports, type CrashFilters } from '../../lib/queries'
import { DEFAULT_PAGE_SIZE } from '../../lib/search'
import type { AppCrashKind, CrashGroup, CrashGroupPage, CrashReport } from '../../lib/types'

const routeApi = getRouteApi('/_app/crashes')

const DAY_OPTIONS = [
  { value: '1', label: '24 hours' },
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
] as const

const CRASH_KIND_LABELS: Record<AppCrashKind, string> = {
  NATIVE_CRASH: 'Native crash',
  JAVA_CRASH: 'Java crash',
  ANR: 'Froze (not responding)',
  LOW_MEMORY: 'Out of memory',
  KILLED: 'Killed by Android',
  OTHER: 'Closed (other)',
  DART_ERROR: 'App error',
}

const KIND_TONES: Record<AppCrashKind, BadgeTone> = {
  NATIVE_CRASH: 'danger',
  JAVA_CRASH: 'danger',
  ANR: 'warning',
  LOW_MEMORY: 'warning',
  KILLED: 'warning',
  OTHER: 'warning',
  DART_ERROR: 'neutral',
}

/**
 * What's going wrong in the app on people's phones (docs/features/app-crashes.md):
 * the app closing by itself - a crash, a freeze, Android killing it for memory -
 * and errors it lived through, grouped so the most common comes first. Each
 * report has the phone, the app version, who, the steps just before and the
 * stack.
 */
export function CrashesPage() {
  const search = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const days = Number(search.days ?? '7')
  const filters: CrashFilters = { days, kind: search.kind, appVersion: search.version, fatal: search.fatal }
  const groups = useCrashGroups(filters, search.page ?? 1)
  const columns = useMemo(() => crashColumns(), [])
  const open = groups.data?.items.find((group) => group.signature === search.crash)

  const setFilter = (next: Partial<typeof search>) =>
    void navigate({ search: (previous) => ({ ...previous, ...next, page: undefined, crash: undefined }) })

  return (
    <>
      <PageHeader
        title="Crashes"
        description="When the app closes by itself on someone's phone - a crash, a freeze, or Android closing it for memory - it's reported here the next time they open it, with the steps they took just before. Errors the app lived through are listed too. The most common come first."
      />
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            label="Time"
            value={String(days) as (typeof DAY_OPTIONS)[number]['value']}
            options={DAY_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
            onChange={(value) => setFilter({ days: value === '7' ? undefined : value })}
          />
          <Select
            aria-label="Kind"
            value={search.kind ?? ''}
            onChange={(event) => setFilter({ kind: (event.target.value || undefined) as AppCrashKind | undefined })}
          >
            <option value="">Every kind</option>
            {(Object.keys(CRASH_KIND_LABELS) as AppCrashKind[]).map((kind) => (
              <option key={kind} value={kind}>
                {CRASH_KIND_LABELS[kind]}
              </option>
            ))}
          </Select>
          <Select
            aria-label="App version"
            value={search.version ?? ''}
            onChange={(event) => setFilter({ version: event.target.value || undefined })}
          >
            <option value="">Every version</option>
            {(groups.data?.versions ?? []).map((version) => (
              <option key={version} value={version}>
                {version}
              </option>
            ))}
          </Select>
          <Checkbox
            label="Only when the app closed"
            checked={search.fatal ?? false}
            onChange={(event) => setFilter({ fatal: event.target.checked || undefined })}
          />
        </div>

        <Summary data={groups.data} loading={groups.isPending} />

        <Card title="Crashes, most common first" flush>
          <DataTable
            label="Crashes"
            columns={columns}
            data={groups.data?.items}
            getRowId={(row) => row.signature}
            loading={groups.isFetching}
            error={groups.error}
            onRetry={() => void groups.refetch()}
            onRowClick={(row) => void navigate({ search: (previous) => ({ ...previous, crash: row.signature }) })}
            fixedMinWidth="min-w-[860px]"
            empty={
              <EmptyState
                icon={<Bug />}
                title="Nothing reported"
                description="No crashes or errors from phones in this time. Phones report from version 1.0.13 on."
              />
            }
          />
          {groups.data && groups.data.total > 0 && (
            <Pagination
              page={search.page ?? 1}
              pageSize={DEFAULT_PAGE_SIZE}
              total={groups.data.total}
              onPageChange={(page) => void navigate({ search: (previous) => ({ ...previous, page }) })}
            />
          )}
        </Card>
      </div>
      <CrashDetail
        group={open}
        signature={search.crash}
        days={days}
        onClose={() => void navigate({ search: (previous) => ({ ...previous, crash: undefined }) })}
      />
    </>
  )
}

function Summary({ data, loading }: { data: CrashGroupPage | undefined; loading: boolean }) {
  if (loading && !data) return <Skeleton className="h-28" />
  if (!data) return null
  const peak = Math.max(1, ...data.days.map((day) => day.fatal + day.errors))
  return (
    <Card>
      <div className="grid gap-6 sm:grid-cols-4">
        <Stat label="App closed by itself" value={data.totals.fatal} hint="crashes, freezes, memory" />
        <Stat label="All reports" value={data.totals.reports} hint="with errors it lived through" />
        <Stat label="People affected" value={data.totals.users} hint="signed in when it happened" />
        <Stat label="Different problems" value={data.total} />
      </div>
      {data.days.length > 1 && (
        <div className="mt-5">
          <div className="flex h-16 items-end gap-0.5" aria-label="Reports per day">
            {data.days.map((day) => (
              <div
                key={day.day}
                className="flex flex-1 flex-col justify-end"
                title={`${day.day}: ${day.fatal} closed, ${day.errors} errors`}
              >
                <div className="bg-zinc-200" style={{ height: `${(day.errors / peak) * 64}px` }} />
                <div className="bg-red-500" style={{ height: `${(day.fatal / peak) * 64}px` }} />
              </div>
            ))}
          </div>
          <p className="mt-1.5 flex gap-4 text-xs text-zinc-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-red-500" /> App closed
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-zinc-200" /> Errors
            </span>
          </p>
        </div>
      )}
    </Card>
  )
}

function crashColumns(): Array<ColumnDef<CrashGroup>> {
  return [
    {
      id: 'kind',
      header: 'Kind',
      meta: { className: 'w-44' },
      cell: ({ row }) => <Badge tone={KIND_TONES[row.original.kind]}>{CRASH_KIND_LABELS[row.original.kind]}</Badge>,
    },
    {
      id: 'message',
      header: 'What happened',
      cell: ({ row }) => (
        <span className="block truncate font-mono text-xs text-zinc-800" title={row.original.message}>
          {row.original.message}
        </span>
      ),
    },
    {
      id: 'count',
      header: 'Times',
      meta: { className: 'w-20 text-right' },
      cell: ({ row }) => <span className="tabular-nums">{row.original.count}</span>,
    },
    {
      id: 'users',
      header: 'People',
      meta: { className: 'w-20 text-right' },
      cell: ({ row }) => <span className="tabular-nums">{row.original.users}</span>,
    },
    {
      id: 'versions',
      header: 'Versions',
      meta: { className: 'w-32' },
      cell: ({ row }) => (
        <span className="block truncate text-xs text-zinc-600" title={row.original.versions.join(', ')}>
          {row.original.versions.join(', ') || 'Unknown'}
        </span>
      ),
    },
    {
      id: 'lastSeen',
      header: 'Last',
      meta: { className: 'w-28' },
      cell: ({ row }) => <RelativeTime value={row.original.lastSeen} className="text-xs text-zinc-600" />,
    },
  ]
}

function CrashDetail({
  group,
  signature,
  days,
  onClose,
}: {
  group: CrashGroup | undefined
  signature: string | undefined
  days: number
  onClose: () => void
}) {
  const reports = useCrashReports(signature, days, 1)
  return (
    <Dialog
      open={Boolean(signature)}
      onClose={onClose}
      title={group ? CRASH_KIND_LABELS[group.kind] : 'Crash'}
      description={
        group
          ? `${group.count} times to ${group.users} people · first ${formatPrecise(group.firstSeen)} · devices: ${group.devices.join(', ') || 'unknown'}`
          : undefined
      }
      variant="panel"
      size="lg"
    >
      {reports.isPending && <Skeleton className="h-40" />}
      {reports.error && <ErrorState error={reports.error} onRetry={() => void reports.refetch()} />}
      <div className="space-y-5">
        {reports.data?.items.map((report) => (
          <ReportView key={report.id} report={report} />
        ))}
        {reports.data && reports.data.total > reports.data.items.length && (
          <p className="text-xs text-zinc-500">
            The latest {reports.data.items.length} of {reports.data.total} reports.
          </p>
        )}
      </div>
    </Dialog>
  )
}

function ReportView({ report }: { report: CrashReport }) {
  return (
    <section className="rounded-lg border border-zinc-200 p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-zinc-600">
        <time dateTime={report.occurredAt} className="font-medium text-zinc-900">
          {formatPrecise(report.occurredAt)}
        </time>
        <span>
          {report.appVersion ? `v${report.appVersion}${report.appBuild ? ` (${report.appBuild})` : ''}` : 'Unknown version'}
        </span>
        <span>{[report.deviceModel, report.osVersion].filter(Boolean).join(' · ') || 'Unknown phone'}</span>
        <span className="ml-auto">
          {report.user ? <PersonLink person={report.user} compact /> : <span className="text-zinc-400">Signed out</span>}
        </span>
      </div>
      <p className="mt-2 font-mono text-xs break-words whitespace-pre-wrap text-zinc-900">{report.message}</p>
      {report.breadcrumbs.length > 0 && (
        <div className="mt-3">
          <h4 className="text-xs font-medium text-zinc-500">Just before</h4>
          <ol className="mt-1 space-y-0.5 font-mono text-[11px] text-zinc-700">
            {report.breadcrumbs.map((crumb, index) => (
              <li key={index} className="break-words">
                {crumb}
              </li>
            ))}
          </ol>
        </div>
      )}
      {report.stack && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-zinc-600">Stack</summary>
          <pre className="mt-1 max-h-80 overflow-auto rounded bg-zinc-50 p-2 text-[11px] leading-snug text-zinc-800">
            {report.stack}
          </pre>
        </details>
      )}
    </section>
  )
}
