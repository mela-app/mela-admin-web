import { Pencil, Plus, Tags, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog'
import { Callout, EmptyState, ErrorState, Skeleton } from '../../components/ui/feedback'
import { Field, Input } from '../../components/ui/forms'
import { useAuth } from '../../lib/auth-context'
import { formatNumber } from '../../lib/format'
import { actions, useAdminMutation, useCameraEffectCategories } from '../../lib/queries'
import type { CameraEffectCategory } from '../../lib/types'

/**
 * The tabs of the app's Effects panel, after Trending and New - Sports,
 * Funny, Love... A category shows in the app once it has a published effect.
 */
export function CategoriesPanel() {
  const auth = useAuth()
  const canManage = auth.can('MANAGE_CAMERA_EFFECTS')
  const categories = useCameraEffectCategories()
  const [editing, setEditing] = useState<CameraEffectCategory | 'new' | null>(null)
  const [deleting, setDeleting] = useState<CameraEffectCategory | null>(null)
  const remove = useAdminMutation((category: CameraEffectCategory) => actions.deleteCameraEffectCategory(category.id), {
    toastErrors: false,
    success: 'Category deleted.',
  })

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-zinc-200 p-4">
        <p className="text-[13px] text-zinc-500">
          Trending and New come first in the app by themselves; these follow, in this order.
        </p>
        {canManage && (
          <Button className="ml-auto" variant="primary" icon={<Plus />} onClick={() => setEditing('new')}>
            Add category
          </Button>
        )}
      </div>
      {categories.isPending && (
        <div className="space-y-3 p-5">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-1/4" />
        </div>
      )}
      {categories.isError && <ErrorState error={categories.error} onRetry={() => void categories.refetch()} />}
      {categories.data?.length === 0 && (
        <EmptyState icon={<Tags />} title="No categories yet" description="Add Sports, Funny, Love - whatever fits Mela's hosts." />
      )}
      <ul className="divide-y divide-zinc-100">
        {(categories.data ?? []).map((category) => (
          <li key={category.id} className="flex items-center gap-3 px-5 py-3">
            <span className="w-10 text-xs text-zinc-400 tabular-nums">{category.sortOrder}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-zinc-900">{category.name}</span>
              <span className="block text-xs text-zinc-500">
                {formatNumber(category.effectCount)} {category.effectCount === 1 ? 'effect' : 'effects'}
              </span>
            </span>
            {canManage && (
              <>
                <Button size="sm" variant="ghost" icon={<Pencil />} onClick={() => setEditing(category)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-700"
                  icon={<Trash2 />}
                  aria-label={`Delete ${category.name}`}
                  onClick={() => setDeleting(category)}
                />
              </>
            )}
          </li>
        ))}
      </ul>

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Add category' : 'Edit category'}
      >
        {editing !== null && <CategoryForm category={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name ?? ''}?`}
        description="Only an empty category can go - move or delete its effects first."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => remove.mutateAsync(deleting!)}
      />
    </div>
  )
}

function CategoryForm({ category, onClose }: { category: CameraEffectCategory | null; onClose: () => void }) {
  const [name, setName] = useState(category?.name ?? '')
  const [sortOrder, setSortOrder] = useState(String(category?.sortOrder ?? 0))
  const [error, setError] = useState<string | null>(null)
  const save = useAdminMutation(
    (body: { name: string; sortOrder: number }) => actions.saveCameraEffectCategory(category?.id ?? null, body),
    { toastErrors: false, success: 'Saved.' },
  )

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return setError('Give it a name.')
    setError(null)
    try {
      await save.mutateAsync({ name: name.trim(), sortOrder: Number.parseInt(sortOrder, 10) || 0 })
      onClose()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Something went wrong. Try again.')
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Name" hint="The tab's name in the app." required>
        <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={24} data-autofocus />
      </Field>
      <Field label="Order" hint="Lower comes first.">
        <Input type="number" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} />
      </Field>
      {error && <Callout tone="danger">{error}</Callout>}
      <div className="-mx-5 -mb-4 flex justify-end gap-2 border-t border-zinc-200 bg-zinc-50/60 px-5 py-3">
        <Button onClick={onClose} disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={save.isPending}>
          Save
        </Button>
      </div>
    </form>
  )
}
