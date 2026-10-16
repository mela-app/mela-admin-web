import { Link } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { ScrollText } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { AuditSearch } from '../../app/search'
import { ActorRoleBadge } from '../../components/StatusBadges'
import { DataTable, Pagination } from '../../components/ui/DataTable'
import { Dialog } from '../../components/ui/Dialog'
import { EmptyState } from '../../components/ui/feedback'
import { DescriptionList } from '../../components/ui/Card'
import { Identifier, RelativeTime } from '../../components/ui/misc'
import { useAuth } from '../../lib/auth-context'
import { formatPrecise, formatTimestamp, localDay } from '../../lib/format'
import { ACTOR_ROLE_LABELS } from '../../lib/labels'
import { useAuditLog } from '../../lib/queries'
import { DEFAULT_PAGE_SIZE } from '../../lib/search'
import type { AuditEntry } from '../../lib/types'

const TARGET_NAMES: Record<string, string> = {
  USER: 'Account',
  STREAM: 'Live',
  MESSAGE: 'Chat message',
  ALERT: 'Alert',
  PHRASE: 'Banned phrase',
  CONVERSATION: 'Private conversation',
  APP_RELEASE: 'App update',
  DATA: 'Stored data',
  REPORT: 'Report',
}

interface AuditTableProps {
  search: AuditSearch
  onPageChange: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  emptyText?: string
  /** Three columns, for a narrow card on a detail page. */
  compact?: boolean
}

/** Audit entries for [search], newest first; a row opens the full entry. */
export function AuditTable({ search, onPageChange, onPageSizeChange, emptyText, compact = false }: AuditTableProps) {
  const log = useAuditLog(search)
  const [open, setOpen] = useState<AuditEntry | null>(null)
  const columns = useMemo(() => (compact ? compactColumns() : auditColumns()), [compact])
  return (
    <>
      <DataTable
        label="Audit log"
        columns={columns}
        data={log.data?.items}
        getRowId={(entry) => entry.id}
        loading={log.isFetching}
        error={log.error}
        onRetry={() => void log.refetch()}
        onRowClick={setOpen}
        fixedMinWidth={compact ? 'min-w-[36rem]' : 'min-w-[68rem]'}
        empty={
          <EmptyState
            icon={<ScrollText />}
            title="No matching activity"
            description={emptyText ?? 'Try a wider date range or fewer filters.'}
          />
        }
      />
      {log.data && log.data.total > 0 && (
        <Pagination
          page={search.page ?? 1}
          pageSize={search.pageSize ?? DEFAULT_PAGE_SIZE}
          total={log.data.total}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      )}
      <AuditEntryDialog entry={open} onClose={() => setOpen(null)} />
    </>
  )
}

/** An embedded audit trail - its page is local, not in the URL. */
export function ScopedAuditTable({ filter, emptyText }: { filter: AuditSearch; emptyText?: string }) {
  const [page, setPage] = useState(1)
  return <AuditTable search={{ ...filter, page }} onPageChange={setPage} emptyText={emptyText} compact />
}

function timeColumn(): ColumnDef<AuditEntry> {
  return {
    id: 'createdAt',
    header: 'Time',
    meta: { className: 'w-52' },
    cell: ({ row }) => (
      <span className="block leading-tight" title={formatPrecise(row.original.createdAt)}>
        <span className="block truncate text-[13px] text-zinc-900 tabular-nums">{formatTimestamp(row.original.createdAt)}</span>
        <RelativeTime value={row.original.createdAt} className="text-xs text-zinc-500" />
      </span>
    ),
  }
}

function actorColumn(): ColumnDef<AuditEntry> {
  return {
    id: 'actor',
    header: 'Who',
    meta: { className: 'w-44' },
    cell: ({ row }) => {
      const name = row.original.actorLabel ?? 'System'
      return (
        <span className="block leading-tight">
          <span className="block truncate font-medium text-zinc-900" title={name}>
            {name}
          </span>
          <span className="mt-1 block">
            <ActorRoleBadge role={row.original.actorRole} />
          </span>
        </span>
      )
    },
  }
}

function targetName(entry: AuditEntry): string {
  return TARGET_NAMES[entry.targetType ?? ''] ?? entry.targetType ?? ''
}

function compactColumns(): Array<ColumnDef<AuditEntry>> {
  return [
    timeColumn(),
    actorColumn(),
    {
      id: 'action',
      header: 'What happened',
      cell: ({ row }) => {
        const entry = row.original
        const detail = [entry.targetType && `${targetName(entry)}: ${entry.targetLabel ?? 'Untitled'}`, entry.reason]
          .filter(Boolean)
          .join(' · ')
        return (
          <span className="block leading-tight">
            <span className="block truncate text-zinc-900">{entry.actionLabel}</span>
            <span className="block truncate text-xs text-zinc-500" title={detail || undefined}>
              {detail || entry.categoryLabel}
            </span>
          </span>
        )
      },
    },
  ]
}

function auditColumns(): Array<ColumnDef<AuditEntry>> {
  return [
    timeColumn(),
    actorColumn(),
    {
      id: 'action',
      header: 'Action',
      meta: { className: 'w-60' },
      cell: ({ row }) => (
        <span className="block leading-tight">
          <span className="line-clamp-2 block text-zinc-900">{row.original.actionLabel}</span>
          <span className="block truncate text-xs text-zinc-500">{row.original.categoryLabel}</span>
        </span>
      ),
    },
    {
      id: 'target',
      header: 'On',
      meta: { className: 'w-48' },
      cell: ({ row }) =>
        row.original.targetType ? (
          <span className="block leading-tight">
            <span className="block truncate text-zinc-900" title={row.original.targetLabel ?? undefined}>
              {row.original.targetLabel ?? '—'}
            </span>
            <span className="block truncate text-xs text-zinc-500">{targetName(row.original)}</span>
          </span>
        ) : (
          <span className="text-zinc-400">—</span>
        ),
    },
    {
      id: 'reason',
      header: 'Reason',
      cell: ({ row }) =>
        row.original.reason ? (
          <span className="line-clamp-2 block text-[13px] text-zinc-700" title={row.original.reason}>
            {row.original.reason}
          </span>
        ) : (
          <span className="text-zinc-400">—</span>
        ),
    },
    {
      id: 'ip',
      header: 'IP address',
      meta: { className: 'w-36' },
      cell: ({ row }) => (
        <span className="block truncate font-mono text-xs text-zinc-600" title={row.original.ip ?? undefined}>
          {row.original.ip ?? '—'}
        </span>
      ),
    },
  ]
}

function AuditEntryDialog({ entry, onClose }: { entry: AuditEntry | null; onClose: () => void }) {
  return (
    <Dialog open={entry !== null} onClose={onClose} variant="panel" title={entry?.actionLabel ?? ''} description={entry && formatPrecise(entry.createdAt)}>
      {entry && <AuditEntryDetails entry={entry} onNavigate={onClose} />}
    </Dialog>
  )
}

function AuditEntryDetails({ entry, onNavigate }: { entry: AuditEntry; onNavigate: () => void }) {
  const auth = useAuth()
  const metadata = entry.metadata ?? {}
  const metaEntries = Object.entries(metadata)
  return (
    <div className="space-y-6">
      <DescriptionList
        items={[
          { label: 'Category', value: entry.categoryLabel },
          {
            label: 'Who',
            value: (
              <span className="flex flex-wrap items-center gap-2">
                {entry.actorId && auth.can('VIEW_USERS') ? (
                  <Link to="/users/$userId" params={{ userId: entry.actorId }} onClick={onNavigate} className="font-medium text-brand-700 hover:underline">
                    {entry.actorLabel ?? 'Account'}
                  </Link>
                ) : (
                  <span className="font-medium">{entry.actorLabel ?? 'System'}</span>
                )}
                <span className="text-zinc-500">as {ACTOR_ROLE_LABELS[entry.actorRole].toLowerCase()}</span>
              </span>
            ),
          },
          {
            label: 'On',
            hidden: !entry.targetType,
            value: (
              <span className="flex flex-wrap items-center gap-2">
                <TargetLink entry={entry} onNavigate={onNavigate} />
                <span className="text-zinc-500">{TARGET_NAMES[entry.targetType ?? ''] ?? entry.targetType}</span>
              </span>
            ),
          },
          {
            label: 'In live',
            hidden: !entry.streamId || entry.targetType === 'STREAM' || !auth.can('VIEW_LIVES'),
            value: entry.streamId && (
              <Link to="/streams/$streamId" params={{ streamId: entry.streamId }} onClick={onNavigate} className="text-brand-700 hover:underline">
                Open the live
              </Link>
            ),
          },
          { label: 'Reason', hidden: !entry.reason, value: <span className="whitespace-pre-wrap">{entry.reason}</span> },
          { label: 'IP address', value: <span className="font-mono text-[13px]">{entry.ip ?? 'Not recorded'}</span> },
          { label: 'Device', value: <span className="text-[13px] break-all text-zinc-700">{entry.userAgent ?? 'Not recorded'}</span> },
          { label: 'Entry ID', value: <Identifier value={entry.id} /> },
        ]}
      />
      {metaEntries.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-medium text-zinc-500">Details</h3>
          <pre className="overflow-x-auto rounded-md border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs leading-relaxed text-zinc-800">
            {JSON.stringify(metadata, null, 2)}
          </pre>
        </section>
      )}
      {(entry.actorId || entry.targetType === 'USER') && (
        <section className="flex flex-wrap gap-x-4 gap-y-2 border-t border-zinc-200 pt-4 text-[13px]">
          {entry.actorId && (
            <Link to="/audit" search={{ userId: entry.actorId }} onClick={onNavigate} className="font-medium text-brand-700 hover:underline">
              Everything involving {entry.actorLabel ?? 'this actor'}
            </Link>
          )}
          {entry.targetType === 'USER' && entry.targetId && entry.targetId !== entry.actorId && (
            <Link to="/audit" search={{ userId: entry.targetId }} onClick={onNavigate} className="font-medium text-brand-700 hover:underline">
              Everything involving {entry.targetLabel ?? 'this account'}
            </Link>
          )}
        </section>
      )}
    </div>
  )
}

function TargetLink({ entry, onNavigate }: { entry: AuditEntry; onNavigate: () => void }) {
  const auth = useAuth()
  const label = entry.targetLabel ?? 'Untitled'
  const className = 'font-medium text-brand-700 hover:underline'
  if (!entry.targetId) return <span>{label}</span>
  switch (entry.targetType) {
    case 'USER':
      if (!auth.can('VIEW_USERS')) break
      return (
        <Link to="/users/$userId" params={{ userId: entry.targetId }} onClick={onNavigate} className={className}>
          {label}
        </Link>
      )
    case 'STREAM':
      if (!auth.can('VIEW_LIVES')) break
      return (
        <Link to="/streams/$streamId" params={{ streamId: entry.targetId }} onClick={onNavigate} className={className}>
          {label}
        </Link>
      )
    case 'CONVERSATION': {
      if (!auth.can('VIEW_PRIVATE_MESSAGES')) break
      // The day that was read - opening the link is itself recorded.
      const from = typeof entry.metadata?.from === 'string' ? entry.metadata.from : null
      return (
        <Link
          to="/messages"
          search={{ conversation: entry.targetId, day: from ? localDay(from) : undefined }}
          onClick={onNavigate}
          className={className}
        >
          {label}
        </Link>
      )
    }
    case 'APP_RELEASE':
      // A withdrawn update is gone; the page still shows the ones published since.
      if (!auth.can('VIEW_APP_RELEASES')) break
      return (
        <Link to="/app-updates" onClick={onNavigate} className={className}>
          {label}
        </Link>
      )
    case 'DATA':
      if (!auth.isSuperAdmin) break
      return (
        <Link to="/data" onClick={onNavigate} className={className}>
          {label}
        </Link>
      )
    case 'CAMERA_EFFECT':
      if (!auth.can('VIEW_CAMERA_EFFECTS')) break
      return (
        <Link to="/camera-effects" onClick={onNavigate} className={className}>
          {label}
        </Link>
      )
    case 'HOSTING_REASON':
      if (!auth.can('VIEW_HOSTING_RESTRICTIONS')) break
      return (
        <Link to="/hosting" search={{ tab: 'reasons' }} onClick={onNavigate} className={className}>
          {label}
        </Link>
      )
    case 'REPORT':
      if (!auth.can('VIEW_REPORTS')) break
      return (
        <Link to="/reports" search={{ report: entry.targetId }} onClick={onNavigate} className={className}>
          {label}
        </Link>
      )
  }
  return <span className="font-medium">{label}</span>
}
