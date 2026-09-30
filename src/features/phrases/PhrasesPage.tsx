import { getRouteApi } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { Pencil, ShieldBan, Trash } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import type { PhrasesSearch } from '../../app/search'
import { PersonLink } from '../../components/PersonLink'
import { Badge } from '../../components/ui/Badge'
import { Button, IconButton } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { DataTable } from '../../components/ui/DataTable'
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog'
import { Callout, EmptyState } from '../../components/ui/feedback'
import { Field, Input, Segmented, Select, Textarea } from '../../components/ui/forms'
import { PageHeader, RelativeTime } from '../../components/ui/misc'
import { SearchInput } from '../../components/ui/SearchInput'
import { useAuth } from '../../lib/auth-context'
import { PHRASE_SEVERITY_LABELS } from '../../lib/labels'
import { actions, useAdminMutation, usePhrases } from '../../lib/queries'
import type { BannedPhrase, BannedPhraseSeverity, PhraseTestResult } from '../../lib/types'

const routeApi = getRouteApi('/_app/phrases')

const SEVERITY_HELP: Record<BannedPhraseSeverity, string> = {
  MASK: 'The message is sent with the phrase replaced by asterisks.',
  REJECT: 'The message is not sent, and the sender is told why.',
}

export function PhrasesPage() {
  const auth = useAuth()
  const search = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const phrases = usePhrases(search)
  const [editing, setEditing] = useState<BannedPhrase | null>(null)
  const [removing, setRemoving] = useState<BannedPhrase | null>(null)
  const remove = useAdminMutation((phraseId: string) => actions.removePhrase(phraseId), {
    toastErrors: false,
    success: 'Phrase removed. Chat stops filtering it straight away.',
  })
  const canEdit = auth.can('MANAGE_PHRASES')
  const columns = useMemo(
    () => phraseColumns(canEdit, { onEdit: setEditing, onRemove: setRemoving }),
    [canEdit],
  )
  const update = (patch: Partial<PhrasesSearch>) => void navigate({ search: (previous) => ({ ...previous, ...patch }) })

  return (
    <>
      <PageHeader
        title="Banned phrases"
        description="Words and phrases the chat filter acts on. Matching ignores letter case, spacing and look-alike characters such as 0 for o."
      />
      {!canEdit && (
        <Callout className="mb-6" title="Read only">
          Your role doesn't include changing this list. You can still test how a message would be treated.
        </Callout>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card flush>
          <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 p-4">
            <SearchInput className="w-full sm:w-72" value={search.q} onChange={(q) => update({ q })} placeholder="Search phrases…" />
            <Select
              aria-label="Action"
              className="w-44"
              value={search.severity ?? ''}
              onChange={(event) => update({ severity: (event.target.value || undefined) as BannedPhraseSeverity | undefined })}
            >
              <option value="">Any action</option>
              <option value="MASK">Mask</option>
              <option value="REJECT">Block message</option>
            </Select>
            {phrases.data && (
              <span className="ml-auto text-[13px] text-zinc-500 tabular-nums">
                {phrases.data.items.length} {phrases.data.items.length === 1 ? 'phrase' : 'phrases'}
              </span>
            )}
          </div>
          <DataTable
            label="Banned phrases"
            columns={columns}
            data={phrases.data?.items}
            getRowId={(row) => row.id}
            loading={phrases.isFetching}
            error={phrases.error}
            onRetry={() => void phrases.refetch()}
            empty={
              <EmptyState
                icon={<ShieldBan />}
                title={search.q || search.severity ? 'No matching phrases' : 'The list is empty'}
                description={canEdit ? 'Add the first phrase with the form alongside.' : 'Someone who can manage the list can add phrases.'}
              />
            }
          />
        </Card>
        <div className="space-y-6">
          {canEdit && <AddPhraseCard />}
          <TestCard />
        </div>
      </div>

      <EditPhraseDialog phrase={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Remove “${removing?.phrase ?? ''}”?`}
        description="Chat stops filtering it straight away. Messages already filtered stay as they are."
        confirmLabel="Remove phrase"
        tone="danger"
        onConfirm={() => remove.mutateAsync(removing!.id)}
      />
    </>
  )
}

function phraseColumns(
  canEdit: boolean,
  handlers: { onEdit: (phrase: BannedPhrase) => void; onRemove: (phrase: BannedPhrase) => void },
): Array<ColumnDef<BannedPhrase>> {
  const columns: Array<ColumnDef<BannedPhrase>> = [
    {
      id: 'phrase',
      header: 'Phrase',
      cell: ({ row }) => <span className="font-mono text-[13px] text-zinc-900">{row.original.phrase}</span>,
    },
    {
      id: 'severity',
      header: 'Action',
      cell: ({ row }) => (
        <Badge tone={row.original.severity === 'REJECT' ? 'danger' : 'warning'}>
          {PHRASE_SEVERITY_LABELS[row.original.severity]}
        </Badge>
      ),
    },
    {
      id: 'creator',
      header: 'Added by',
      cell: ({ row }) =>
        row.original.creator ? (
          <PersonLink person={row.original.creator} compact className="font-normal" />
        ) : (
          <span className="text-zinc-400">—</span>
        ),
    },
    {
      id: 'createdAt',
      header: 'Added',
      cell: ({ row }) => <RelativeTime value={row.original.createdAt} className="whitespace-nowrap text-zinc-700" />,
    },
  ]
  if (canEdit) {
    columns.push({
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      meta: { align: 'right' },
      cell: ({ row }) => (
        <span className="inline-flex gap-0.5">
          <IconButton label={`Edit “${row.original.phrase}”`} onClick={() => handlers.onEdit(row.original)}>
            <Pencil />
          </IconButton>
          <IconButton label={`Remove “${row.original.phrase}”`} onClick={() => handlers.onRemove(row.original)}>
            <Trash />
          </IconButton>
        </span>
      ),
    })
  }
  return columns
}

function AddPhraseCard() {
  const [phrase, setPhrase] = useState('')
  const [severity, setSeverity] = useState<BannedPhraseSeverity>('MASK')
  const [error, setError] = useState<string | null>(null)
  const add = useAdminMutation(() => actions.addPhrase(phrase.trim(), severity), {
    toastErrors: false,
    success: (added) => `“${added.phrase}” added. Chat filters it from the next message.`,
  })

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      await add.mutateAsync(undefined)
      setPhrase('')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Something went wrong.')
    }
  }

  return (
    <Card title="Add a phrase">
      <form onSubmit={submit} className="space-y-4">
        {error && <Callout tone="danger">{error}</Callout>}
        <Field label="Phrase" hint="2 to 100 characters. Saved in lower case.">
          <Input value={phrase} maxLength={100} onChange={(event) => setPhrase(event.target.value)} />
        </Field>
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-zinc-800">When a message contains it</p>
          <Segmented<BannedPhraseSeverity>
            label="Action"
            value={severity}
            onChange={setSeverity}
            options={[
              { value: 'MASK', label: 'Mask it' },
              { value: 'REJECT', label: 'Block the message' },
            ]}
          />
          <p className="mt-1.5 text-xs text-zinc-500">{SEVERITY_HELP[severity]}</p>
        </div>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={add.isPending} disabled={phrase.trim().length < 2}>
            Add phrase
          </Button>
        </div>
      </form>
    </Card>
  )
}

function TestCard() {
  const [text, setText] = useState('')
  const [result, setResult] = useState<PhraseTestResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      setResult(await actions.testPhrase(text))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Something went wrong.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Card title="Try a message" description="See what the filter would do, without sending anything.">
      <form onSubmit={submit} className="space-y-3">
        <Textarea
          aria-label="Message to test"
          value={text}
          maxLength={500}
          rows={3}
          placeholder="Type a chat message…"
          onChange={(event) => {
            setText(event.target.value)
            setResult(null)
          }}
        />
        <div className="flex justify-end">
          <Button type="submit" loading={pending} disabled={!text.trim()}>
            Test
          </Button>
        </div>
      </form>
      {error && <Callout tone="danger" className="mt-3">{error}</Callout>}
      {result && (
        <div className="mt-4 space-y-2 border-t border-zinc-100 pt-4" aria-live="polite">
          {result.outcome === 'ALLOWED' && <Badge tone="success">Sent as written</Badge>}
          {result.outcome === 'MASKED' && <Badge tone="warning">Sent with parts masked</Badge>}
          {result.outcome === 'REJECTED' && <Badge tone="danger">Blocked</Badge>}
          {result.delivered !== null && result.outcome === 'MASKED' && (
            <p className="rounded-md bg-zinc-50 px-3 py-2 font-mono text-[13px] break-words text-zinc-800">{result.delivered}</p>
          )}
          {result.matches.length > 0 && (
            <p className="text-xs text-zinc-500">
              Matched: {result.matches.map((match) => `“${match.phrase}”`).join(', ')}
            </p>
          )}
        </div>
      )}
    </Card>
  )
}

function EditPhraseDialog({ phrase, onClose }: { phrase: BannedPhrase | null; onClose: () => void }) {
  return (
    <Dialog open={phrase !== null} onClose={onClose} title="Edit phrase" size="sm">
      {phrase && <EditPhraseForm phrase={phrase} onDone={onClose} />}
    </Dialog>
  )
}

function EditPhraseForm({ phrase, onDone }: { phrase: BannedPhrase; onDone: () => void }) {
  const [text, setText] = useState(phrase.phrase)
  const [severity, setSeverity] = useState<BannedPhraseSeverity>(phrase.severity)
  const [error, setError] = useState<string | null>(null)
  const save = useAdminMutation(
    () =>
      actions.updatePhrase(phrase.id, {
        ...(text.trim() !== phrase.phrase ? { phrase: text.trim() } : {}),
        ...(severity !== phrase.severity ? { severity } : {}),
      }),
    { toastErrors: false, success: 'Phrase updated.' },
  )
  const changed = text.trim() !== phrase.phrase || severity !== phrase.severity

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      await save.mutateAsync(undefined)
      onDone()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Something went wrong.')
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Callout tone="danger">{error}</Callout>}
      <Field label="Phrase">
        <Input value={text} maxLength={100} onChange={(event) => setText(event.target.value)} />
      </Field>
      <div>
        <p className="mb-1.5 text-[13px] font-medium text-zinc-800">Action</p>
        <Segmented<BannedPhraseSeverity>
          label="Action"
          value={severity}
          onChange={setSeverity}
          options={[
            { value: 'MASK', label: 'Mask it' },
            { value: 'REJECT', label: 'Block the message' },
          ]}
        />
        <p className="mt-1.5 text-xs text-zinc-500">{SEVERITY_HELP[severity]}</p>
      </div>
      <div className="-mx-5 -mb-4 flex justify-end gap-2 border-t border-zinc-200 bg-zinc-50/60 px-5 py-3">
        <Button onClick={onDone} disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={save.isPending} disabled={!changed || text.trim().length < 2}>
          Save
        </Button>
      </div>
    </form>
  )
}
