import { Megaphone, Pencil, Plus, Square, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Badge, type BadgeTone } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Pagination } from '../../components/ui/DataTable'
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog'
import { Callout, EmptyState, ErrorState, Skeleton } from '../../components/ui/feedback'
import { Checkbox, Field, Input, Select, Textarea } from '../../components/ui/forms'
import { useAuth } from '../../lib/auth-context'
import { cn } from '../../lib/cn'
import { formatDateTime } from '../../lib/format'
import { actions, useAdminMutation, useAnnouncements, type AnnouncementInput } from '../../lib/queries'
import { DEFAULT_PAGE_SIZE } from '../../lib/search'
import type { Announcement, AnnouncementTone } from '../../lib/types'
import { bannerState, BANNER_STATES, fromLocalInput, toLocalInput } from './campaign-format'

const TONES: Record<AnnouncementTone, { label: string; banner: string }> = {
  INFO: { label: 'Information', banner: 'border-sky-200 bg-sky-50 text-sky-950' },
  SUCCESS: { label: 'Good news', banner: 'border-emerald-200 bg-emerald-50 text-emerald-950' },
  WARNING: { label: 'Warning', banner: 'border-amber-200 bg-amber-50 text-amber-950' },
}

const STATE_TONES: Record<keyof typeof BANNER_STATES, BadgeTone> = {
  showing: 'success',
  upcoming: 'info',
  ended: 'neutral',
}

/** Banners at the top of the app's home screen, for a while - "Maintenance tonight at 22:00". */
export function BannersPanel() {
  const auth = useAuth()
  const canManage = auth.can('MANAGE_CAMPAIGNS')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Announcement | 'new' | null>(null)
  const [ending, setEnding] = useState<Announcement | null>(null)
  const [deleting, setDeleting] = useState<Announcement | null>(null)
  const banners = useAnnouncements(page)
  const end = useAdminMutation((id: string) => actions.endAnnouncement(id), { success: 'Banner ended.' })
  const remove = useAdminMutation((id: string) => actions.deleteAnnouncement(id), { success: 'Banner deleted.' })
  const rows = banners.data?.items ?? []

  return (
    <Card
      title="In-app banners"
      description="Shown at the top of the app's home screen while they run - at most three at a time, newest first."
      actions={
        canManage && (
          <Button variant="primary" icon={<Plus />} onClick={() => setEditing('new')}>
            New banner
          </Button>
        )
      }
      flush
    >
      {banners.isPending && (
        <div className="space-y-3 p-5">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}
      {banners.isError && !banners.data && <ErrorState error={banners.error} onRetry={() => void banners.refetch()} />}
      {banners.data && rows.length === 0 && (
        <EmptyState icon={<Megaphone />} title="No banners yet" description="Tell everyone in the app about news or maintenance." />
      )}
      {rows.length > 0 && (
        <ul className="divide-y divide-zinc-100">
          {rows.map((row) => {
            const state = bannerState(row)
            return (
              <li key={row.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
                <div className={cn('min-w-0 flex-1 basis-72 rounded-lg border p-3', TONES[row.tone].banner)}>
                  <p className="text-sm font-semibold">{row.title}</p>
                  <p className="mt-0.5 text-[13px] break-words">{row.message}</p>
                  {row.linkUrl && <p className="mt-1.5 text-xs font-medium underline">{row.linkLabel ?? 'Open'}</p>}
                </div>
                <div className="w-56 space-y-1 text-xs text-zinc-500">
                  <Badge tone={STATE_TONES[state]}>{BANNER_STATES[state]}</Badge>
                  <p>From {formatDateTime(row.startsAt)}</p>
                  <p>{row.endsAt ? `Until ${formatDateTime(row.endsAt)}` : 'Until ended'}</p>
                  <p>
                    {row.platform === 'ANDROID' ? 'Android only' : row.platform === 'IOS' ? 'iPhone only' : 'Every phone'}
                    {row.dismissible ? ' · can be closed' : ''}
                  </p>
                  {canManage && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      <Button size="sm" icon={<Pencil />} onClick={() => setEditing(row)}>
                        Edit
                      </Button>
                      {state !== 'ended' && (
                        <Button size="sm" icon={<Square />} onClick={() => setEnding(row)}>
                          End
                        </Button>
                      )}
                      <Button size="sm" variant="danger-ghost" icon={<Trash2 />} aria-label="Delete banner" onClick={() => setDeleting(row)} />
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {banners.data && banners.data.total > DEFAULT_PAGE_SIZE && (
        <Pagination page={page} pageSize={DEFAULT_PAGE_SIZE} total={banners.data.total} onPageChange={setPage} />
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        size="lg"
        title={editing === 'new' ? 'New banner' : 'Edit banner'}
        description="People see it at the top of the app's home screen while it runs."
      >
        {editing !== null && (
          <BannerForm banner={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
        )}
      </Dialog>
      <ConfirmDialog
        open={ending !== null}
        onClose={() => setEnding(null)}
        title="End this banner now?"
        description="It leaves the app at once. It stays in this list."
        confirmLabel="End banner"
        onConfirm={() => (ending ? end.mutateAsync(ending.id) : Promise.resolve())}
      />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this banner?"
        description="It leaves the app and this list. The audit log keeps that it existed."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => (deleting ? remove.mutateAsync(deleting.id) : Promise.resolve())}
      />
    </Card>
  )
}

function BannerForm({ banner, onClose }: { banner: Announcement | null; onClose(): void }) {
  const [title, setTitle] = useState(banner?.title ?? '')
  const [message, setMessage] = useState(banner?.message ?? '')
  const [tone, setTone] = useState<AnnouncementTone>(banner?.tone ?? 'INFO')
  const [linkUrl, setLinkUrl] = useState(banner?.linkUrl ?? '')
  const [linkLabel, setLinkLabel] = useState(banner?.linkLabel ?? '')
  const [platform, setPlatform] = useState<'' | 'ANDROID' | 'IOS'>(banner?.platform ?? '')
  const [startsAt, setStartsAt] = useState(toLocalInput(banner?.startsAt ?? new Date()))
  const [endsAt, setEndsAt] = useState(toLocalInput(banner?.endsAt))
  const [dismissible, setDismissible] = useState(banner?.dismissible ?? true)
  const [error, setError] = useState<string | null>(null)
  const start = fromLocalInput(startsAt)
  const finish = fromLocalInput(endsAt)
  const timeProblem = !start ? 'Pick when it starts.' : finish && finish <= start ? 'It must end after it starts.' : null
  const save = useAdminMutation(
    (input: AnnouncementInput) => actions.saveAnnouncement(banner?.id ?? null, input),
    { toastErrors: false, success: banner ? 'Banner saved.' : 'Banner published.' },
  )

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!title.trim() || !message.trim() || timeProblem || !start) return
    setError(null)
    try {
      await save.mutateAsync({
        title: title.trim(),
        message: message.trim(),
        tone,
        linkUrl: linkUrl.trim() || null,
        linkLabel: linkUrl.trim() ? linkLabel.trim() || null : null,
        platform: platform || null,
        startsAt: start,
        endsAt: finish,
        dismissible,
      })
      onClose()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Something went wrong. Try again.')
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className={cn('rounded-lg border p-3', TONES[tone].banner)} aria-label="Preview">
        <p className="text-sm font-semibold">{title || 'Title'}</p>
        <p className="mt-0.5 text-[13px]">{message || 'What people read.'}</p>
        {linkUrl.trim() && <p className="mt-1.5 text-xs font-medium underline">{linkLabel || 'Open'}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <Field label="Title" required>
          <Input value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} data-autofocus />
        </Field>
        <Field label="Kind">
          <Select value={tone} onChange={(event) => setTone(event.target.value as AnnouncementTone)}>
            {(Object.keys(TONES) as AnnouncementTone[]).map((value) => (
              <option key={value} value={value}>
                {TONES[value].label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Message" required>
        <Textarea value={message} maxLength={400} onChange={(event) => setMessage(event.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <Field label="Button link" hint="https://… or a live or profile link from the app - empty for no button.">
          <Input value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} />
        </Field>
        <Field label="Button text">
          <Input value={linkLabel} maxLength={30} placeholder="Open" disabled={!linkUrl.trim()} onChange={(event) => setLinkLabel(event.target.value)} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Starts" required>
          <Input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
        </Field>
        <Field label="Ends" hint="Empty: until ended." error={timeProblem}>
          <Input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
        </Field>
        <Field label="Phones">
          <Select value={platform} onChange={(event) => setPlatform(event.target.value as typeof platform)}>
            <option value="">Every phone</option>
            <option value="ANDROID">Android only</option>
            <option value="IOS">iPhone only</option>
          </Select>
        </Field>
      </div>
      <Checkbox
        label="People can close it"
        description="Off for something everyone must see, like maintenance."
        checked={dismissible}
        onChange={(event) => setDismissible(event.target.checked)}
      />
      {error && <Callout tone="danger">{error}</Callout>}
      <div className="-mx-5 -mb-4 flex justify-end gap-2 border-t border-zinc-200 bg-zinc-50/60 px-5 py-3">
        <Button onClick={onClose} disabled={save.isPending}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          loading={save.isPending}
          disabled={!title.trim() || !message.trim() || timeProblem !== null}
        >
          {banner ? 'Save' : 'Publish'}
        </Button>
      </div>
    </form>
  )
}
