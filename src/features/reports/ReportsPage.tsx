import { getRouteApi } from '@tanstack/react-router'
import { Flag } from 'lucide-react'
import type { ReportsSearch } from '../../app/search'
import { Badge } from '../../components/ui/Badge'
import { Card } from '../../components/ui/Card'
import { Pagination } from '../../components/ui/DataTable'
import { Callout, EmptyState, ErrorState, Skeleton } from '../../components/ui/feedback'
import { Segmented, Select } from '../../components/ui/forms'
import { PageHeader, RelativeTime } from '../../components/ui/misc'
import { cn } from '../../lib/cn'
import { formatNumber } from '../../lib/format'
import { REPORT_REASON_LABELS } from '../../lib/labels'
import { useReports } from '../../lib/queries'
import { DEFAULT_PAGE_SIZE } from '../../lib/search'
import type { ReportCaseRow, ReportCaseStatus, ReportTargetType } from '../../lib/types'
import { ReportCase } from './ReportCase'

const routeApi = getRouteApi('/_app/reports')

const TYPE_FILTERS: Array<{ value: ReportTargetType; label: string }> = [
  { value: 'LIVE', label: 'Lives' },
  { value: 'CHAT_MESSAGE', label: 'Chat messages' },
  { value: 'USER', label: 'Accounts' },
  { value: 'DIRECT_MESSAGE', label: 'Private messages' },
]

const STATUS_FILTERS: Array<{ value: ReportCaseStatus; label: string }> = [
  { value: 'OPEN', label: 'Open' },
  { value: 'ACTIONED', label: 'Action taken' },
  { value: 'DISMISSED', label: 'No violation' },
]

/**
 * What people reported in the app (docs/features/moderation.md): one case
 * per reported thing, however many reported it - the urgent and latest
 * first - with the case open beside the list.
 */
export function ReportsPage() {
  const search = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const reports = useReports(search)
  const status = search.status ?? 'OPEN'

  const update = (patch: Partial<ReportsSearch>) => void navigate({ search: (previous) => ({ ...previous, ...patch }) })
  // Another filter starts over: the first page, nothing open.
  const refilter = (patch: Partial<ReportsSearch>) => update({ ...patch, page: undefined, report: undefined })

  const page = reports.data
  const rows = page?.items ?? []

  return (
    <>
      <PageHeader
        title="Reports"
        description="What people reported in the app - lives, chat and private messages, accounts. One case per reported thing, however many reported it."
      />
      <Callout className="mb-6" title="Decide within 24 hours">
        The app tells people their report is reviewed within a day. Urgent ones - a child at risk, someone who may hurt
        themselves - come first. Whoever reported it hears the outcome, never who decided.
      </Callout>

      <Card flush>
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 p-4">
          <Segmented<ReportCaseStatus>
            label="Status"
            value={status}
            options={STATUS_FILTERS}
            onChange={(next) => refilter({ status: next === 'OPEN' ? undefined : next })}
          />
          <Select
            aria-label="What was reported"
            className="w-full sm:w-48"
            value={search.type ?? ''}
            onChange={(event) => refilter({ type: (event.target.value || undefined) as ReportTargetType | undefined })}
          >
            <option value="">Everything</option>
            {TYPE_FILTERS.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid xl:grid-cols-[24rem_minmax(0,1fr)]">
          <section aria-label="Reported things" className="border-b border-zinc-200 xl:border-r xl:border-b-0">
            {page && (
              <p className="border-b border-zinc-100 px-4 py-2.5 text-[13px] text-zinc-500">
                {formatNumber(page.total)} {status === 'OPEN' ? 'open' : 'decided'} {page.total === 1 ? 'case' : 'cases'}
              </p>
            )}
            {reports.isPending && <ListSkeleton />}
            {reports.isError && !page && <ErrorState error={reports.error} onRetry={() => void reports.refetch()} />}
            {page && rows.length === 0 && (
              <EmptyState
                icon={<Flag />}
                title={status === 'OPEN' ? 'Nothing to review' : 'None yet'}
                description={
                  status === 'OPEN'
                    ? 'New reports from the app show here as they come in.'
                    : 'Reports decided this way show here.'
                }
              />
            )}
            {rows.length > 0 && (
              <ul className="divide-y divide-zinc-100">
                {rows.map((row) => (
                  <li key={row.id}>
                    <CaseRow row={row} selected={row.id === search.report} onOpen={() => update({ report: row.id })} />
                  </li>
                ))}
              </ul>
            )}
            {page && page.total > page.pageSize && (
              <Pagination
                page={search.page ?? 1}
                pageSize={search.pageSize ?? DEFAULT_PAGE_SIZE}
                total={page.total}
                onPageChange={(next) => update({ page: next > 1 ? next : undefined, report: undefined })}
              />
            )}
          </section>

          <section aria-label="The report" className="min-w-0">
            {search.report ? (
              <ReportCase key={search.report} caseId={search.report} />
            ) : (
              <EmptyState
                icon={<Flag />}
                title="Pick a report"
                description="What was reported, who reported it and why show here - with what you can do about it."
              />
            )}
          </section>
        </div>
      </Card>
    </>
  )
}

function CaseRow({ row, selected, onOpen }: { row: ReportCaseRow; selected: boolean; onOpen(): void }) {
  const reasons = row.reasons
    .map(({ reason, count }) => (count > 1 ? `${REPORT_REASON_LABELS[reason]} ×${count}` : REPORT_REASON_LABELS[reason]))
    .join(' · ')
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
      <span className="min-w-0 flex-1 leading-tight">
        <span className="flex items-center gap-1.5">
          {row.urgent && <Badge tone="danger">Urgent</Badge>}
          <span className="truncate text-[13px] font-medium text-zinc-900">{row.label}</span>
        </span>
        <span className="mt-1 block truncate text-xs text-zinc-500">{reasons}</span>
      </span>
      <span className="shrink-0 text-right text-xs leading-tight tabular-nums">
        <RelativeTime
          value={row.status === 'OPEN' ? row.lastReportedAt : row.resolvedAt}
          className="block text-zinc-600"
        />
        <span className="block text-zinc-400">
          {formatNumber(row.reportCount)} {row.reportCount === 1 ? 'report' : 'reports'}
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
