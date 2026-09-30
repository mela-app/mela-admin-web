import { Link, useNavigate } from '@tanstack/react-router'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import { Radio } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { StreamsSearch } from '../../app/search'
import { PersonLink } from '../../components/PersonLink'
import { StreamStatusBadge } from '../../components/StatusBadges'
import { DataTable, Pagination } from '../../components/ui/DataTable'
import { EmptyState } from '../../components/ui/feedback'
import { RelativeTime } from '../../components/ui/misc'
import { formatDateTime, formatDuration, formatNumber } from '../../lib/format'
import { END_REASON_LABELS } from '../../lib/labels'
import { useStreams } from '../../lib/queries'
import { DEFAULT_PAGE_SIZE } from '../../lib/search'
import type { StreamRow } from '../../lib/types'

interface StreamsTableProps {
  search: StreamsSearch
  onPageChange: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  onSortChange?: (sort: StreamsSearch['sort'], order: StreamsSearch['order']) => void
  hideHost?: boolean
  emptyText?: string
}

export function StreamsTable({ search, onPageChange, onPageSizeChange, onSortChange, hideHost, emptyText }: StreamsTableProps) {
  const streams = useStreams(search)
  const navigate = useNavigate()
  const columns = useMemo(() => streamColumns(hideHost ?? false), [hideHost])
  const sorting: SortingState = [{ id: search.sort ?? 'startedAt', desc: (search.order ?? 'desc') === 'desc' }]

  return (
    <>
      <DataTable
        label="Lives"
        columns={columns}
        data={streams.data?.items}
        getRowId={(row) => row.id}
        loading={streams.isFetching}
        error={streams.error}
        onRetry={() => void streams.refetch()}
        onRowClick={(row) => void navigate({ to: '/streams/$streamId', params: { streamId: row.id } })}
        sorting={sorting}
        onSortingChange={
          onSortChange
            ? (next) => {
                const first = next[0]
                if (!first) return
                const sort = first.id === 'startedAt' ? undefined : (first.id as StreamsSearch['sort'])
                onSortChange(sort, first.desc ? undefined : 'asc')
              }
            : undefined
        }
        empty={<EmptyState icon={<Radio />} title="No lives found" description={emptyText ?? 'Try another status or date range.'} />}
      />
      {streams.data && streams.data.total > 0 && (
        <Pagination
          page={search.page ?? 1}
          pageSize={search.pageSize ?? DEFAULT_PAGE_SIZE}
          total={streams.data.total}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      )}
    </>
  )
}

/** A host's lives, paged locally - for their account page. */
export function HostStreamsTable({ hostId }: { hostId: string }) {
  const [page, setPage] = useState(1)
  return (
    <StreamsTable
      search={{ hostId, page }}
      onPageChange={setPage}
      hideHost
      emptyText="This account has never gone live."
    />
  )
}

function streamColumns(hideHost: boolean): Array<ColumnDef<StreamRow>> {
  const columns: Array<ColumnDef<StreamRow>> = [
    {
      id: 'title',
      header: 'Live',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="block max-w-80 leading-tight">
          <Link
            to="/streams/$streamId"
            params={{ streamId: row.original.id }}
            className="block truncate font-medium text-zinc-900 hover:underline"
          >
            {row.original.title}
          </Link>
          <span className="block truncate text-xs text-zinc-500">{row.original.category ?? 'No category'}</span>
        </span>
      ),
    },
    {
      id: 'host',
      header: 'Host',
      enableSorting: false,
      cell: ({ row }) => <PersonLink person={row.original.host} />,
    },
    {
      id: 'status',
      header: 'Status',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="flex flex-col items-start gap-0.5">
          <StreamStatusBadge status={row.original.status} />
          {row.original.status === 'ENDED' && row.original.endedReason && (
            <span className="text-xs text-zinc-500">{END_REASON_LABELS[row.original.endedReason]}</span>
          )}
        </span>
      ),
    },
    {
      id: 'startedAt',
      header: 'Started',
      accessorFn: (row) => row.startedAt,
      cell: ({ row }) => (
        <span className="block leading-tight">
          <span className="block whitespace-nowrap text-zinc-900">{formatDateTime(row.original.startedAt)}</span>
          <RelativeTime value={row.original.startedAt} className="text-xs text-zinc-500" />
        </span>
      ),
    },
    {
      id: 'duration',
      header: 'Duration',
      enableSorting: false,
      meta: { align: 'right' },
      cell: ({ row }) => formatDuration(row.original.startedAt, row.original.endedAt),
    },
    {
      id: 'peakViewerCount',
      header: 'Viewers',
      accessorFn: (row) => row.peakViewerCount,
      meta: { align: 'right' },
      cell: ({ row }) =>
        row.original.status === 'LIVE' ? (
          <span title="Watching now">{formatNumber(row.original.viewerCount ?? 0)} now</span>
        ) : (
          <span title="Most at once">{formatNumber(row.original.peakViewerCount)} peak</span>
        ),
    },
    {
      id: 'likeCount',
      header: 'Likes',
      accessorFn: (row) => row.likeCount,
      meta: { align: 'right' },
      cell: ({ row }) => formatNumber(row.original.likeCount),
    },
  ]
  return hideHost ? columns.filter((column) => column.id !== 'host') : columns
}
