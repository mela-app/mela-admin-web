import { useNavigate } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { KeyRound, ShieldUser, UserPlus } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { AccessSummary } from '../../components/AccessSummary'
import { PersonLink } from '../../components/PersonLink'
import { RoleBadge, UserStatusBadge } from '../../components/StatusBadges'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { DataTable } from '../../components/ui/DataTable'
import { Dialog } from '../../components/ui/Dialog'
import { Callout, EmptyState } from '../../components/ui/feedback'
import { Field, Input } from '../../components/ui/forms'
import { CopyButton, PageHeader, RelativeTime } from '../../components/ui/misc'
import { useAuth } from '../../lib/auth-context'
import { ROLE_LABELS } from '../../lib/labels'
import { actions, useAdminMutation, useStaff } from '../../lib/queries'
import type { AdminPermission, StaffMember, StaffRole } from '../../lib/types'
import { AccessPicker } from './AccessPicker'

const STAFF_ROLE_DESCRIPTIONS: Record<StaffRole, string> = {
  PLATFORM_MODERATOR: 'Can see and do only what you choose below.',
  SUPER_ADMIN: 'Can do everything, including adding staff and choosing what each moderator can do.',
}

export function StaffPage() {
  const auth = useAuth()
  const staff = useStaff()
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)
  const [created, setCreated] = useState<{ email: string; name: string; password: string } | null>(null)
  const columns = useMemo(() => staffColumns(), [])
  const canOpen = auth.can('VIEW_USERS')

  return (
    <>
      <PageHeader
        title="Staff"
        description="Everyone who can sign in to this console. A super admin can do everything; a platform moderator can do only what a super admin gives them."
        actions={
          auth.isSuperAdmin && (
            <Button variant="primary" icon={<UserPlus />} onClick={() => setAdding(true)}>
              Add staff member
            </Button>
          )
        }
      />
      <div className="space-y-6">
        {auth.isSuperAdmin && (
          <Callout title="Choosing what moderators can do">
            A new platform moderator starts with no access. Pick what they can see and do when you add them, and change it
            any time from their account page. Changes apply from their next click.
          </Callout>
        )}
        <Card flush>
          <DataTable
            label="Staff"
            columns={columns}
            data={staff.data?.items}
            getRowId={(row) => row.id}
            loading={staff.isFetching}
            error={staff.error}
            onRetry={() => void staff.refetch()}
            onRowClick={canOpen ? (row) => void navigate({ to: '/users/$userId', params: { userId: row.id } }) : undefined}
            empty={<EmptyState icon={<ShieldUser />} title="No staff yet" />}
          />
        </Card>
      </div>

      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="Add a staff member"
        description="They get a one-time password to sign in with, and choose their own straight after."
        size="lg"
      >
        {adding && (
          <AddStaffForm
            onCancel={() => setAdding(false)}
            onCreated={(result) => {
              setAdding(false)
              setCreated(result)
            }}
          />
        )}
      </Dialog>
      <Dialog
        open={created !== null}
        onClose={() => setCreated(null)}
        title="Share the temporary password"
        size="md"
        footer={
          <Button variant="primary" onClick={() => setCreated(null)}>
            Done
          </Button>
        }
      >
        {created && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-700">
              {created.name} can now sign in at this console as <span className="font-medium">{created.email}</span> with:
            </p>
            <div className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3">
              <code className="font-mono text-base tracking-wide text-zinc-900 select-all">{created.password}</code>
              <CopyButton value={created.password} label="Copy password" />
            </div>
            <Callout tone="warning" title="Shown only once">
              Pass it on privately, not by email or chat in the clear. It stops working as soon as they choose their own password.
            </Callout>
          </div>
        )}
      </Dialog>
    </>
  )
}

function staffColumns(): Array<ColumnDef<StaffMember>> {
  return [
    { id: 'name', header: 'Name', cell: ({ row }) => <PersonLink person={row.original} /> },
    { id: 'email', header: 'Email', cell: ({ row }) => <span className="text-zinc-700">{row.original.email}</span> },
    { id: 'role', header: 'Role', cell: ({ row }) => <RoleBadge role={row.original.platformRole} /> },
    {
      id: 'access',
      header: 'Access',
      cell: ({ row }) => (
        <span className="block max-w-md whitespace-normal">
          <AccessSummary role={row.original.platformRole} permissions={row.original.permissions} />
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <UserStatusBadge status={row.original.status} />
          {row.original.passwordChangeRequired && (
            <Badge tone="warning" icon={<KeyRound />}>
              Temporary password
            </Badge>
          )}
        </span>
      ),
    },
    {
      id: 'lastLoginAt',
      header: 'Last sign-in',
      cell: ({ row }) => <RelativeTime value={row.original.lastLoginAt} className="whitespace-nowrap text-zinc-700" />,
    },
  ]
}

function AddStaffForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void
  onCreated: (result: { email: string; name: string; password: string }) => void
}) {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<StaffRole>('PLATFORM_MODERATOR')
  const [permissions, setPermissions] = useState<AdminPermission[]>([])
  const [error, setError] = useState<string | null>(null)
  const moderator = role === 'PLATFORM_MODERATOR'
  const create = useAdminMutation(
    () =>
      actions.createStaff({
        email: email.trim(),
        displayName: displayName.trim(),
        platformRole: role,
        permissions: moderator ? permissions : undefined,
      }),
    { toastErrors: false, success: 'Staff account created.' },
  )
  const ready =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    displayName.trim().length > 0 &&
    (!moderator || permissions.length > 0)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!ready) return
    setError(null)
    try {
      const result = await create.mutateAsync(undefined)
      onCreated({ email: result.user.email, name: result.user.displayName, password: result.temporaryPassword })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Something went wrong.')
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error && <Callout tone="danger">{error}</Callout>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Work email" required>
          <Input type="email" value={email} maxLength={254} autoComplete="off" onChange={(event) => setEmail(event.target.value)} />
        </Field>
        <Field label="Name" required>
          <Input value={displayName} maxLength={50} autoComplete="off" onChange={(event) => setDisplayName(event.target.value)} />
        </Field>
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-[13px] font-medium text-zinc-800">Role</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(['PLATFORM_MODERATOR', 'SUPER_ADMIN'] as const).map((option) => (
            <label
              key={option}
              className="flex cursor-pointer gap-3 rounded-md border border-zinc-200 p-3 has-checked:border-zinc-900 has-checked:bg-zinc-50"
            >
              <input
                type="radio"
                name="role"
                checked={role === option}
                onChange={() => setRole(option)}
                className="mt-0.5 accent-zinc-900"
              />
              <span>
                <span className="block text-sm font-medium text-zinc-900">{ROLE_LABELS[option]}</span>
                <span className="block text-xs text-zinc-500">{STAFF_ROLE_DESCRIPTIONS[option]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {moderator && (
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-zinc-800">
            What they can do <span className="text-red-600">*</span>
          </legend>
          <AccessPicker value={permissions} onChange={setPermissions} />
          <p className="mt-1.5 text-xs text-zinc-500">
            {permissions.length === 0 ? 'Give them access to at least one area.' : 'Manage includes view. Every action they take is recorded.'}
          </p>
        </fieldset>
      )}
      <div className="-mx-5 -mb-4 flex justify-end gap-2 border-t border-zinc-200 bg-zinc-50/60 px-5 py-3">
        <Button onClick={onCancel} disabled={create.isPending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={create.isPending} disabled={!ready}>
          Create account
        </Button>
      </div>
    </form>
  )
}
