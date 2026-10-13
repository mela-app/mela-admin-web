import { Archive, ArchiveRestore, Pencil, Plus, ScrollText } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Callout, EmptyState, ErrorState, Skeleton } from '../../components/ui/feedback'
import { Checkbox, Field, Input, Textarea } from '../../components/ui/forms'
import { RelativeTime } from '../../components/ui/misc'
import { useAuth } from '../../lib/auth-context'
import { formatNumber } from '../../lib/format'
import { actions, useAdminMutation, useHostingReasons } from '../../lib/queries'
import type { HostingReason } from '../../lib/types'

/**
 * The reasons staff pick from when pausing someone's hosting - written by
 * the team, as new kinds of behaviour come up. Archived ones aren't offered;
 * restrictions that used one keep their own words.
 */
export function HostingReasonsPanel() {
  const auth = useAuth()
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<HostingReason | 'new' | null>(null)
  const reasons = useHostingReasons(showArchived)
  const archive = useAdminMutation(
    (reason: HostingReason) => actions.updateHostingReason(reason.id, { archived: !reason.archived }),
    { success: (reason) => (reason.archived ? 'Archived. It is no longer offered.' : 'Restored. It is offered again.') },
  )
  const canManage = auth.can('MANAGE_HOSTING_RESTRICTIONS')
  const rows = reasons.data ?? []

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-zinc-200 p-4">
        <Checkbox label="Show archived" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
        {canManage && (
          <Button className="ml-auto" variant="primary" icon={<Plus />} onClick={() => setEditing('new')}>
            New reason
          </Button>
        )}
      </div>
      {reasons.isPending && (
        <div className="space-y-3 p-5">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      )}
      {reasons.isError && <ErrorState error={reasons.error} onRetry={() => void reasons.refetch()} />}
      {reasons.data && rows.length === 0 && (
        <EmptyState
          icon={<ScrollText />}
          title="No reasons yet"
          description="Write one here, or tick “Save as a reason” when pausing someone's hosting."
        />
      )}
      <ul className="divide-y divide-zinc-100">
        {rows.map((reason) => (
          <li key={reason.id} className="flex flex-wrap items-start gap-3 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-zinc-900">
                {reason.title}
                {reason.archived && <Badge>Archived</Badge>}
              </p>
              <p className="mt-1 text-[13px] break-words whitespace-pre-wrap text-zinc-600">{reason.message}</p>
              <p className="mt-1.5 text-xs text-zinc-400">
                Used {formatNumber(reason.used)} {reason.used === 1 ? 'time' : 'times'} · added{' '}
                <RelativeTime value={reason.createdAt} />
                {reason.createdBy && <> by @{reason.createdBy.username}</>}
              </p>
            </div>
            {canManage && (
              <div className="flex gap-2">
                <Button size="sm" icon={<Pencil />} onClick={() => setEditing(reason)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  icon={reason.archived ? <ArchiveRestore /> : <Archive />}
                  loading={archive.isPending && archive.variables?.id === reason.id}
                  onClick={() => archive.mutate(reason)}
                >
                  {reason.archived ? 'Restore' : 'Archive'}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'New reason' : 'Edit reason'}
        description="The host reads the title and the message. Restrictions already made keep the words they were given."
      >
        {editing !== null && <ReasonForm reason={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      </Dialog>
    </div>
  )
}

function ReasonForm({ reason, onClose }: { reason: HostingReason | null; onClose: () => void }) {
  const [title, setTitle] = useState(reason?.title ?? '')
  const [message, setMessage] = useState(reason?.message ?? '')
  const [error, setError] = useState<string | null>(null)
  const save = useAdminMutation(
    (body: { title: string; message: string }) =>
      reason ? actions.updateHostingReason(reason.id, body) : actions.addHostingReason(body),
    { toastErrors: false, success: reason ? 'Reason saved.' : 'Reason added. Staff can pick it now.' },
  )

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (title.trim().length < 3) return setError('Give it a title of at least 3 characters.')
    if (message.trim().length < 10) return setError('Explain it in at least 10 characters.')
    setError(null)
    try {
      await save.mutateAsync({ title: title.trim(), message: message.trim() })
      onClose()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Something went wrong. Try again.')
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Title the host sees" required>
        <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} data-autofocus />
      </Field>
      <Field label="What the host is told" required>
        <Textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1000} rows={5} />
      </Field>
      {error && <Callout tone="danger">{error}</Callout>}
      <div className="-mx-5 -mb-4 flex justify-end gap-2 border-t border-zinc-200 bg-zinc-50/60 px-5 py-3">
        <Button onClick={onClose} disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={save.isPending}>
          Save
        </Button>
      </div>
    </form>
  )
}
