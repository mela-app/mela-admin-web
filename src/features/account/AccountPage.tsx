import { Laptop, Smartphone } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { AccessSummary } from '../../components/AccessSummary'
import { RoleBadge } from '../../components/StatusBadges'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Callout, ErrorState, Skeleton } from '../../components/ui/feedback'
import { Field, Input } from '../../components/ui/forms'
import { Avatar, PageHeader, RelativeTime } from '../../components/ui/misc'
import { useAuth } from '../../lib/auth-context'
import { formatDateTime } from '../../lib/format'
import { PLATFORM_LABELS } from '../../lib/labels'
import { actions, useAdminMutation, useMySessions } from '../../lib/queries'
import { useToast } from '../../lib/toast-context'
import type { AdminView } from '../../lib/types'
import { PasswordForm } from './PasswordForm'

export function AccountPage() {
  const auth = useAuth()
  const admin = auth.admin
  if (!admin) return null
  return (
    <>
      <PageHeader
        title="Account"
        description="Your own sign-in details. Changes here are recorded in the audit log."
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <ProfileCard admin={admin} onSaved={auth.update} />
          <Card
            title="What you can do"
            description={
              admin.platformRole === 'SUPER_ADMIN'
                ? undefined
                : 'Chosen by a super admin. Ask one if you need more.'
            }
          >
            <AccessSummary role={admin.platformRole} permissions={admin.permissions} detailed />
          </Card>
          <EmailCard admin={admin} onSaved={auth.update} />
        </div>
        <div className="space-y-6">
          <PasswordCard admin={admin} onSaved={auth.update} />
          <SessionsCard />
        </div>
      </div>
    </>
  )
}

function ProfileCard({ admin, onSaved }: { admin: AdminView; onSaved: (admin: AdminView) => void }) {
  const toast = useToast()
  const [name, setName] = useState(admin.displayName)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const changed = name.trim() !== admin.displayName && name.trim().length > 0

  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      onSaved(await actions.updateMe(name.trim()))
      toast.success('Profile saved.')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Something went wrong.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Card title="Profile" description="How you appear to other staff and in the audit log.">
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar name={admin.displayName} url={admin.avatarUrl} size="lg" />
          <div className="min-w-0">
            <p className="truncate font-medium text-zinc-900">{admin.displayName}</p>
            <p className="truncate text-[13px] text-zinc-500">@{admin.username}</p>
            <div className="mt-1">
              <RoleBadge role={admin.platformRole} />
            </div>
          </div>
        </div>
        {error && <Callout tone="danger">{error}</Callout>}
        <Field label="Display name" required>
          <Input value={name} maxLength={50} onChange={(event) => setName(event.target.value)} />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={pending} disabled={!changed}>
            Save
          </Button>
        </div>
      </form>
    </Card>
  )
}

function EmailCard({ admin, onSaved }: { admin: AdminView; onSaved: (admin: AdminView) => void }) {
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      onSaved(await actions.changeEmail(email.trim(), password))
      setEmail('')
      setPassword('')
      toast.success('Email changed. Use the new address next time you sign in.')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Something went wrong.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Card title="Email" description={<>You sign in with <span className="font-medium text-zinc-700">{admin.email}</span>.</>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Callout tone="danger">{error}</Callout>}
        <Field label="New email address" required>
          <Input
            type="email"
            autoComplete="email"
            value={email}
            maxLength={254}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field label="Current password" hint="Confirms it's you." required>
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={pending} disabled={!valid || !password}>
            Change email
          </Button>
        </div>
      </form>
    </Card>
  )
}

function PasswordCard({ admin, onSaved }: { admin: AdminView; onSaved: (admin: AdminView) => void }) {
  const toast = useToast()
  return (
    <Card title="Password" description="Changing it signs you out everywhere else.">
      <PasswordForm
        email={admin.email}
        onChanged={(updated) => {
          onSaved(updated)
          toast.success('Password changed. Your other sessions were signed out.')
        }}
      />
    </Card>
  )
}

function SessionsCard() {
  const sessions = useMySessions()
  const revoke = useAdminMutation((sessionId: string) => actions.revokeMySession(sessionId), {
    success: 'Signed out of that device.',
  })

  return (
    <Card title="Where you're signed in" description="The app and the console, on every device." flush>
      {sessions.isPending && (
        <div className="space-y-3 p-5">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      )}
      {sessions.isError && <ErrorState error={sessions.error} onRetry={() => void sessions.refetch()} />}
      {sessions.data && (
        <ul className="divide-y divide-zinc-100">
          {sessions.data.items.map((session) => {
            const Icon = session.platform === 'WEB' ? Laptop : Smartphone
            return (
              <li key={session.id} className="flex items-center gap-3 px-5 py-3">
                <Icon className="size-4 shrink-0 text-zinc-400" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                    {PLATFORM_LABELS[session.platform]}
                    {session.current && <Badge tone="success">This session</Badge>}
                  </p>
                  <p className="text-xs text-zinc-500">
                    Signed in {formatDateTime(session.createdAt)} · active <RelativeTime value={session.lastSeenAt} />
                  </p>
                </div>
                {!session.current && (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={revoke.isPending && revoke.variables === session.id}
                    onClick={() => revoke.mutate(session.id)}
                  >
                    Sign out
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
