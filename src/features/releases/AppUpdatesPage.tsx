import { getRouteApi } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { ExternalLink, Pencil, Send, Smartphone, Store, Trash } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { PersonLink } from '../../components/PersonLink'
import { Badge } from '../../components/ui/Badge'
import { Button, IconButton } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { DataTable, Pagination } from '../../components/ui/DataTable'
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog'
import { Callout, EmptyState, Skeleton } from '../../components/ui/feedback'
import { Checkbox, Field, Input, Segmented, Textarea } from '../../components/ui/forms'
import { PageHeader, RelativeTime } from '../../components/ui/misc'
import { useAuth } from '../../lib/auth-context'
import { formatPrecise } from '../../lib/format'
import { APP_PLATFORM_LABELS } from '../../lib/labels'
import { actions, useAdminMutation, useAppReleases } from '../../lib/queries'
import { DEFAULT_PAGE_SIZE } from '../../lib/search'
import type { AppPlatform, AppPlatformStatus, AppRelease } from '../../lib/types'
import { noteLines, releaseProblem, whereFrom } from './release-form'

const routeApi = getRouteApi('/_app/app-updates')
const PLATFORMS: AppPlatform[] = ['ANDROID', 'IOS']

/**
 * Telling people a new version of the app is out. Phones on an older version
 * ask them to update, showing what's new - and get it from Google Play (in
 * the app itself) or the App Store; below a required update the app can't be
 * used until they do.
 */
export function AppUpdatesPage() {
  const auth = useAuth()
  const search = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const releases = useAppReleases(search.page ?? 1)
  const canManage = auth.can('MANAGE_APP_RELEASES')
  const [editing, setEditing] = useState<AppRelease | null>(null)
  const [withdrawing, setWithdrawing] = useState<AppRelease | null>(null)
  const withdraw = useAdminMutation((releaseId: string) => actions.withdrawRelease(releaseId), {
    toastErrors: false,
    success: 'Update withdrawn. Phones are no longer asked to install it.',
  })
  const columns = useMemo(() => releaseColumns(canManage, setEditing, setWithdrawing), [canManage])
  const platforms = releases.data?.platforms

  return (
    <>
      <PageHeader
        title="App updates"
        description="Tell people a new version of the app is out. Phones on an older version ask them to update and show what's new; on Android it downloads from Google Play inside the app. A required update must be installed before the app can be used again."
      />
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          {PLATFORMS.map((platform) => (
            <PlatformCard key={platform} platform={platform} status={platforms?.[platform]} />
          ))}
        </div>
        {canManage && platforms && <Publisher platforms={platforms} />}
        <Card title="Published updates" flush>
          <DataTable
            label="Published updates"
            columns={columns}
            data={releases.data?.items}
            getRowId={(row) => row.id}
            loading={releases.isFetching}
            error={releases.error}
            onRetry={() => void releases.refetch()}
            empty={
              <EmptyState
                icon={<Smartphone />}
                title="No updates published yet"
                description="Until one is, phones aren't asked to update."
              />
            }
          />
          {releases.data && releases.data.total > 0 && (
            <Pagination
              page={search.page ?? 1}
              pageSize={DEFAULT_PAGE_SIZE}
              total={releases.data.total}
              onPageChange={(page) =>
                void navigate({ search: (previous) => ({ ...previous, page: page > 1 ? page : undefined }) })
              }
            />
          )}
        </Card>
      </div>

      <EditReleaseDialog release={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={withdrawing !== null}
        onClose={() => setWithdrawing(null)}
        title={withdrawing ? `Withdraw ${releaseName(withdrawing)}?` : 'Withdraw this update?'}
        description="Phones stop being told about it at once - a required one no longer holds anybody up. Anyone who already installed it keeps it."
        confirmLabel="Withdraw update"
        tone="danger"
        onConfirm={() => withdraw.mutateAsync(withdrawing!.id)}
      />
    </>
  )
}

function PlatformCard({ platform, status }: { platform: AppPlatform; status: AppPlatformStatus | undefined }) {
  const latest = status?.latest
  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-zinc-600">
          <Smartphone className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-zinc-500">{APP_PLATFORM_LABELS[platform]}</p>
          {!status ? (
            <div className="mt-2 space-y-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-3 w-48" />
            </div>
          ) : latest ? (
            <>
              <p className="mt-0.5 text-lg font-semibold tracking-tight text-zinc-900">{latest.version}</p>
              <p className="text-xs text-zinc-500">
                Published <RelativeTime value={latest.createdAt} />
              </p>
              <p className="mt-2 text-[13px] text-zinc-700">
                {status.required
                  ? `Versions below ${status.required.version} must update.`
                  : 'Nothing is required: older versions are asked, and can update later.'}
              </p>
            </>
          ) : (
            <p className="mt-1 text-[13px] text-zinc-500">Nothing published yet - phones aren't asked to update.</p>
          )}
        </div>
      </div>
    </Card>
  )
}

function Publisher({ platforms }: { platforms: Record<AppPlatform, AppPlatformStatus> }) {
  const [platform, setPlatform] = useState<AppPlatform>('ANDROID')
  // Null until edited: the next patch version is suggested.
  const [version, setVersion] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [required, setRequired] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const status = platforms[platform]
  const draft = { version: (version ?? status.suggestedVersion).trim(), notes: notes.trim() }
  const problem = status.storeLink
    ? releaseProblem(draft, status.latest)
    : `There's no ${APP_PLATFORM_LABELS[platform]} store listing yet - set IOS_INSTALL_URL on the server first.`
  const started = Boolean(version !== null || notes)
  const publish = useAdminMutation(() => actions.publishRelease({ platform, ...draft, required }), {
    toastErrors: false,
    success: (release) => `${releaseName(release)} published. Phones that are open are told at once.`,
  })

  async function deliver() {
    await publish.mutateAsync(undefined)
    setVersion(null)
    setNotes('')
    setRequired(false)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!problem) setConfirming(true)
  }

  return (
    <Card
      title="Publish an update"
      description="Publish once the new version is live in the store - phones are told at once, and get it from there."
    >
      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-zinc-800">App</p>
            <Segmented<AppPlatform>
              label="App"
              value={platform}
              onChange={(next) => {
                setPlatform(next)
                setVersion(null)
              }}
              options={PLATFORMS.map((value) => ({ value, label: APP_PLATFORM_LABELS[value] }))}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Version"
              hint={`As in pubspec.yaml and the store${status.latest ? ` - newer than ${status.latest.version}` : ''}`}
              required
            >
              <Input
                value={version ?? status.suggestedVersion}
                onChange={(event) => setVersion(event.target.value)}
                placeholder="1.2.0"
                maxLength={14}
              />
            </Field>
            <StoreField platform={platform} link={status.storeLink} />
          </div>
          <Field label="What's new" hint={`One change per line - each shows as a point in the app. ${draft.notes.length}/1000`} required>
            <Textarea
              value={notes}
              maxLength={1000}
              rows={4}
              placeholder={'Lives start faster\nSearch in your messages'}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
          <Checkbox
            label="Required update"
            description="Older versions can't be used until they update - for fixes everyone must have. Someone in a live finishes it first."
            checked={required}
            onChange={(event) => setRequired(event.target.checked)}
          />
          <div className="flex flex-wrap items-center justify-end gap-3">
            {problem && started && <p className="text-xs text-zinc-500">{problem}</p>}
            <Button type="submit" variant="primary" icon={<Send />} loading={publish.isPending} disabled={problem !== null}>
              Publish update
            </Button>
          </div>
        </div>
        <UpdatePreview version={draft.version} notes={draft.notes} required={required} />
      </form>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Publish ${APP_PLATFORM_LABELS[platform]} ${draft.version}?`}
        description={
          required
            ? "Phones on an older version can't use the app until they install it - from the moment they open it, or right away if it's open. Make sure it's live in the store first."
            : "Phones on an older version are asked to update and shown what's new. People can put it off for a few days."
        }
        confirmLabel={required ? 'Publish required update' : 'Publish update'}
        tone={required ? 'danger' : 'default'}
        onConfirm={deliver}
      />
    </Card>
  )
}

/** Where phones get the update - set on the server, not per release. */
function StoreField({ platform, link }: { platform: AppPlatform; link: string | null }) {
  const store = platform === 'IOS' ? 'App Store' : 'Google Play'
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium text-zinc-800">Download from</p>
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-9 items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 text-[13px] text-zinc-800 hover:bg-zinc-100"
        >
          <Store className="size-4 text-zinc-500" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{store}</span>
          <ExternalLink className="size-3.5 text-zinc-400" aria-hidden />
        </a>
      ) : (
        <p className="flex h-9 items-center text-[13px] text-zinc-500">No {store} listing yet</p>
      )}
      <p className="mt-1.5 text-xs text-zinc-500">
        {platform === 'ANDROID'
          ? 'Phones download it inside the app, from Google Play.'
          : 'Phones open the App Store to update.'}
      </p>
    </div>
  )
}

/** Roughly how the app shows it: a sheet over the screen, or a whole screen when required. */
function UpdatePreview({ version, notes, required }: { version: string; notes: string; required: boolean }) {
  const lines = noteLines(notes)
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium text-zinc-800">In the app</p>
      <div className="flex min-h-80 flex-col justify-end rounded-xl bg-[#0E0E14] px-3 pt-3">
        <div className={required ? 'flex-1 px-1 py-4' : 'rounded-t-[20px] bg-[#191922] px-4 pt-2 pb-4'}>
          {!required && <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-white/20" aria-hidden />}
          <p className="text-[11px] font-bold tracking-wide text-[#7CC4E8] uppercase">
            {required ? 'Update required' : 'Update available'}
          </p>
          <p className="mt-1 text-base font-extrabold text-[#F5F5F7]">
            Mela {version || <span className="text-[#9C9CAC]">1.2.0</span>}
          </p>
          {required && (
            <p className="mt-1 text-xs text-[#9C9CAC]">This version of Mela is no longer supported. Update to keep using it.</p>
          )}
          <p className="mt-3 text-xs font-semibold text-[#9C9CAC]">What's new</p>
          <ul className="mt-1 space-y-1 text-[13px] text-[#F5F5F7]">
            {lines.length > 0 ? (
              lines.map((line, index) => (
                <li key={index} className="flex gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#2A86B8]" aria-hidden />
                  <span className="min-w-0 break-words">{line}</span>
                </li>
              ))
            ) : (
              <li className="text-[#9C9CAC]">Each line of what's new shows here.</li>
            )}
          </ul>
          <div className="mt-4 rounded-full bg-linear-to-r from-[#1D5B7C] to-[#2A86B8] py-2 text-center text-sm font-bold text-white">
            Update now
          </div>
          {!required && <p className="mt-2.5 text-center text-xs font-semibold text-[#9C9CAC]">Later</p>}
        </div>
      </div>
    </div>
  )
}

function EditReleaseDialog({ release, onClose }: { release: AppRelease | null; onClose: () => void }) {
  return (
    <Dialog
      open={release !== null}
      onClose={onClose}
      title={release ? `Edit ${releaseName(release)}` : 'Edit update'}
      description="The version stays as published. If it's wrong, withdraw the update and publish it again."
    >
      {release && <EditReleaseForm release={release} onClose={onClose} />}
    </Dialog>
  )
}

function EditReleaseForm({ release, onClose }: { release: AppRelease; onClose: () => void }) {
  const [notes, setNotes] = useState(release.notes)
  const [required, setRequired] = useState(release.required)
  const [error, setError] = useState<string | null>(null)
  const save = useAdminMutation(() => actions.updateRelease(release.id, { notes: notes.trim(), required }), {
    toastErrors: false,
    success: 'Update saved. Phones that are open check again at once.',
  })
  const changed = notes.trim() !== release.notes || required !== release.required
  const problem = notes.trim().length < 3 ? "Say what's new." : null

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (problem || !changed) return
    setError(null)
    try {
      await save.mutateAsync(undefined)
      onClose()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Something went wrong. Try again.')
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="What's new" hint={`One change per line. ${notes.trim().length}/1000`} required>
        <Textarea value={notes} rows={5} maxLength={1000} onChange={(event) => setNotes(event.target.value)} data-autofocus />
      </Field>
      <Checkbox
        label="Required update"
        description="Older versions can't be used until they update."
        checked={required}
        onChange={(event) => setRequired(event.target.checked)}
      />
      {(error ?? problem) && <Callout tone={error ? 'danger' : 'info'}>{error ?? problem}</Callout>}
      <div className="-mx-5 -mb-4 flex justify-end gap-2 border-t border-zinc-200 bg-zinc-50/60 px-5 py-3">
        <Button onClick={onClose} disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={save.isPending} disabled={!changed || problem !== null}>
          Save changes
        </Button>
      </div>
    </form>
  )
}

function releaseName(release: Pick<AppRelease, 'platform' | 'version'>): string {
  return `${APP_PLATFORM_LABELS[release.platform]} ${release.version}`
}

function releaseColumns(
  canManage: boolean,
  onEdit: (release: AppRelease) => void,
  onWithdraw: (release: AppRelease) => void,
): Array<ColumnDef<AppRelease>> {
  const columns: Array<ColumnDef<AppRelease>> = [
    {
      id: 'createdAt',
      header: 'Published',
      cell: ({ row }) => (
        <span className="block leading-tight" title={formatPrecise(row.original.createdAt)}>
          <RelativeTime value={row.original.createdAt} className="whitespace-nowrap text-zinc-900" />
        </span>
      ),
    },
    {
      id: 'version',
      header: 'Version',
      cell: ({ row }) => (
        <span className="block leading-tight whitespace-nowrap">
          <span className="font-medium text-zinc-900">
            {APP_PLATFORM_LABELS[row.original.platform]} {row.original.version}
          </span>
          {row.original.build !== null && <span className="block text-xs text-zinc-500">build {row.original.build}</span>}
        </span>
      ),
    },
    {
      id: 'required',
      header: 'Update',
      cell: ({ row }) => (row.original.required ? <Badge tone="danger">Required</Badge> : <Badge>Optional</Badge>),
    },
    {
      id: 'notes',
      header: "What's new",
      cell: ({ row }) => (
        <span className="line-clamp-2 block max-w-md whitespace-normal text-zinc-800">
          {noteLines(row.original.notes).join(' · ')}
        </span>
      ),
    },
    {
      id: 'link',
      header: 'Download',
      cell: ({ row }) =>
        row.original.downloadUrl ? (
          <a
            href={row.original.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={row.original.downloadUrl}
            className="block max-w-48 truncate text-brand-700 hover:underline"
          >
            {whereFrom(row.original)}
          </a>
        ) : (
          <span className="text-zinc-700">{whereFrom(row.original)}</span>
        ),
    },
    {
      id: 'publishedBy',
      header: 'Published by',
      cell: ({ row }) => <PersonLink person={row.original.publishedBy} compact className="font-normal" />,
    },
  ]
  if (!canManage) return columns
  return [
    ...columns,
    {
      id: 'actions',
      header: '',
      meta: { align: 'right' },
      cell: ({ row }) => (
        <div className="flex justify-end gap-0.5">
          <IconButton label={`Edit ${releaseName(row.original)}`} onClick={() => onEdit(row.original)}>
            <Pencil />
          </IconButton>
          <IconButton label={`Withdraw ${releaseName(row.original)}`} onClick={() => onWithdraw(row.original)}>
            <Trash />
          </IconButton>
        </div>
      ),
    },
  ]
}
