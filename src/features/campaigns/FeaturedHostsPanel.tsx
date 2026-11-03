import { Link } from '@tanstack/react-router'
import { ArrowDown, ArrowUp, Plus, Star, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog'
import { Callout, EmptyState, ErrorState, Skeleton } from '../../components/ui/feedback'
import { Field, Input } from '../../components/ui/forms'
import { SearchInput } from '../../components/ui/SearchInput'
import { Avatar } from '../../components/ui/misc'
import { useAuth } from '../../lib/auth-context'
import { cn } from '../../lib/cn'
import { formatDateTime, formatNumber } from '../../lib/format'
import { actions, useAdminMutation, useFeaturedHosts, useUsers } from '../../lib/queries'
import type { FeaturedHost, UserRow } from '../../lib/types'
import { fromLocalInput } from './campaign-format'

/**
 * Hosts shown first on For You while they're live, top of the list first -
 * to help new hosts find viewers, or for an event. Search and Following
 * keep their own order.
 */
export function FeaturedHostsPanel() {
  const auth = useAuth()
  const canManage = auth.can('MANAGE_CAMPAIGNS')
  const featured = useFeaturedHosts()
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<FeaturedHost | null>(null)
  const reorder = useAdminMutation((userIds: string[]) => actions.reorderFeaturedHosts(userIds), {
    success: 'Order saved.',
  })
  const remove = useAdminMutation((userId: string) => actions.unfeatureHost(userId), { success: 'No longer featured.' })
  const rows = featured.data?.items ?? []

  function move(index: number, by: -1 | 1) {
    const ids = rows.map((row) => row.userId)
    const [moved] = ids.splice(index, 1)
    ids.splice(index + by, 0, moved)
    reorder.mutate(ids)
  }

  return (
    <Card
      title="Featured hosts"
      description="First on For You whenever they're live, in this order - unless they pause. Search and Following are unchanged."
      actions={
        canManage && (
          <Button variant="primary" icon={<Plus />} onClick={() => setAdding(true)}>
            Feature a host
          </Button>
        )
      }
      flush
    >
      {featured.isPending && (
        <div className="space-y-3 p-5">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}
      {featured.isError && !featured.data && (
        <ErrorState error={featured.error} onRetry={() => void featured.refetch()} />
      )}
      {featured.data && rows.length === 0 && (
        <EmptyState icon={<Star />} title="Nobody featured" description="Featured hosts go to the top of For You while they're live." />
      )}
      {rows.length > 0 && (
        <ol className="divide-y divide-zinc-100">
          {rows.map((row, index) => (
            <li key={row.id} className={cn('flex flex-wrap items-center gap-3 px-5 py-3', !row.active && 'opacity-60')}>
              <span className="w-5 text-right text-xs text-zinc-400 tabular-nums">{index + 1}</span>
              <Avatar name={row.user.displayName} url={row.user.avatarUrl} size="sm" />
              <span className="min-w-0 flex-1 basis-48 leading-tight">
                <Link to="/users/$userId" params={{ userId: row.userId }} className="block truncate text-sm font-medium text-zinc-900 hover:underline">
                  {row.user.displayName}
                </Link>
                <span className="block truncate text-xs text-zinc-500">
                  @{row.user.username}
                  {row.note ? ` · ${row.note}` : ''}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-1.5">
                {row.liveStreamId && (
                  <Link to="/streams/$streamId" params={{ streamId: row.liveStreamId }}>
                    <Badge tone="danger" dot>
                      Live now
                    </Badge>
                  </Link>
                )}
                {!row.active && <Badge>Ended</Badge>}
                {row.user.status === 'SUSPENDED' && <Badge tone="danger">Suspended</Badge>}
                <span className="text-xs text-zinc-500">
                  {row.endsAt ? `${row.active ? 'Until' : 'Ended'} ${formatDateTime(row.endsAt)}` : 'Until removed'}
                </span>
              </span>
              {canManage && (
                <span className="flex gap-1">
                  <Button size="sm" variant="ghost" icon={<ArrowUp />} aria-label="Move up" disabled={index === 0 || reorder.isPending} onClick={() => move(index, -1)} />
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<ArrowDown />}
                    aria-label="Move down"
                    disabled={index === rows.length - 1 || reorder.isPending}
                    onClick={() => move(index, 1)}
                  />
                  <Button size="sm" variant="danger-ghost" icon={<Trash2 />} aria-label="Stop featuring" onClick={() => setRemoving(row)} />
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      <Dialog open={adding} onClose={() => setAdding(false)} title="Feature a host" description="They go to the top of For You whenever they're live.">
        {adding && <FeatureForm already={new Set(rows.map((row) => row.userId))} onClose={() => setAdding(false)} />}
      </Dialog>
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={removing ? `Stop featuring @${removing.user.username}?` : 'Stop featuring?'}
        description="Their lives are ranked like everyone else's again."
        confirmLabel="Stop featuring"
        tone="danger"
        onConfirm={() => (removing ? remove.mutateAsync(removing.userId) : Promise.resolve())}
      />
    </Card>
  )
}

function FeatureForm({ already, onClose }: { already: Set<string>; onClose(): void }) {
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<UserRow | null>(null)
  const [note, setNote] = useState('')
  const [until, setUntil] = useState('')
  const [error, setError] = useState<string | null>(null)
  const users = useUsers({ q: q.trim() || undefined, role: 'USER', status: 'ACTIVE', pageSize: 6 })
  const endsAt = fromLocalInput(until)
  const untilProblem = until && (!endsAt || new Date(endsAt) <= new Date()) ? 'Pick a time from now on.' : null
  const feature = useAdminMutation(
    () => actions.featureHost({ userId: picked!.id, note: note.trim() || null, endsAt }),
    { toastErrors: false, success: 'Host featured.' },
  )

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!picked || untilProblem) return
    setError(null)
    try {
      await feature.mutateAsync(undefined)
      onClose()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Something went wrong. Try again.')
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {picked ? (
        <div className="flex items-center gap-3 rounded-lg border border-zinc-200 p-3">
          <Avatar name={picked.displayName} url={picked.avatarUrl} size="sm" />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-medium text-zinc-900">{picked.displayName}</span>
            <span className="block truncate text-xs text-zinc-500">
              @{picked.username} · {formatNumber(picked.followerCount)} followers · {formatNumber(picked.streamCount)} lives
            </span>
          </span>
          <Button size="sm" onClick={() => setPicked(null)}>
            Change
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <SearchInput label="Find a host" value={q} onChange={(value) => setQ(value ?? '')} placeholder="Name or username" />
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            {(users.data?.items ?? []).map((user) => (
              <li key={user.id}>
                <button
                  type="button"
                  disabled={already.has(user.id)}
                  onClick={() => setPicked(user)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-zinc-50 disabled:opacity-50"
                >
                  <Avatar name={user.displayName} url={user.avatarUrl} size="sm" />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-sm text-zinc-900">{user.displayName}</span>
                    <span className="block truncate text-xs text-zinc-500">@{user.username}</span>
                  </span>
                  <span className="text-xs text-zinc-500">
                    {already.has(user.id) ? 'Featured' : `${formatNumber(user.streamCount)} lives`}
                  </span>
                </button>
              </li>
            ))}
            {users.data && users.data.items.length === 0 && (
              <li className="px-3 py-3 text-[13px] text-zinc-500">Nobody matches.</li>
            )}
          </ul>
        </div>
      )}
      <Field label="Why" hint="For the team only, e.g. New host - launch week.">
        <Input value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} />
      </Field>
      <Field label="Until" hint="Empty: until removed. Your time zone." error={untilProblem}>
        <Input type="datetime-local" value={until} onChange={(event) => setUntil(event.target.value)} />
      </Field>
      {error && <Callout tone="danger">{error}</Callout>}
      <div className="-mx-5 -mb-4 flex justify-end gap-2 border-t border-zinc-200 bg-zinc-50/60 px-5 py-3">
        <Button onClick={onClose} disabled={feature.isPending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={feature.isPending} disabled={!picked || untilProblem !== null}>
          Feature
        </Button>
      </div>
    </form>
  )
}
