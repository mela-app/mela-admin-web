import { Link } from '@tanstack/react-router'
import { RotateCcw, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Dialog } from '../../components/ui/Dialog'
import { Callout, ErrorState, Skeleton } from '../../components/ui/feedback'
import { Checkbox, Field, Input, Segmented } from '../../components/ui/forms'
import { PageHeader } from '../../components/ui/misc'
import { formatNumber } from '../../lib/format'
import { actions, useAdminMutation, useDataOverview } from '../../lib/queries'
import type { DataGroup, DataSet, KeepOnReset } from '../../lib/types'

const GROUPS: Array<{ key: DataGroup; title: string; description: string }> = [
  { key: 'people', title: 'People', description: 'Accounts, how they sign in, and how they relate to each other.' },
  { key: 'lives', title: 'Lives', description: 'Lives and everything that happened in them.' },
  { key: 'messages', title: 'Messages and notifications', description: 'What people sent each other, and what the app told them.' },
  { key: 'console', title: 'Console', description: "Staff's own records and settings." },
]

const KEEP_OPTIONS: Array<{ value: KeepOnReset; label: string; description: string }> = [
  { value: 'appUpdates', label: 'Keep app updates', description: 'Phones still hear about the latest version.' },
  { value: 'bannedPhrases', label: 'Keep banned phrases', description: 'Chat stays filtered.' },
  { value: 'auditLog', label: 'Keep the audit log', description: 'Everything recorded so far stays.' },
]

const MAX_DAYS = 3650

const rows = (count: number) => `${formatNumber(count)} ${count === 1 ? 'row' : 'rows'}`

/**
 * What is stored, and removing what is no longer wanted - one kind at a time,
 * only what is older than some days, or everything but the signed-in super
 * admin's own account (docs/features/admin.md).
 */
export function DataPage() {
  const overview = useDataOverview()
  const [clearing, setClearing] = useState<DataSet | null>(null)
  const [resetting, setResetting] = useState(false)
  const data = overview.data

  return (
    <>
      <PageHeader
        title="Data"
        description="What is stored, and removing what you no longer need. Removing can't be undone: each removal asks for your password, and is recorded in the audit log."
      />

      {overview.isPending && <DataSkeleton />}
      {overview.isError && !data && <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />}
      {data && (
        <div className="space-y-6">
          {data.runningLives > 0 && (
            <Callout title={`${formatNumber(data.runningLives)} ${data.runningLives === 1 ? 'live is' : 'lives are'} running right now`}>
              Whatever you remove, they keep their chat, stage guests, moderators, mutes and bans until they end.
            </Callout>
          )}
          {GROUPS.map((group) => (
            <Card key={group.key} title={group.title} description={group.description} flush>
              <ul className="divide-y divide-zinc-100">
                {data.sets
                  .filter((set) => set.group === group.key)
                  .map((set) => (
                    <DataSetRow key={set.key} set={set} onRemove={() => setClearing(set)} />
                  ))}
              </ul>
            </Card>
          ))}
          <Card title="Start over" description="Everything except your own account." className="border-red-200">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="max-w-2xl text-[13px] text-zinc-600">
                Every other account goes - staff included - with every live, chat message, private message, follow and
                notification, and the photos and pictures they uploaded. You stay signed in here. Use it to clear out
                test data before opening to everyone.
              </p>
              <Button variant="danger" icon={<RotateCcw />} onClick={() => setResetting(true)}>
                Reset everything…
              </Button>
            </div>
          </Card>
        </div>
      )}

      <ClearDialog set={clearing} onClose={() => setClearing(null)} />
      <ResetDialog open={resetting} runningLives={data?.runningLives ?? 0} onClose={() => setResetting(false)} />
    </>
  )
}

function DataSetRow({ set, onRemove }: { set: DataSet; onRemove(): void }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
      <div className="min-w-0 flex-1 basis-80">
        <p className="text-sm font-medium text-zinc-900">{set.label}</p>
        <p className="mt-0.5 text-[13px] text-zinc-500">{set.description}</p>
        <p className="mt-1 font-mono text-[11px] text-zinc-400">{set.tables.join(', ')}</p>
      </div>
      <p className="shrink-0 text-sm text-zinc-700 tabular-nums">{rows(set.count)}</p>
      <Button
        size="sm"
        variant="danger-ghost"
        icon={<Trash2 />}
        onClick={onRemove}
        disabled={set.count === 0}
        aria-label={`Remove ${set.label.toLowerCase()}`}
      >
        Remove…
      </Button>
    </li>
  )
}

function ClearDialog({ set, onClose }: { set: DataSet | null; onClose(): void }) {
  return (
    <Dialog
      open={set !== null}
      onClose={onClose}
      title={set ? `Remove ${set.label.toLowerCase()}?` : 'Remove data?'}
      description={set?.description}
    >
      {set && <ClearForm set={set} onClose={onClose} />}
    </Dialog>
  )
}

function ClearForm({ set, onClose }: { set: DataSet; onClose(): void }) {
  const [scope, setScope] = useState<'all' | 'older'>('all')
  const [days, setDays] = useState('30')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const olderThanDays = scope === 'older' ? Number(days) : undefined
  const daysProblem =
    olderThanDays !== undefined && !(Number.isInteger(olderThanDays) && olderThanDays >= 1 && olderThanDays <= MAX_DAYS)
      ? `Pick a whole number of days, from 1 to ${formatNumber(MAX_DAYS)}.`
      : null
  const unused = set.ageFilter === 'lastUsed'
  const clear = useAdminMutation(() => actions.clearData({ dataSet: set.key, olderThanDays, password }), {
    toastErrors: false,
    success: ({ removed }) => `Removed ${rows(removed)} of ${set.label.toLowerCase()}.`,
  })

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (daysProblem || !password) return
    setError(null)
    try {
      await clear.mutateAsync(undefined)
      onClose()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Something went wrong. Try again.')
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-[13px] text-zinc-600">
        {formatNumber(set.count)} stored now. This can't be undone.
      </p>
      {set.ageFilter && (
        <div className="space-y-3">
          <Segmented
            label="What to remove"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'all', label: 'All of it' },
              { value: 'older', label: unused ? 'Only unused devices' : 'Only older' },
            ]}
          />
          {scope === 'older' && (
            <Field label={unused ? 'Not used for (days)' : 'Older than (days)'} error={daysProblem}>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_DAYS}
                value={days}
                onChange={(event) => setDays(event.target.value)}
                className="w-32"
              />
            </Field>
          )}
        </div>
      )}
      <Field label="Your password" hint="To confirm it's you." required>
        <Input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          data-autofocus
        />
      </Field>
      {error && <Callout tone="danger">{error}</Callout>}
      <div className="-mx-5 -mb-4 flex justify-end gap-2 border-t border-zinc-200 bg-zinc-50/60 px-5 py-3">
        <Button onClick={onClose} disabled={clear.isPending}>
          Cancel
        </Button>
        <Button type="submit" variant="danger" loading={clear.isPending} disabled={!password || daysProblem !== null}>
          {scope === 'older' ? (unused ? 'Remove unused' : 'Remove older') : 'Remove all'}
        </Button>
      </div>
    </form>
  )
}

function ResetDialog({ open, runningLives, onClose }: { open: boolean; runningLives: number; onClose(): void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Reset everything?"
      description="Every other account goes - staff included - with everything stored about them and by them. Your own account stays, and you stay signed in here."
    >
      {open && <ResetForm runningLives={runningLives} onClose={onClose} />}
    </Dialog>
  )
}

function ResetForm({ runningLives, onClose }: { runningLives: number; onClose(): void }) {
  const [keep, setKeep] = useState<KeepOnReset[]>([])
  const [typed, setTyped] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const confirmed = typed.trim() === 'RESET'
  const reset = useAdminMutation(() => actions.resetData({ password, keep }), {
    toastErrors: false,
    success: ({ usersRemoved }) =>
      `Everything is reset - ${formatNumber(usersRemoved)} ${usersRemoved === 1 ? 'account' : 'accounts'} removed.`,
  })

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!confirmed || !password || runningLives > 0) return
    setError(null)
    try {
      await reset.mutateAsync(undefined)
      onClose()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Something went wrong. Try again.')
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {runningLives > 0 && (
        <Callout tone="warning" title={`${formatNumber(runningLives)} ${runningLives === 1 ? 'live is' : 'lives are'} running`}>
          Every live has to have ended first.{' '}
          <Link to="/streams" search={{ status: 'LIVE' }} className="font-medium underline">
            Lock them on the Lives page
          </Link>
          , then come back.
        </Callout>
      )}
      <fieldset className="space-y-2.5">
        <legend className="mb-2 text-[13px] font-medium text-zinc-800">Leave in place</legend>
        {KEEP_OPTIONS.map((option) => (
          <Checkbox
            key={option.value}
            label={option.label}
            description={option.description}
            checked={keep.includes(option.value)}
            onChange={(event) =>
              setKeep((current) =>
                event.target.checked ? [...current, option.value] : current.filter((each) => each !== option.value),
              )
            }
          />
        ))}
      </fieldset>
      <Field label="Type RESET to confirm" required>
        <Input value={typed} autoComplete="off" spellCheck={false} onChange={(event) => setTyped(event.target.value)} />
      </Field>
      <Field label="Your password" hint="To confirm it's you." required>
        <Input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>
      {error && <Callout tone="danger">{error}</Callout>}
      <div className="-mx-5 -mb-4 flex justify-end gap-2 border-t border-zinc-200 bg-zinc-50/60 px-5 py-3">
        <Button onClick={onClose} disabled={reset.isPending}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="danger"
          loading={reset.isPending}
          disabled={!confirmed || !password || runningLives > 0}
        >
          Reset everything
        </Button>
      </div>
    </form>
  )
}

function DataSkeleton() {
  return (
    <div className="space-y-6">
      {[0, 1].map((card) => (
        <div key={card} className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5">
          <Skeleton className="h-4 w-40" />
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex items-center gap-4">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-48" />
                <Skeleton className="h-3 w-80" />
              </div>
              <Skeleton className="h-3.5 w-16" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
