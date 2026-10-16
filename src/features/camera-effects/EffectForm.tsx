import { FileUp, ImageUp } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Callout } from '../../components/ui/feedback'
import { Checkbox, Field, Input, Select, Textarea } from '../../components/ui/forms'
import { formatNumber } from '../../lib/format'
import { actions, uploadCameraEffectFile, useAdminMutation, useCameraEffectCategories } from '../../lib/queries'
import type { CameraEffect, CameraEffectKind, MakeupAudience, SaveCameraEffect } from '../../lib/types'
import { BEAUTY_TEMPLATE, KIND_LABELS } from './labels'

interface EffectFormProps {
  kind: CameraEffectKind
  // Null: a new one.
  effect: CameraEffect | null
  onClose: () => void
}

type Upload = { key: string; size: number; name: string }

/**
 * Adding or changing a camera effect: its name, its file for the AR engine
 * (or picture), its thumbnail, and where the app shows it. Files go
 * straight to storage as they're picked; nothing changes in the app until
 * it's saved - and published.
 */
export function EffectForm({ kind, effect, onClose }: EffectFormProps) {
  const categories = useCameraEffectCategories()
  const [name, setName] = useState(effect?.name ?? '')
  const [categoryId, setCategoryId] = useState(effect?.categoryId ?? '')
  const [audience, setAudience] = useState<MakeupAudience>(effect?.audience ?? 'FEMALE')
  const [featured, setFeatured] = useState(effect?.featured ?? false)
  const [published, setPublished] = useState(effect?.published ?? false)
  const [sortOrder, setSortOrder] = useState(String(effect?.sortOrder ?? 0))
  const [controls, setControls] = useState(
    effect?.controls ? JSON.stringify(effect.controls, null, 2) : kind === 'BEAUTY' ? BEAUTY_TEMPLATE : '',
  )
  const [file, setFile] = useState<Upload | null>(null)
  const [thumbnail, setThumbnail] = useState<Upload | null>(null)
  const [image, setImage] = useState<Upload | null>(null)
  const [uploading, setUploading] = useState<'file' | 'thumbnail' | 'image' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const save = useAdminMutation(
    (body: SaveCameraEffect) => (effect ? actions.updateCameraEffect(effect.id, body) : actions.createCameraEffect(body)),
    { toastErrors: false, success: effect ? 'Saved.' : published ? 'Added - hosts see it now.' : 'Added as a draft.' },
  )

  const needsFile = kind !== 'BACKGROUND'
  const needsThumbnail = kind === 'EFFECT' || kind === 'MAKEUP'

  async function upload(picked: File | undefined, which: 'file' | 'thumbnail' | 'image') {
    if (!picked) return
    setUploading(which)
    setError(null)
    try {
      const done = await uploadCameraEffectFile(picked, which === 'file' ? 'file' : 'image')
      const uploaded = { ...done, name: picked.name }
      if (which === 'file') setFile(uploaded)
      else if (which === 'thumbnail') setThumbnail(uploaded)
      else setImage(uploaded)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The upload failed. Try again.')
    } finally {
      setUploading(null)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return setError('Give it a name.')
    let parsedControls: SaveCameraEffect['controls']
    if (kind === 'BEAUTY') {
      try {
        parsedControls = JSON.parse(controls || '[]')
      } catch {
        return setError('The sliders must be valid JSON - start from the template.')
      }
    }
    setError(null)
    try {
      await save.mutateAsync({
        ...(effect ? {} : { kind }),
        name: name.trim(),
        ...(kind === 'EFFECT' ? { categoryId: categoryId || null, featured } : {}),
        ...(kind === 'MAKEUP' ? { audience } : {}),
        ...(file ? { fileKey: file.key, fileSize: file.size } : {}),
        ...(thumbnail ? { thumbnailKey: thumbnail.key } : {}),
        ...(image ? { imageKey: image.key } : {}),
        ...(kind === 'BEAUTY' ? { controls: parsedControls } : {}),
        published,
        sortOrder: Number.parseInt(sortOrder, 10) || 0,
      })
      onClose()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Something went wrong. Try again.')
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Name" hint="What hosts see under it in the app." required>
        <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} data-autofocus />
      </Field>

      {kind === 'EFFECT' && (
        <Field label="Category" hint="Its tab in the app's Effects panel. Make categories in the Categories tab.">
          <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
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
        <Field label="For" hint="The Female and Male tabs of Makeup; Everyone shows in both.">
          <Select value={audience} onChange={(event) => setAudience(event.target.value as MakeupAudience)}>
            <option value="FEMALE">Female</option>
            <option value="MALE">Male</option>
            <option value="ALL">Everyone</option>
          </Select>
        </Field>
      )}

      {needsFile && (
        <FilePick
          label="Effect file (.deepar)"
          hint={
            kind === 'BEAUTY'
              ? 'The face-shape rig from DeepAR (e.g. the Ultimate Beauty package), exported as .deepar.'
              : 'Made in DeepAR Studio, or from DeepAR’s asset store, exported as .deepar.'
          }
          accept=".deepar"
          current={file?.name ?? (effect?.fileUrl ? `Uploaded${effect.fileSize ? ` · ${formatSize(effect.fileSize)}` : ''}` : null)}
          busy={uploading === 'file'}
          icon={<FileUp />}
          onPick={(picked) => void upload(picked, 'file')}
        />
      )}
      {kind === 'BACKGROUND' && (
        <FilePick
          label="Background picture"
          hint="Portrait (9:16) looks best - e.g. 1080 × 1920. JPG, PNG or WebP."
          accept="image/jpeg,image/png,image/webp"
          current={image?.name ?? (effect?.imageUrl ? 'Uploaded' : null)}
          preview={effect?.imageUrl}
          busy={uploading === 'image'}
          icon={<ImageUp />}
          onPick={(picked) => void upload(picked, 'image')}
        />
      )}
      {(needsThumbnail || kind === 'BACKGROUND') && (
        <FilePick
          label={kind === 'BACKGROUND' ? 'Thumbnail (optional)' : 'Thumbnail'}
          hint="Square, about 200 × 200. What hosts tap in the app."
          accept="image/jpeg,image/png,image/webp"
          current={thumbnail?.name ?? (effect?.thumbnailUrl ? 'Uploaded' : null)}
          preview={effect?.thumbnailUrl}
          busy={uploading === 'thumbnail'}
          icon={<ImageUp />}
          onPick={(picked) => void upload(picked, 'thumbnail')}
        />
      )}

      {kind === 'BEAUTY' && (
        <Field
          label="Sliders"
          hint="One per Beautify slider: the rig's game object, component and parameter, and the values at 0 and 100. Group: FACE, EYES, NOSE or MOUTH."
        >
          <Textarea
            value={controls}
            onChange={(event) => setControls(event.target.value)}
            rows={10}
            spellCheck={false}
            className="font-mono text-xs"
          />
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Order" hint="Lower comes first.">
          <Input type="number" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} />
        </Field>
        <div className="space-y-3 pt-6">
          {kind === 'EFFECT' && (
            <Checkbox
              label="Trending"
              description="Also in the app's Trending tab."
              checked={featured}
              onChange={(event) => setFeatured(event.target.checked)}
            />
          )}
          <Checkbox
            label="Published"
            description={kind === 'BEAUTY' ? 'Hosts get this rig - and not another.' : 'Hosts see it in the app.'}
            checked={published}
            onChange={(event) => setPublished(event.target.checked)}
          />
        </div>
      </div>

      {error && <Callout tone="danger">{error}</Callout>}
      <div className="-mx-5 -mb-4 flex justify-end gap-2 border-t border-zinc-200 bg-zinc-50/60 px-5 py-3">
        <Button onClick={onClose} disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={save.isPending} disabled={uploading !== null}>
          {effect ? 'Save' : `Add ${KIND_LABELS[kind].one.toLowerCase()}`}
        </Button>
      </div>
    </form>
  )
}

function FilePick({
  label,
  hint,
  accept,
  current,
  preview,
  busy,
  icon,
  onPick,
}: {
  label: string
  hint: string
  accept: string
  current: string | null
  preview?: string | null
  busy: boolean
  icon: React.ReactNode
  onPick: (file: File | undefined) => void
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-3">
        {preview && /^https?:\/\//.test(preview) && (
          <img src={preview} alt="" className="size-12 rounded-md border border-zinc-200 object-cover" />
        )}
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-[13px] font-medium text-zinc-800 hover:bg-zinc-50 [&_svg]:size-4">
          {icon}
          {busy ? 'Uploading…' : current ? 'Replace' : 'Choose file'}
          <input
            type="file"
            accept={accept}
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              onPick(event.target.files?.[0])
              event.target.value = ''
            }}
          />
        </label>
        <span className="min-w-0 truncate text-xs text-zinc-500">{current ?? 'Nothing yet'}</span>
      </div>
    </Field>
  )
}

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${formatNumber(Math.round(bytes / 1024))} KB`
}
