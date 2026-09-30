import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type Updater,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import type { MouseEvent, ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { formatNumber } from '../../lib/format'
import { PAGE_SIZES } from '../../lib/search'
import { IconButton } from './Button'
import { ErrorState, Skeleton } from './feedback'

/** Per-column presentation, read from a column's `meta`. */
export interface ColumnStyle {
  align?: 'right'
  className?: string
}

interface DataTableProps<T> {
  label: string
  columns: Array<ColumnDef<T>>
  data: T[] | undefined
  getRowId: (row: T) => string
  loading?: boolean
  error?: unknown
  onRetry?: () => void
  empty?: ReactNode
  onRowClick?: (row: T) => void
  /** Server-side sorting: the column id is the API's sort key. */
  sorting?: SortingState
  onSortingChange?: (sorting: SortingState) => void
  skeletonRows?: number
  /**
   * A fixed layout at this minimum width (a Tailwind class): column widths come
   * from each column's `meta.className` and long text truncates instead of
   * widening the table. Narrower screens scroll sideways.
   */
  fixedMinWidth?: string
}

const NO_ROWS: never[] = []

export function DataTable<T>({
  label,
  columns,
  data,
  getRowId,
  loading = false,
  error,
  onRetry,
  empty,
  onRowClick,
  sorting,
  onSortingChange,
  skeletonRows = 8,
  fixedMinWidth,
}: DataTableProps<T>) {
  const table = useReactTable<T>({
    data: data ?? NO_ROWS,
    columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    enableSortingRemoval: false,
    enableMultiSort: false,
    sortDescFirst: true,
    state: { sorting: sorting ?? [] },
    onSortingChange: (updater: Updater<SortingState>) => {
      const next = typeof updater === 'function' ? updater(sorting ?? []) : updater
      onSortingChange?.(next)
    },
  })

  const rows = table.getRowModel().rows
  const columnCount = table.getVisibleLeafColumns().length
  const showSkeleton = loading && !data

  function clickRow(event: MouseEvent<HTMLTableRowElement>, row: T) {
    if (!onRowClick) return
    // Links, buttons and text selection inside the row keep their own behaviour.
    if ((event.target as HTMLElement).closest('a, button, input, select, textarea, label')) return
    if (window.getSelection()?.toString()) return
    onRowClick(row)
  }

  return (
    <div className="relative overflow-x-auto">
      <table
        className={cn('w-full border-collapse text-left text-sm', fixedMinWidth ? cn('table-fixed', fixedMinWidth) : 'min-w-max')}
        aria-label={label}
        aria-busy={loading || undefined}
      >
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id} className="border-b border-zinc-200 bg-zinc-50/80">
              {group.headers.map((header) => {
                const style = header.column.columnDef.meta as ColumnStyle | undefined
                const sortable = header.column.getCanSort() && onSortingChange
                const direction = header.column.getIsSorted()
                return (
                  <th
                    key={header.id}
                    scope="col"
                    aria-sort={direction ? (direction === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={cn(
                      'h-9 px-4 text-xs font-medium whitespace-nowrap text-zinc-500 first:pl-5 last:pr-5',
                      style?.align === 'right' && 'text-right',
                      style?.className,
                    )}
                  >
                    {header.isPlaceholder ? null : sortable ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className={cn(
                          'inline-flex items-center gap-1 rounded hover:text-zinc-900',
                          direction && 'text-zinc-900',
                          style?.align === 'right' && 'flex-row-reverse',
                        )}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {direction === 'asc' ? (
                          <ArrowUp className="size-3.5" aria-hidden />
                        ) : direction === 'desc' ? (
                          <ArrowDown className="size-3.5" aria-hidden />
                        ) : (
                          <ArrowUpDown className="size-3.5 text-zinc-300" aria-hidden />
                        )}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {showSkeleton &&
            Array.from({ length: skeletonRows }, (_, index) => (
              <tr key={`skeleton-${index}`} className="border-b border-zinc-100 last:border-0">
                {Array.from({ length: columnCount }, (__, cell) => (
                  <td key={cell} className="h-12 px-4 first:pl-5 last:pr-5">
                    <Skeleton className={cn('h-3.5', cell === 0 ? 'w-40' : 'w-20')} />
                  </td>
                ))}
              </tr>
            ))}
          {!showSkeleton &&
            rows.map((row) => (
              <tr
                key={row.id}
                onClick={(event) => clickRow(event, row.original)}
                className={cn(
                  'border-b border-zinc-100 last:border-0',
                  onRowClick && 'cursor-pointer hover:bg-zinc-50',
                )}
              >
                {row.getVisibleCells().map((cell) => {
                  const style = cell.column.columnDef.meta as ColumnStyle | undefined
                  return (
                    <td
                      key={cell.id}
                      className={cn(
                        'h-12 px-4 align-middle first:pl-5 last:pr-5',
                        style?.align === 'right' && 'text-right tabular-nums',
                        style?.className,
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  )
                })}
              </tr>
            ))}
        </tbody>
      </table>
      {!showSkeleton && error !== undefined && error !== null && !data && <ErrorState error={error} onRetry={onRetry} />}
      {!showSkeleton && data && rows.length === 0 && empty}
      {loading && data && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-brand-100" aria-hidden>
          <div className="h-full w-1/3 animate-pulse bg-brand-500" />
        </div>
      )}
    </div>
  )
}

interface PaginationProps {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
}

export function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 px-5 py-2.5 text-[13px] whitespace-nowrap text-zinc-600">
      <p className="tabular-nums">
        {total === 0 ? 'No results' : `${formatNumber(from)}–${formatNumber(to)} of ${formatNumber(total)}`}
      </p>
      <div className="flex items-center gap-4">
        {onPageSizeChange && (
          <label className="flex items-center gap-2">
            <span className="hidden sm:inline">Rows per page</span>
            <select
              aria-label="Rows per page"
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="h-7 rounded border border-zinc-300 bg-white px-1.5 text-[13px]"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="hidden tabular-nums sm:inline">
          Page {formatNumber(page)} of {formatNumber(pages)}
        </span>
        <div className="flex items-center gap-0.5">
          <IconButton label="First page" disabled={page <= 1} onClick={() => onPageChange(1)}>
            <ChevronsLeft />
          </IconButton>
          <IconButton label="Previous page" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            <ChevronLeft />
          </IconButton>
          <IconButton label="Next page" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
            <ChevronRight />
          </IconButton>
          <IconButton label="Last page" disabled={page >= pages} onClick={() => onPageChange(pages)}>
            <ChevronsRight />
          </IconButton>
        </div>
      </div>
    </div>
  )
}
