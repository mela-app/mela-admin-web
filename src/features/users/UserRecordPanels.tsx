import { Link } from '@tanstack/react-router'
import { Ban, Flag, ShieldOff, StickyNote, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { UserStatusBadge } from '../../components/StatusBadges'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Pagination } from '../../components/ui/DataTable'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/feedback'
import { Segmented, Textarea } from '../../components/ui/forms'
import { Avatar, RelativeTime } from '../../components/ui/misc'
import { useAuth } from '../../lib/auth-context'
import { formatDateTime, formatNumber } from '../../lib/format'
import { REPORT_REASON_LABELS } from '../../lib/labels'
import {
  actions,
  useAdminMutation,
  useHostingRestrictions,
  useUserBlocks,
  useUserNotes,
  useUserReports,
} from '../../lib/queries'
import type { UserDetail, UserNote } from '../../lib/types'
import { RestrictionBadges } from '../hosting/RestrictionView'
import { ReportStatusBadge } from '../reports/ReportCase'

function PanelSkeleton() {
  return (
    <div className="space-y-3 p-5">
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/3" />
    </div>
  )
}

/** Report cases about this account (its profile, lives and messages), or the ones it sent. */
export function UserReportsPanel({ user }: { user: UserDetail }) {
  const [direction, setDirection] = useState<'against' | 'by'>('against')
  const [page, setPage] = useState(1)
  const reports = useUserReports(user.id, direction, page, true)
  const against = user.safety.reportsAgainst
  const rows = reports.data?.items ?? []

  return (
    <div>
      <div className="border-b border-zinc-100 px-5 py-3">
        <Segmented<'against' | 'by'>
          label="Whose reports"
          value={direction}
          onChange={(next) => {
            setDirection(next)
            setPage(1)
          }}
          options={[
            { value: 'against', label: `About them (${formatNumber(against.open + against.actioned + against.dismissed)})` },
            { value: 'by', label: `Sent by them (${formatNumber(user.safety.reportsMade)})` },
          ]}
        />
      </div>
      {reports.isPending && <PanelSkeleton />}
      {reports.isError && !reports.data && <ErrorState error={reports.error} onRetry={() => void reports.refetch()} />}
      {reports.data && rows.length === 0 && (
        <EmptyState
          icon={<Flag />}
          title={direction === 'against' ? 'Nobody reported them' : "They haven't reported anything"}
          description={
            direction === 'against'
              ? 'Reports about their profile, lives and messages show here.'
              : 'What they report in the app shows here.'
          }
        />
      )}
      {rows.length > 0 && (
        <ul className="divide-y divide-zinc-100">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                to="/reports"
                search={{ report: row.id, status: row.status === 'OPEN' ? undefined : row.status }}
                className="flex flex-wrap items-start gap-x-4 gap-y-1 px-5 py-3 hover:bg-zinc-50"
              >
                <span className="min-w-0 flex-1 basis-64">
                  <span className="flex flex-wrap items-center gap-1.5">
                    {row.urgent && <Badge tone="danger">Urgent</Badge>}
                    <ReportStatusBadge status={row.status} />
                    <span className="truncate text-[13px] font-medium text-zinc-900">{row.label}</span>
                  </span>
                  <span className="mt-1 block truncate text-xs text-zinc-500">
                    {row.reasons.map(({ reason }) => REPORT_REASON_LABELS[reason]).join(' · ')}
                  </span>
                </span>
                <span className="text-right text-xs text-zinc-500 tabular-nums">
                  <RelativeTime value={row.lastReportedAt} className="block" />
                  {formatNumber(row.reportCount)} {row.reportCount === 1 ? 'report' : 'reports'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {reports.data && reports.data.total > reports.data.pageSize && (
        <Pagination page={page} pageSize={reports.data.pageSize} total={reports.data.total} onPageChange={setPage} />
      )}
    </div>
  )
}

/** Every hosting restriction they had, latest first. */
export function UserRestrictionsPanel({ userId }: { userId: string }) {
  const [page, setPage] = useState(1)
  const restrictions = useHostingRestrictions({ userId, state: 'all' }, { page, pageSize: 10 })
  const rows = restrictions.data?.items ?? []
  if (restrictions.isPending) return <PanelSkeleton />
  if (restrictions.isError && !restrictions.data) {
    return <ErrorState error={restrictions.error} onRetry={() => void restrictions.refetch()} />
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<ShieldOff />}
        title="Never restricted"
        description="Pausing their hosting from a live or here shows up in this list, with any appeal."
      />
    )
  }
  return (
    <div>
      <ul className="divide-y divide-zinc-100">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              to="/hosting"
              search={{ tab: 'all', restriction: row.id }}
              className="flex flex-wrap items-start gap-x-4 gap-y-1 px-5 py-3 hover:bg-zinc-50"
            >
              <span className="min-w-0 flex-1 basis-64">
                <span className="block truncate text-[13px] font-medium text-zinc-900">{row.title}</span>
                <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <RestrictionBadges status={row.status} appealState={row.appealState} />
                </span>
              </span>
              <span className="text-right text-xs text-zinc-500">
                <span className="block">{formatDateTime(row.createdAt)}</span>
                {row.liftedAt
                  ? `Lifted ${formatDateTime(row.liftedAt)}`
                  : row.endsAt
                    ? `Until ${formatDateTime(row.endsAt)}`
                    : 'Until lifted'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {restrictions.data && restrictions.data.total > restrictions.data.pageSize && (
        <Pagination
          page={page}
          pageSize={restrictions.data.pageSize}
          total={restrictions.data.total}
          onPageChange={setPage}
        />
      )}
    </div>
  )
}

/** Who they blocked, and who blocked them. */
export function UserBlocksPanel({ user }: { user: UserDetail }) {
  const auth = useAuth()
  const [direction, setDirection] = useState<'blocked' | 'blockedBy'>('blocked')
  const [page, setPage] = useState(1)
  const blocks = useUserBlocks(user.id, direction, page, true)
  const rows = blocks.data?.items ?? []

  return (
    <div>
      <div className="border-b border-zinc-100 px-5 py-3">
        <Segmented<'blocked' | 'blockedBy'>
          label="Which blocks"
          value={direction}
          onChange={(next) => {
            setDirection(next)
            setPage(1)
          }}
          options={[
            { value: 'blocked', label: `They blocked (${formatNumber(user.safety.blocked)})` },
            { value: 'blockedBy', label: `Blocked them (${formatNumber(user.safety.blockedBy)})` },
          ]}
        />
      </div>
      {blocks.isPending && <PanelSkeleton />}
      {blocks.isError && !blocks.data && <ErrorState error={blocks.error} onRetry={() => void blocks.refetch()} />}
      {blocks.data && rows.length === 0 && (
        <EmptyState
          icon={<Ban />}
          title={direction === 'blocked' ? "They haven't blocked anyone" : 'Nobody blocked them'}
          description={
            direction === 'blockedBy'
              ? 'Many people blocking one account is often worth a closer look.'
              : 'People they block in the app show here.'
          }
        />
      )}
      {rows.length > 0 && (
        <ul className="divide-y divide-zinc-100">
          {rows.map((row) => {
            const person = (
              <>
                <Avatar name={row.person.displayName} url={row.person.avatarUrl} size="sm" />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-[13px] font-medium text-zinc-900">{row.person.displayName}</span>
                  <span className="block truncate text-xs text-zinc-500">@{row.person.username}</span>
                </span>
              </>
            )
            return (
              <li key={row.id} className="flex items-center gap-3 px-5 py-2.5">
                {auth.can('VIEW_USERS') ? (
                  <Link
                    to="/users/$userId"
                    params={{ userId: row.person.id }}
                    className="flex min-w-0 flex-1 items-center gap-3 hover:underline"
                  >
                    {person}
                  </Link>
                ) : (
                  <span className="flex min-w-0 flex-1 items-center gap-3">{person}</span>
                )}
                {row.person.status === 'SUSPENDED' && <UserStatusBadge status={row.person.status} />}
                <RelativeTime value={row.createdAt} className="shrink-0 text-xs text-zinc-500" />
              </li>
            )
          })}
        </ul>
      )}
      {blocks.data && blocks.data.total > blocks.data.pageSize && (
        <Pagination page={page} pageSize={blocks.data.pageSize} total={blocks.data.total} onPageChange={setPage} />
      )}
    </div>
  )
}

const NOTE_LIMIT = 2000

/** Staff's private notes about this account: what was said or agreed, outside the console. */
export function UserNotesPanel({ userId }: { userId: string }) {
  const auth = useAuth()
  const notes = useUserNotes(userId, true)
  const [text, setText] = useState('')
  const [removing, setRemoving] = useState<UserNote | null>(null)
  const add = useAdminMutation((note: string) => actions.addUserNote(userId, note), { success: 'Note added.' })
  const remove = useAdminMutation((noteId: string) => actions.deleteUserNote(userId, noteId), {
    success: 'Note removed.',
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    const note = text.trim()
    if (!note) return
    add.mutate(note, { onSuccess: () => setText('') })
  }

  return (
    <div>
      <form onSubmit={submit} className="space-y-2 border-b border-zinc-100 px-5 py-4">
        <Textarea
          aria-label="New note"
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={NOTE_LIMIT}
          placeholder="e.g. Spoke to them on Telegram - they agreed to stop the spam."
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-zinc-500">Only staff see notes. Adding or removing one is in the audit log.</p>
          <Button type="submit" size="sm" variant="primary" loading={add.isPending} disabled={!text.trim()}>
            Add note
          </Button>
        </div>
      </form>
      {notes.isPending && <PanelSkeleton />}
      {notes.isError && !notes.data && <ErrorState error={notes.error} onRetry={() => void notes.refetch()} />}
      {notes.data && notes.data.items.length === 0 && (
        <EmptyState
          icon={<StickyNote />}
          title="No notes yet"
          description="Keep what the team should know about this account here."
        />
      )}
      {notes.data && notes.data.items.length > 0 && (
        <ul className="divide-y divide-zinc-100">
          {notes.data.items.map((note) => {
            const mine = note.author?.id === auth.admin?.id
            return (
              <li key={note.id} className="px-5 py-3">
                <p className="text-sm whitespace-pre-wrap break-words text-zinc-900">{note.text}</p>
                <div className="mt-1.5 flex items-center justify-between gap-3">
                  <p className="text-xs text-zinc-500">
                    {note.author ? `@${note.author.username}` : 'A removed staff account'} ·{' '}
                    <span title={formatDateTime(note.createdAt)}>
                      <RelativeTime value={note.createdAt} />
                    </span>
                  </p>
                  {(mine || auth.isSuperAdmin) && (
                    <Button
                      size="sm"
                      variant="danger-ghost"
                      icon={<Trash2 />}
                      aria-label="Remove note"
                      onClick={() => setRemoving(note)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Remove this note?"
        description="It's gone for everyone on the team. The audit log keeps that it was removed."
        confirmLabel="Remove note"
        tone="danger"
        onConfirm={() => (removing ? remove.mutateAsync(removing.id) : Promise.resolve())}
      />
    </div>
  )
}
