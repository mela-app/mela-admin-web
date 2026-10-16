import { getRouteApi } from '@tanstack/react-router'
import { Eye, EyeOff, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { CameraEffectsTab } from '../../app/search'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog'
import { Callout, EmptyState, ErrorState, Skeleton } from '../../components/ui/feedback'
import { Select } from '../../components/ui/forms'
import { PageHeader, RelativeTime, Tabs } from '../../components/ui/misc'
import { useAuth } from '../../lib/auth-context'
import { actions, useAdminMutation, useCameraEffectCategories, useCameraEffects } from '../../lib/queries'
import type { CameraEffect, CameraEffectKind } from '../../lib/types'
import { CategoriesPanel } from './CategoriesPanel'
import { EffectForm } from './EffectForm'
import { AUDIENCE_LABELS, KIND_LABELS } from './labels'

const routeApi = getRouteApi('/_app/camera-effects')

const KIND_OF: Record<Exclude<CameraEffectsTab, 'categories'>, CameraEffectKind> = {
  effects: 'EFFECT',
  makeup: 'MAKEUP',
  backgrounds: 'BACKGROUND',
  beauty: 'BEAUTY',
}

const EMPTY: Record<CameraEffectKind, string> = {
  EFFECT: 'Add face and scene effects - hosts find them in the app’s Effects panel by category.',
  MAKEUP: 'Add makeup looks for the Makeup tab of Beautify - for women, men, or both.',
  BACKGROUND: 'Add pictures hosts can put behind them in Effects → Green Screen.',
  BEAUTY: 'Add the face-shape rig: it gives Beautify its Slim, Eyes, Nose and other sliders.',
}

/**
 * What hosts can put on their camera (docs/features/camera-effects.md):
 * effects by category, makeup, green-screen backgrounds and the beauty rig -
 * files for the AR engine (DeepAR), downloaded by the app when first used.
 * Filters and skin smoothing are built into the app.
 */
export function CameraEffectsPage() {
  const search = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const tab: CameraEffectsTab = search.tab ?? 'effects'

  return (
    <>
      <PageHeader
        title="Camera effects"
        description="What hosts can put on their camera in the app: effects by category, makeup looks, green-screen backgrounds and the face-shape sliders. Published ones reach the app at once - no app update needed."
      />
      <Card flush>
        <div className="px-4 pt-3">
          <Tabs<CameraEffectsTab>
            label="Camera effects"
            value={tab}
            onChange={(next) => void navigate({ search: { tab: next === 'effects' ? undefined : next } })}
            tabs={[
              { value: 'effects', label: 'Effects' },
              { value: 'makeup', label: 'Makeup' },
              { value: 'backgrounds', label: 'Backgrounds' },
              { value: 'beauty', label: 'Beauty' },
              { value: 'categories', label: 'Categories' },
            ]}
          />
        </div>
        {tab === 'categories' ? <CategoriesPanel /> : <EffectList key={tab} kind={KIND_OF[tab]} />}
      </Card>
    </>
  )
}

function EffectList({ kind }: { kind: CameraEffectKind }) {
  const auth = useAuth()
  const canManage = auth.can('MANAGE_CAMERA_EFFECTS')
  const effects = useCameraEffects(kind)
  const categories = useCameraEffectCategories()
  const [category, setCategory] = useState('')
  const [editing, setEditing] = useState<CameraEffect | 'new' | null>(null)
  const [deleting, setDeleting] = useState<CameraEffect | null>(null)
  const publish = useAdminMutation(
    (effect: CameraEffect) => actions.updateCameraEffect(effect.id, { published: !effect.published }),
    { success: (effect) => (effect.published ? 'Published - hosts see it now.' : 'Unpublished - hosts no longer see it.') },
  )
  const remove = useAdminMutation((effect: CameraEffect) => actions.deleteCameraEffect(effect.id), {
    toastErrors: false,
    success: 'Deleted.',
  })

  const rows = (effects.data ?? []).filter((effect) => !category || effect.categoryId === category)
  const labels = KIND_LABELS[kind]

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 p-4">
        {kind === 'EFFECT' && (
          <Select
            aria-label="Category"
            className="w-full sm:w-52"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">Every category</option>
            {(categories.data ?? []).map((each) => (
              <option key={each.id} value={each.id}>
                {each.name}
              </option>
            ))}
          </Select>
        )}
        {kind === 'BEAUTY' && (
          <p className="text-[13px] text-zinc-500">Only one rig is published at a time - publishing one unpublishes the other.</p>
        )}
        {canManage && (
          <Button className="ml-auto" variant="primary" icon={<Plus />} onClick={() => setEditing('new')}>
            Add {labels.one.toLowerCase()}
          </Button>
        )}
      </div>

      {effects.isPending && (
        <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((each) => (
            <Skeleton key={each} className="aspect-square rounded-lg" />
          ))}
        </div>
      )}
      {effects.isError && <ErrorState error={effects.error} onRetry={() => void effects.refetch()} />}
      {effects.data && rows.length === 0 && <EmptyState icon={<Sparkles />} title={`No ${labels.many.toLowerCase()} yet`} description={EMPTY[kind]} />}
      {rows.length > 0 && (
        <ul className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
          {rows.map((effect) => (
            <li key={effect.id} className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
              <div className="relative aspect-square bg-zinc-100">
                {picture(effect) ? (
                  <img src={picture(effect)!} alt="" className="size-full object-cover" />
                ) : (
                  <div className="grid size-full place-items-center text-zinc-400">
                    <Sparkles className="size-8" />
                  </div>
                )}
                <div className="absolute top-2 left-2 flex flex-wrap gap-1">
                  {effect.published ? <Badge tone="success">Published</Badge> : <Badge>Draft</Badge>}
                  {effect.featured && <Badge tone="brand">Trending</Badge>}
                </div>
              </div>
              <div className="space-y-1 p-3">
                <p className="truncate text-[13px] font-medium text-zinc-900">{effect.name}</p>
                <p className="truncate text-xs text-zinc-500">
                  {kind === 'EFFECT' && (effect.category?.name ?? 'No category')}
                  {kind === 'MAKEUP' && AUDIENCE_LABELS[effect.audience]}
                  {kind === 'BEAUTY' && `${effect.controls?.length ?? 0} sliders`}
                  {kind === 'BACKGROUND' && 'Green screen'}
                  {' · '}
                  <RelativeTime value={effect.updatedAt} />
                </p>
                {canManage && (
                  <div className="flex gap-1 pt-1">
                    <Button size="sm" variant="ghost" icon={<Pencil />} onClick={() => setEditing(effect)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={effect.published ? <EyeOff /> : <Eye />}
                      loading={publish.isPending && publish.variables?.id === effect.id}
                      onClick={() => publish.mutate(effect)}
                    >
                      {effect.published ? 'Unpublish' : 'Publish'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto text-red-700"
                      aria-label={`Delete ${effect.name}`}
                      icon={<Trash2 />}
                      onClick={() => setDeleting(effect)}
                    />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {publish.isError && (
        <div className="px-4 pb-4">
          <Callout tone="danger">{publish.error instanceof Error ? publish.error.message : 'It could not be published.'}</Callout>
        </div>
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        size="lg"
        title={editing === 'new' ? `Add ${labels.one.toLowerCase()}` : `Edit ${editing?.name ?? ''}`}
      >
        {editing !== null && <EffectForm kind={kind} effect={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name ?? ''}?`}
        description="It's gone from the app at once, and its files from storage. Hosts using it lose it at their next live."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => remove.mutateAsync(deleting!)}
      />
    </div>
  )
}

function picture(effect: CameraEffect): string | null {
  const url = effect.thumbnailUrl ?? effect.imageUrl
  return url && /^https?:\/\//.test(url) ? url : null
}
