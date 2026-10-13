import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Callout } from '../../components/ui/feedback'
import { Checkbox, Field, Input, Select, Textarea } from '../../components/ui/forms'
import { formatDateTime } from '../../lib/format'
import { liveName } from '../../lib/live-name'
import { actions, useAdminMutation, useHostingReasons } from '../../lib/queries'
import type { Person } from '../../lib/types'
import { DURATIONS } from './durations'

/** A live the restriction can be about. */
export interface LiveChoice {
  id: string
  title: string
  startedAt: string
}

interface RestrictHostDialogProps {
  open: boolean
  onClose: () => void
  host: Person
  /**
   * The lives it can be about, oldest first - the newest is picked to start
   * with. Its page then shows the restriction and the appeal.
   */
  lives: LiveChoice[]
}

/**
 * Pausing someone's hosting (docs/features/hosting-restrictions.md): which
 * live it's about, a saved reason - its words still editable for this host -
 * or new words, kept as a reason for next time if wanted, how long, and what
 * the host will read.
 */
export function RestrictHostDialog({ open, onClose, host, lives }: RestrictHostDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={`Pause @${host.username}'s hosting`}
      description="They can't go live, join a stage or schedule a live until it's lifted or runs out. Watching, chat and messages stay as they are. A live they're running ends now."
    >
      <RestrictForm host={host} lives={lives} onClose={onClose} />
    </Dialog>
  )
}

function RestrictForm({ host, lives, onClose }: { host: Person; lives: LiveChoice[]; onClose: () => void }) {
  const reasons = useHostingReasons()
  const [streamId, setStreamId] = useState(lives.at(-1)?.id ?? '')
  const [reasonId, setReasonId] = useState('')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [note, setNote] = useState('')
  const [duration, setDuration] = useState('7d')
  const [saveAsReason, setSaveAsReason] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const restrict = useAdminMutation((body: Parameters<typeof actions.restrictHost>[0]) => actions.restrictHost(body), {
    toastErrors: false,
    success: `@${host.username}'s hosting is paused. They were told why.`,
  })

  function pickReason(next: string) {
    setReasonId(next)
    const reason = reasons.data?.find((each) => each.id === next)
    if (reason) {
      setTitle(reason.title)
      setMessage(reason.message)
      setSaveAsReason(false)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (title.trim().length < 3) return setError('Give it a title of at least 3 characters.')
    if (message.trim().length < 10) return setError('Explain it to the host in at least 10 characters.')
    setError(null)
    try {
      await restrict.mutateAsync({
        userId: host.id,
        streamId: streamId || undefined,
        reasonId: reasonId || undefined,
        title: title.trim(),
        message: message.trim(),
        note: note.trim() || undefined,
        durationHours: DURATIONS.find((each) => each.value === duration)?.hours ?? null,
        saveAsReason: !reasonId && saveAsReason,
      })
      onClose()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Something went wrong. Try again.')
    }
  }

  const saved = reasons.data ?? []
  const until = DURATIONS.find((each) => each.value === duration)
  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="About which live" hint="Its page shows the restriction and the appeal.">
          <Select value={streamId} onChange={(event) => setStreamId(event.target.value)}>
            {[...lives].reverse().map((live) => (
              <option key={live.id} value={live.id}>
                {liveName({ ...live, host })} · {formatDateTime(live.startedAt)}
              </option>
            ))}
            <option value="">Not about one live</option>
          </Select>
        </Field>
        <Field label="How long">
          <Select value={duration} onChange={(event) => setDuration(event.target.value)}>
            {DURATIONS.map((each) => (
              <option key={each.value} value={each.value}>
                {each.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <fieldset className="space-y-4 rounded-lg border border-zinc-200 p-4">
        <legend className="px-1 text-[13px] font-medium text-zinc-800">Reason</legend>
        <Field label="Start from" hint={saved.length === 0 ? 'No saved reasons yet - write one below.' : undefined}>
          <Select value={reasonId} onChange={(event) => pickReason(event.target.value)} data-autofocus>
            <option value="">A new reason</option>
            {saved.map((reason) => (
              <option key={reason.id} value={reason.id}>
                {reason.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Title the host sees" required>
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={120}
            placeholder="e.g. Insulting viewers in your live"
          />
        </Field>
        <Field label="What the host is told" hint="Say what happened and what's expected of them." required>
          <Textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={1000}
            rows={4}
            placeholder="e.g. In your live on Monday you repeatedly insulted viewers in chat and on camera. That goes against the community rules."
          />
        </Field>
        {!reasonId && (
          <Checkbox
            label="Save as a reason for next time"
            description="Staff can pick it when pausing someone else."
            checked={saveAsReason}
            onChange={(event) => setSaveAsReason(event.target.checked)}
          />
        )}
      </fieldset>

      <Field label="Note for the team" hint="Optional. The host never sees it.">
        <Input value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} placeholder="e.g. Second warning this month" />
      </Field>

      <section aria-label="What the host will see" className="rounded-lg bg-zinc-900 p-4 text-zinc-100">
        <p className="text-[11px] font-medium tracking-wide text-zinc-400 uppercase">What @{host.username} will see</p>
        <p className="mt-2 text-sm font-semibold">Your hosting is paused</p>
        <p className="mt-1 text-[13px] font-medium break-words">{title.trim() || 'Title'}</p>
        <p className="mt-1 text-[13px] break-words whitespace-pre-wrap text-zinc-300">
          {message.trim() || 'What they are told.'}
        </p>
        <p className="mt-2 text-xs text-zinc-400">
          {until?.hours ? `For ${until.label.toLowerCase()}` : 'Until the Mela team lifts it'} · they can appeal in the app
        </p>
      </section>

      {error && <Callout tone="danger">{error}</Callout>}
      <div className="-mx-5 -mb-4 flex justify-end gap-2 border-t border-zinc-200 bg-zinc-50/60 px-5 py-3">
        <Button onClick={onClose} disabled={restrict.isPending}>
          Cancel
        </Button>
        <Button type="submit" variant="danger" loading={restrict.isPending}>
          Pause hosting
        </Button>
      </div>
    </form>
  )
}
