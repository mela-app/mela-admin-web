import { getRouteApi, Link } from '@tanstack/react-router'
import { Ban, LogOut, MessagesSquare, Pencil, Radio, ShieldCheck, UserCheck } from 'lucide-react'
import { useState } from 'react'
import type { UserTab } from '../../app/search'
import { AccessSummary } from '../../components/AccessSummary'
import { RoleBadge, UserStatusBadge } from '../../components/StatusBadges'
import { Badge } from '../../components/ui/Badge'
import { buttonClasses } from '../../components/ui/button-styles'
import { Button } from '../../components/ui/Button'
import { Card, DescriptionList } from '../../components/ui/Card'
import { Callout, EmptyState, ErrorState, Skeleton } from '../../components/ui/feedback'
import { Avatar, Identifier, PageHeader, RelativeTime, Tabs } from '../../components/ui/misc'
import { useAuth } from '../../lib/auth-context'
import { formatDate, formatDateTime, formatNumber } from '../../lib/format'
import { PLATFORM_LABELS } from '../../lib/labels'
import { useUser, useUserSessions } from '../../lib/queries'
import type { UserDetail } from '../../lib/types'
import { ScopedAuditTable } from '../audit/AuditTable'
import { HostStreamsTable } from '../streams/StreamsTable'
import { ChangeRoleDialog, EditAccessDialog, EditProfileDialog } from './ProfileDialogs'
import { ReinstateUserDialog, SignOutEverywhereDialog, SuspendUserDialog } from './UserActionDialogs'

const routeApi = getRouteApi('/_app/users/$userId')

type DialogName = 'suspend' | 'reinstate' | 'sign-out' | 'edit' | 'role' | 'access'

export function UserDetailPage() {
  const { userId } = routeApi.useParams()
  const user = useUser(userId)
  if (user.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-80" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    )
  }
  if (user.isError) {
    return (
      <Card>
        <ErrorState error={user.error} onRetry={() => void user.refetch()} />
      </Card>
    )
  }
  return <UserView user={user.data} />
}

function UserView({ user }: { user: UserDetail }) {
  const auth = useAuth()
  const search = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const [dialog, setDialog] = useState<DialogName | null>(null)

  const self = auth.admin?.id === user.id
  const staffTarget = user.platformRole !== 'USER'
  // Staff accounts are for super admins to manage; nobody manages their own here.
  const canManage = !self && (!staffTarget || auth.isSuperAdmin) && auth.can('MANAGE_USERS')
  const suspended = user.status === 'SUSPENDED'
  const close = () => setDialog(null)
  const tabs = (
    [
      { value: 'activity', label: 'Activity', shown: auth.can('VIEW_AUDIT_LOG') },
      { value: 'lives', label: 'Lives', count: user.counts.streams, shown: auth.can('VIEW_LIVES') },
      { value: 'sessions', label: 'Devices', count: user.counts.sessions, shown: true },
    ] satisfies Array<{ value: UserTab; label: string; count?: number; shown: boolean }>
  ).filter((each) => each.shown)
  const tab = tabs.find((each) => each.value === (search.tab ?? 'activity'))?.value ?? tabs[0].value

  return (
    <>
      <PageHeader
        breadcrumbs={
          <>
            <Link to="/users" className="hover:text-zinc-900">
              Users
            </Link>
            <span className="mx-1.5 text-zinc-300">/</span>
            <span className="text-zinc-700">@{user.username}</span>
          </>
        }
        title={
          <span className="flex items-center gap-3">
            <Avatar name={user.displayName} url={user.avatarUrl} size="lg" />
            <span className="min-w-0">
              <span className="block truncate">{user.displayName}</span>
              <span className="block text-sm font-normal text-zinc-500">@{user.username}</span>
            </span>
          </span>
        }
        meta={
          <>
            <UserStatusBadge status={user.status} />
            <RoleBadge role={user.platformRole} />
            {user.liveStream && (
              <Badge tone="danger" dot>
                Live now
              </Badge>
            )}
            <span className="text-[13px] text-zinc-500">
              Joined {formatDate(user.createdAt)} · last signed in <RelativeTime value={user.lastLoginAt} />
            </span>
          </>
        }
        actions={
          <>
            {user.liveStream && auth.can('VIEW_LIVES') && (
              <Link to="/streams/$streamId" params={{ streamId: user.liveStream.id }} className={buttonClasses('secondary')}>
                <Radio /> Open live
              </Link>
            )}
            {auth.can('VIEW_PRIVATE_MESSAGES') && (
              <Link to="/messages" search={{ userId: user.id }} className={buttonClasses('secondary')}>
                <MessagesSquare /> Private messages
              </Link>
            )}
            {!self && auth.isSuperAdmin && (
              <Button icon={<ShieldCheck />} onClick={() => setDialog('role')}>
                Change role
              </Button>
            )}
            {canManage && (
              <>
                <Button icon={<Pencil />} onClick={() => setDialog('edit')}>
                  Edit profile
                </Button>
                <Button icon={<LogOut />} onClick={() => setDialog('sign-out')}>
                  Sign out everywhere
                </Button>
                {suspended ? (
                  <Button variant="primary" icon={<UserCheck />} onClick={() => setDialog('reinstate')}>
                    Reinstate
                  </Button>
                ) : (
                  <Button variant="danger" icon={<Ban />} onClick={() => setDialog('suspend')}>
                    Suspend
                  </Button>
                )}
              </>
            )}
          </>
        }
      />

      <div className="mb-6 space-y-3 empty:hidden">
        {suspended && (
          <Callout tone="danger" title={`Suspended ${user.suspendedAt ? formatDateTime(user.suspendedAt) : ''}`}>
            Reason: {user.suspensionReason ?? 'Not recorded'}
          </Callout>
        )}
        {self && (
          <Callout title="This is your account">
            Change your own details on the <Link to="/account" className="font-medium underline">account page</Link>.
          </Callout>
        )}
        {!self && staffTarget && !auth.isSuperAdmin && (
          <Callout title="Staff account">Only a super admin can change or suspend a staff account.</Callout>
        )}
        {staffTarget && user.passwordChangeRequired && (
          <Callout tone="warning" title="Temporary password">
            This staff member hasn't signed in and chosen their own password yet.
          </Callout>
        )}
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Card flush>
          <div className="px-4 pt-3">
            <Tabs<UserTab>
              label="Account records"
              value={tab}
              onChange={(next) => void navigate({ search: { tab: next === 'activity' ? undefined : next }, replace: true })}
              tabs={tabs}
            />
          </div>
          {tab === 'activity' && (
            <ScopedAuditTable filter={{ userId: user.id }} emptyText="Nothing has been recorded for this account yet." />
          )}
          {tab === 'lives' && <HostStreamsTable hostId={user.id} />}
          {tab === 'sessions' && <SessionsPanel userId={user.id} />}
        </Card>

        <div className="space-y-6">
          {staffTarget && (
            <Card
              title="Console access"
              actions={
                auth.isSuperAdmin &&
                !self &&
                user.platformRole === 'PLATFORM_MODERATOR' && (
                  <Button size="sm" icon={<Pencil />} onClick={() => setDialog('access')}>
                    Edit
                  </Button>
                )
              }
            >
              <AccessSummary role={user.platformRole} permissions={user.permissions} detailed />
            </Card>
          )}
          <Card title="Profile">
            <DescriptionList
              items={[
                { label: 'Email', value: user.email },
                { label: 'Account ID', value: <Identifier value={user.id} /> },
                {
                  label: 'Bio',
                  value: user.bio ? <span className="whitespace-pre-wrap">{user.bio}</span> : <span className="text-zinc-400">None</span>,
                },
                { label: 'Joined', value: formatDateTime(user.createdAt) },
                { label: 'Last sign-in', value: formatDateTime(user.lastLoginAt) },
              ]}
            />
          </Card>
          <Card title="In numbers">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              {[
                ['Followers', user.counts.followers],
                ['Following', user.counts.following],
                ['Lives', user.counts.streams],
                ['Chat messages', user.counts.messages],
                ['Blocked by', user.counts.blockedBy],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-zinc-500">{label}</dt>
                  <dd className="text-sm font-medium text-zinc-900 tabular-nums">{formatNumber(Number(value))}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </div>

      <SuspendUserDialog user={dialog === 'suspend' ? user : null} onClose={close} />
      <ReinstateUserDialog user={dialog === 'reinstate' ? user : null} onClose={close} />
      <SignOutEverywhereDialog user={dialog === 'sign-out' ? user : null} onClose={close} />
      <EditProfileDialog user={user} open={dialog === 'edit'} onClose={close} />
      <ChangeRoleDialog user={user} open={dialog === 'role'} onClose={close} />
      <EditAccessDialog user={user} open={dialog === 'access'} onClose={close} />
    </>
  )
}

function SessionsPanel({ userId }: { userId: string }) {
  const sessions = useUserSessions(userId, true)
  if (sessions.isPending) {
    return (
      <div className="space-y-3 p-5">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
      </div>
    )
  }
  if (sessions.isError) return <ErrorState error={sessions.error} onRetry={() => void sessions.refetch()} />
  if (sessions.data.items.length === 0) {
    return <EmptyState title="Not signed in anywhere" description="They'll appear here after their next sign-in." />
  }
  return (
    <ul className="divide-y divide-zinc-100">
      {sessions.data.items.map((session) => (
        <li key={session.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
          <span className="font-medium text-zinc-900">{PLATFORM_LABELS[session.platform]}</span>
          <span className="text-[13px] text-zinc-500">
            Signed in {formatDateTime(session.createdAt)} · active <RelativeTime value={session.lastSeenAt} />
          </span>
        </li>
      ))}
    </ul>
  )
}
