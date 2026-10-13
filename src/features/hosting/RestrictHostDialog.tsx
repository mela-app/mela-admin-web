import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Callout } from '../../components/ui/feedback'
import { Checkbox, Field, Input, Select, Textarea } from '../../components/ui/forms'
import { actions, useAdminMutation, useHostingReasons } from '../../lib/queries'
import type { Person } from '../../lib/types'
import { DURATIONS } from './durations'

interface RestrictHostDialogProps {
  open: boolean
  onClose: () => void
  host: Person
  // The live it's about; its page shows the restriction and the appeal.
  stream?: { id: string; title: string } | null
}

/**
 * Pausing someone's hosting (docs/features/hosting-restrictions.md): a saved
 * reason - its words still editable for this host - or new words, kept as a
 * reason for next time if wanted. The host reads the title and message.
 */
export function RestrictHostDialog({ open, onClose, host, stream }: RestrictHostDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={`Pause @${host.username}'s hosting?`}
      description="They can't go live, join a stage or schedule a live until it's lifted or runs out. Watching, chat and private messages stay as they are. A live they're running ends now."
    >
      <RestrictForm host={host} stream={stream ?? null} onClose={onClose} />
    </Dialog>
  )
}

function RestrictForm({
  host,
  stream,
  onClose,
}: {
  host: Person
  stream: { id: string; title: string } | null
  onClose: () => void
}) {
  const reasons = useHostingReasons()
  const [reasonId, setReasonId] = useState('')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [note, setNote] = useState('')
  const [duration, setDuration] = useState('lifted')
  const [saveAsReason, setSaveAsReason] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const restrict = useAdminMutation(actions.restrictHost, {
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
        streamId: stream?.id,
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
  return (
    <form onSubmit={submit} className="space-y-4">
      {stream && (
        <p className="text-[13px] text-zinc-500">
          Because of the live <span className="font-medium text-zinc-800">{stream.title || 'without a title'}</span> -
          its page shows the restriction and their appeal.
        </p>
      )}
      <Field label="Reason" hint={saved.length === 0 ? 'No saved reasons yet - write one below.' : undefined}>
        <Select value={reasonId} onChange={(event) => pickReason(event.target.value)} data-autofocus>
          <option value="">Write a new reason</option>
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
          description="Staff can pick it when restricting someone else."
          checked={saveAsReason}
          onChange={(event) => setSaveAsReason(event.target.checked)}
        />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="How long">
          <Select value={duration} onChange={(event) => setDuration(event.target.value)}>
            {DURATIONS.map((each) => (
              <option key={each.value} value={each.value}>
                {each.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Note for the team" hint="Optional. The host never sees it.">
          <Input value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} />
        </Field>
      </div>
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
