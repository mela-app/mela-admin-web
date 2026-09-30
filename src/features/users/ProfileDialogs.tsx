import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Callout } from '../../components/ui/feedback'
import { Checkbox, Field, Input, Textarea } from '../../components/ui/forms'
import { Avatar } from '../../components/ui/misc'
import { ROLE_LABELS } from '../../lib/labels'
import { sameAccess } from '../../lib/permissions'
import { actions, useAdminMutation } from '../../lib/queries'
import type { AdminPermission, PlatformRole, UserDetail } from '../../lib/types'
import { AccessPicker } from '../staff/AccessPicker'

interface Props {
  user: UserDetail
  open: boolean
  onClose: () => void
}

/** Fixes an offensive username, name, bio or picture. The audit entry keeps what it said before. */
export function EditProfileDialog({ user, open, onClose }: Props) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Edit profile"
      description="For names, bios or pictures that break the rules. The person isn't told who changed it."
    >
      <EditProfileForm user={user} onDone={onClose} />
    </Dialog>
  )
}

function EditProfileForm({ user, onDone }: { user: UserDetail; onDone: () => void }) {
  const [username, setUsername] = useState(user.username)
  const [displayName, setDisplayName] = useState(user.displayName)
  const [bio, setBio] = useState(user.bio ?? '')
  const [removeAvatar, setRemoveAvatar] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const save = useAdminMutation((body: Parameters<typeof actions.editProfile>[1]) => actions.editProfile(user.id, body), {
    toastErrors: false,
    success: 'Profile updated.',
  })

  const changes = {
    ...(username.trim() !== user.username ? { username: username.trim() } : {}),
    ...(displayName.trim() !== user.displayName ? { displayName: displayName.trim() } : {}),
    ...(bio.trim() !== (user.bio ?? '') ? { bio: bio.trim() } : {}),
    ...(removeAvatar ? { removeAvatar: true } : {}),
  }
  const changed = Object.keys(changes).length > 0
  const usernameValid = /^[a-zA-Z0-9_]{3,24}$/.test(username.trim())
  const ready = changed && usernameValid && displayName.trim().length > 0 && reason.trim().length >= 3

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!ready) return
    setError(null)
    try {
      await save.mutateAsync({ ...changes, reason: reason.trim() })
      onDone()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Something went wrong.')
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error && <Callout tone="danger">{error}</Callout>}
      <Field
        label="Username"
        hint="3 to 24 letters, numbers or underscores."
        error={!usernameValid && username.length > 0 ? 'Use 3 to 24 letters, numbers or underscores.' : null}
      >
        <Input value={username} maxLength={24} onChange={(event) => setUsername(event.target.value)} />
      </Field>
      <Field label="Display name">
        <Input value={displayName} maxLength={50} onChange={(event) => setDisplayName(event.target.value)} />
      </Field>
      <Field label="Bio" hint="Leave empty to remove it.">
        <Textarea value={bio} maxLength={280} onChange={(event) => setBio(event.target.value)} />
      </Field>
      {user.avatarUrl && (
        <div className="flex items-center gap-3 rounded-md border border-zinc-200 p-3">
          <Avatar name={user.displayName} url={user.avatarUrl} size="lg" />
          <Checkbox
            label="Remove profile picture"
            description="They can upload a new one."
            checked={removeAvatar}
            onChange={(event) => setRemoveAvatar(event.target.checked)}
          />
        </div>
      )}
      <Field label="Reason" hint="Kept in the audit log with the old values." required>
        <Textarea
          value={reason}
          rows={2}
          maxLength={300}
          placeholder="e.g. Username impersonated a staff member"
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
      <div className="-mx-5 -mb-4 flex justify-end gap-2 border-t border-zinc-200 bg-zinc-50/60 px-5 py-3">
        <Button onClick={onDone} disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={save.isPending} disabled={!ready}>
          Save changes
        </Button>
      </div>
    </form>
  )
}

const ROLE_DESCRIPTIONS: Record<PlatformRole, string> = {
  USER: 'Uses the app. No access to this console.',
  PLATFORM_MODERATOR: 'Can see and do only what you choose.',
  SUPER_ADMIN: 'Can do everything, including adding staff and choosing what each moderator can do.',
}

export function ChangeRoleDialog({ user, open, onClose }: Props) {
  return (
    <Dialog open={open} onClose={onClose} title={`Change @${user.username}'s role`} size="lg">
      <ChangeRoleForm user={user} onDone={onClose} />
    </Dialog>
  )
}

function ChangeRoleForm({ user, onDone }: { user: UserDetail; onDone: () => void }) {
  const [role, setRole] = useState<PlatformRole>(user.platformRole)
  const [permissions, setPermissions] = useState<AdminPermission[]>([])
  const [error, setError] = useState<string | null>(null)
  const becomesModerator = role === 'PLATFORM_MODERATOR' && user.platformRole !== 'PLATFORM_MODERATOR'
  const change = useAdminMutation(
    (next: PlatformRole) => actions.changeRole(user.id, next, next === 'PLATFORM_MODERATOR' ? permissions : undefined),
    {
      toastErrors: false,
      success: (_, next) => `Role changed to ${ROLE_LABELS[next].toLowerCase()}.`,
    },
  )

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      await change.mutateAsync(role)
      onDone()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Something went wrong.')
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Callout tone="danger">{error}</Callout>}
      <fieldset className="space-y-2">
        <legend className="sr-only">Role</legend>
        {(Object.keys(ROLE_LABELS) as PlatformRole[]).map((option) => (
          <label
            key={option}
            className="flex cursor-pointer gap-3 rounded-md border border-zinc-200 p-3 has-checked:border-zinc-900 has-checked:bg-zinc-50"
          >
            <input
              type="radio"
              name="role"
              value={option}
              checked={role === option}
              onChange={() => setRole(option)}
              className="mt-0.5 accent-zinc-900"
            />
            <span>
              <span className="block text-sm font-medium text-zinc-900">{ROLE_LABELS[option]}</span>
              <span className="block text-xs text-zinc-500">{ROLE_DESCRIPTIONS[option]}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {role !== 'USER' && user.platformRole === 'USER' && (
        <Callout tone="warning">
          They'll be able to sign in to this console with their app password, and every action they take is recorded.
        </Callout>
      )}
      {becomesModerator && (
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-zinc-800">
            What they can do <span className="text-red-600">*</span>
          </legend>
          <AccessPicker value={permissions} onChange={setPermissions} />
          {permissions.length === 0 && (
            <p className="mt-1.5 text-xs text-zinc-500">Give them access to at least one area.</p>
          )}
        </fieldset>
      )}
      <div className="-mx-5 -mb-4 flex justify-end gap-2 border-t border-zinc-200 bg-zinc-50/60 px-5 py-3">
        <Button onClick={onDone} disabled={change.isPending}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          loading={change.isPending}
          disabled={role === user.platformRole || (becomesModerator && permissions.length === 0)}
        >
          Change role
        </Button>
      </div>
    </form>
  )
}

/** What a platform moderator can see and do; a super admin chooses. */
export function EditAccessDialog({ user, open, onClose }: Props) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`What @${user.username} can do`}
      description="Changes apply from their next click, and are recorded in the audit log."
      size="lg"
    >
      <EditAccessForm user={user} onDone={onClose} />
    </Dialog>
  )
}

function EditAccessForm({ user, onDone }: { user: UserDetail; onDone: () => void }) {
  const [permissions, setPermissions] = useState<AdminPermission[]>(user.permissions)
  const [error, setError] = useState<string | null>(null)
  const save = useAdminMutation(() => actions.changePermissions(user.id, permissions), {
    toastErrors: false,
    success: 'Access updated.',
  })
  const unchanged = sameAccess(permissions, user.permissions)

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
      <AccessPicker value={permissions} onChange={setPermissions} />
      {permissions.length === 0 && (
        <p className="text-xs text-zinc-500">
          Give them access to at least one area. To take all access away, change their role to User instead.
        </p>
      )}
      <div className="-mx-5 -mb-4 flex justify-end gap-2 border-t border-zinc-200 bg-zinc-50/60 px-5 py-3">
        <Button onClick={onDone} disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={save.isPending} disabled={unchanged || permissions.length === 0}>
          Save access
        </Button>
      </div>
    </form>
  )
}
