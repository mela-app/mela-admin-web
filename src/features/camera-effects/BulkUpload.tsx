import { useQueryClient } from '@tanstack/react-query'
import { CircleAlert, CircleCheck, FolderUp, LoaderCircle } from 'lucide-react'
import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Callout } from '../../components/ui/feedback'
import { Checkbox, Field, Input, Select } from '../../components/ui/forms'
import { cn } from '../../lib/cn'
import { formatNumber } from '../../lib/format'
import { actions, uploadCameraEffectFile, useCameraEffectCategories } from '../../lib/queries'
import type { CameraEffectKind, MakeupAudience } from '../../lib/types'
import { makeThumbnail, matchUploads, type BulkItem } from './bulk'
import { KIND_LABELS } from './labels'

type Status = { state: 'waiting' } | { state: 'working' } | { state: 'added' } | { state: 'failed'; message: string }

interface Row extends BulkItem {
  include: boolean
  categoryId: string
  audience: MakeupAudience
  status: Status
}

const ACCEPT: Record<CameraEffectKind, string> = {
  EFFECT: '.deepar,image/png,image/jpeg,image/webp',
  MAKEUP: '.deepar,image/png,image/jpeg,image/webp',
  BACKGROUND: 'image/png,image/jpeg,image/webp',
  BEAUTY: '.deepar',
}

/**
 * Adding many at once (docs/features/camera-effects.md): pick a folder's
 * files - each .deepar finds its thumbnail by name (viking.deepar and
 * viking.png), each gets a name from its file - check them over, and add
 * them all. One that fails doesn't stop the rest.
 */
export function BulkUpload({ kind, onClose }: { kind: CameraEffectKind; onClose: () => void }) {
  const queryClient = useQueryClient()
  const categories = useCameraEffectCategories()
  const [rows, setRows] = useState<Row[]>([])
  const [unused, setUnused] = useState<File[]>([])
  const [categoryId, setCategoryId] = useState('')
  const [audience, setAudience] = useState<MakeupAudience>('FEMALE')
  const [publish, setPublish] = useState(true)
  const [makeMissing, setMakeMissing] = useState(true)
  const [running, setRunning] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const previews = useMemo(
    () => new Map(rows.map((row) => [row.base, row.thumbnail ?? (kind === 'BACKGROUND' ? row.file : null)])),
    [rows, kind],
  )
  const urls = useObjectUrls(previews)

  function pick(files: File[]) {
    const match = matchUploads(files, kind)
    setUnused(match.unused)
    setError(match.items.length === 0 ? (kind === 'BACKGROUND' ? 'Pick pictures (JPG, PNG or WebP).' : 'Pick .deepar files - with their thumbnails, if you have them.') : null)
    setRows(
      match.items.map((item) => ({
        ...item,
        include: true,
        categoryId: '',
        audience,
        status: { state: 'waiting' },
      })),
    )
  }

  const update = (base: string, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.base === base ? { ...row, ...patch } : row)))

  const chosen = rows.filter((row) => row.include && row.status.state !== 'added')
  const added = rows.filter((row) => row.status.state === 'added').length
  const failed = rows.filter((row) => row.status.state === 'failed').length

  async function start() {
    if (kind === 'EFFECT' && chosen.some((row) => !(row.categoryId || categoryId))) {
      return setError('Pick a category for all of them, or for each one.')
    }
    setError(null)
    setRunning(true)
    // Two at a time: quick, without flooding the connection.
    const queue = [...chosen]
    const worker = async () => {
      for (let row = queue.shift(); row; row = queue.shift()) await addOne(row)
    }
    await Promise.all([worker(), worker()])
    setRunning(false)
    void queryClient.invalidateQueries()
  }

  async function addOne(row: Row) {
    update(row.base, { status: { state: 'working' } })
    try {
      const name = row.name.trim() || 'Untitled'
      if (kind === 'BACKGROUND') {
        const image = await uploadCameraEffectFile(row.file!, 'image')
        await actions.createCameraEffect({ kind, name, imageKey: image.key, published: publish })
      } else {
        const file = await uploadCameraEffectFile(row.file!, 'file')
        const picture = row.thumbnail ?? (makeMissing ? await makeThumbnail(name) : null)
        const thumbnail = picture ? await uploadCameraEffectFile(picture, 'image') : null
        await actions.createCameraEffect({
          kind,
          name,
          fileKey: file.key,
          fileSize: file.size,
          ...(thumbnail ? { thumbnailKey: thumbnail.key } : {}),
          ...(kind === 'EFFECT' ? { categoryId: row.categoryId || categoryId } : {}),
          ...(kind === 'MAKEUP' ? { audience: row.audience } : {}),
          // Without a thumbnail it can't be published: added as a draft.
          published: publish && thumbnail !== null,
        })
      }
      update(row.base, { status: { state: 'added' } })
    } catch (failure) {
      update(row.base, {
        status: { state: 'failed', message: failure instanceof Error ? failure.message : 'It could not be added.' },
      })
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    if (!running) pick([...event.dataTransfer.files])
  }

  const finished = !running && rows.length > 0 && chosen.length === 0
  return (
    <div className="space-y-4">
      <label
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center',
          dragging ? 'border-brand-500 bg-brand-50' : 'border-zinc-300 hover:bg-zinc-50',
        )}
      >
        <FolderUp className="size-6 text-zinc-500" />
        <span className="text-sm font-medium text-zinc-900">Choose files, or drop them here</span>
        <span className="text-xs text-zinc-500">
          {kind === 'BACKGROUND'
            ? 'Pictures - each is one background, named from its file.'
            : 'All the .deepar files with their thumbnails: viking.deepar finds viking.png (or viking_thumb.png).'}
        </span>
        <input
          type="file"
          multiple
          accept={ACCEPT[kind]}
          className="sr-only"
          disabled={running}
          aria-label="Choose files"
          onChange={(event) => {
            pick([...(event.target.files ?? [])])
            event.target.value = ''
          }}
        />
      </label>

      {rows.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {kind === 'EFFECT' && (
              <Field label="Category for all" hint="Or pick one per effect below.">
                <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} disabled={running}>
                  <option value="">Pick a category…</option>
                  {(categories.data ?? []).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {kind === 'MAKEUP' && (
              <Field label="For all" hint="Or change it per look below.">
                <Select
                  value={audience}
                  disabled={running}
                  onChange={(event) => {
                    const next = event.target.value as MakeupAudience
                    setAudience(next)
                    setRows((current) => current.map((row) => ({ ...row, audience: next })))
                  }}
                >
                  <option value="FEMALE">Female</option>
                  <option value="MALE">Male</option>
                  <option value="ALL">Everyone</option>
                </Select>
              </Field>
            )}
            <div className="space-y-2 pt-1 sm:pt-6">
              <Checkbox
                label="Publish them"
                description="Hosts see them at once."
                checked={publish}
                disabled={running}
                onChange={(event) => setPublish(event.target.checked)}
              />
              {kind !== 'BACKGROUND' && (
                <Checkbox
                  label="Make a thumbnail where there's none"
                  description="A colored square with its name - replace it any time."
                  checked={makeMissing}
                  disabled={running}
                  onChange={(event) => setMakeMissing(event.target.checked)}
                />
              )}
            </div>
          </div>

          <ul className="max-h-[22rem] divide-y divide-zinc-100 overflow-y-auto rounded-lg border border-zinc-200">
            {rows.map((row) => {
              const url = urls.get(row.base)
              return (
                <li key={row.base} className="flex items-center gap-3 px-3 py-2">
                  <input
                    type="checkbox"
                    className="size-4 accent-zinc-900"
                    aria-label={`Add ${row.name}`}
                    checked={row.include}
                    disabled={running || row.status.state === 'added'}
                    onChange={(event) => update(row.base, { include: event.target.checked })}
                  />
                  <div className="size-11 shrink-0 overflow-hidden rounded-md border border-zinc-200 bg-zinc-100">
                    {url ? (
                      <img src={url} alt="" className="size-full object-cover" />
                    ) : (
                      <span className="grid size-full place-items-center text-[10px] text-zinc-400">No picture</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <Input
                      aria-label={`Name for ${row.file?.name ?? row.base}`}
                      value={row.name}
                      maxLength={40}
                      disabled={running || row.status.state === 'added'}
                      onChange={(event) => update(row.base, { name: event.target.value })}
                      className="h-8 text-[13px]"
                    />
                    <p className="truncate text-xs text-zinc-500">
                      {row.file?.name}
                      {row.thumbnail ? ` + ${row.thumbnail.name}` : kind === 'BACKGROUND' ? '' : ' · no thumbnail'}
                    </p>
                  </div>
                  {kind === 'EFFECT' && (
                    <Select
                      aria-label={`Category for ${row.name}`}
                      className="h-8 w-36 text-[13px]"
                      value={row.categoryId}
                      disabled={running || row.status.state === 'added'}
                      onChange={(event) => update(row.base, { categoryId: event.target.value })}
                    >
                      <option value="">{categoryId ? 'As for all' : 'Category…'}</option>
                      {(categories.data ?? []).map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </Select>
                  )}
                  {kind === 'MAKEUP' && (
                    <Select
                      aria-label={`For whom: ${row.name}`}
                      className="h-8 w-28 text-[13px]"
                      value={row.audience}
                      disabled={running || row.status.state === 'added'}
                      onChange={(event) => update(row.base, { audience: event.target.value as MakeupAudience })}
                    >
                      <option value="FEMALE">Female</option>
                      <option value="MALE">Male</option>
                      <option value="ALL">Everyone</option>
                    </Select>
                  )}
                  <StatusBadge status={row.status} />
                </li>
              )
            })}
          </ul>

          {unused.length > 0 && (
            <Callout>
              Not used ({formatNumber(unused.length)}): {unused.map((file) => file.name).join(', ')} - no .deepar file of the same
              name.
            </Callout>
          )}
        </>
      )}

      {error && <Callout tone="danger">{error}</Callout>}
      {(added > 0 || failed > 0) && !running && (
        <Callout tone={failed > 0 ? 'warning' : 'info'}>
          Added {formatNumber(added)}
          {failed > 0 ? `; ${formatNumber(failed)} failed - hover the red mark to see why, then try again.` : '.'}
        </Callout>
      )}

      <div className="-mx-5 -mb-4 flex items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50/60 px-5 py-3">
        <span className="mr-auto text-xs text-zinc-500">
          {rows.length > 0 && `${formatNumber(chosen.length)} to add`}
        </span>
        <Button onClick={onClose} disabled={running}>
          {finished ? 'Done' : 'Cancel'}
        </Button>
        <Button
          variant="primary"
          loading={running}
          disabled={chosen.length === 0}
          onClick={() => void start()}
        >
          {failed > 0 ? 'Try the rest again' : `Add ${formatNumber(chosen.length)} ${KIND_LABELS[kind].many.toLowerCase()}`}
        </Button>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: Status }) {
  switch (status.state) {
    case 'waiting':
      return null
    case 'working':
      return <LoaderCircle className="size-4 shrink-0 animate-spin text-zinc-500" aria-label="Adding" />
    case 'added':
      return (
        <Badge tone="success" icon={<CircleCheck />}>
          Added
        </Badge>
      )
    case 'failed':
      return (
        <span title={status.message} className="shrink-0">
          <Badge tone="danger" icon={<CircleAlert />}>
            Failed
          </Badge>
        </span>
      )
  }
}

// Previews of the picked pictures, released when they change.
function useObjectUrls(files: Map<string, File | null>): Map<string, string> {
  const urls = useMemo(() => {
    const next = new Map<string, string>()
    if (typeof URL.createObjectURL !== 'function') return next
    for (const [key, file] of files) {
      if (!file) continue
      try {
        next.set(key, URL.createObjectURL(file))
      } catch {
        // No preview; the upload still works.
      }
    }
    return next
  }, [files])
  useEffect(() => () => urls.forEach((url) => URL.revokeObjectURL(url)), [urls])
  return urls
}
