import { liveName } from '../../lib/live-name'
import { getRouteApi, Link } from '@tanstack/react-router'
import { Lock, LockOpen, Megaphone, MessageSquareText } from 'lucide-react'
import { useState } from 'react'
import type { StreamTab } from '../../app/search'
import { PersonLink } from '../../components/PersonLink'
import { StreamStatusBadge } from '../../components/StatusBadges'
import { Badge } from '../../components/ui/Badge'
import { buttonClasses } from '../../components/ui/button-styles'
import { Button } from '../../components/ui/Button'
import { Card, DescriptionList, Stat } from '../../components/ui/Card'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { Callout, EmptyState, ErrorState, Skeleton } from '../../components/ui/feedback'
import { Identifier, PageHeader, RelativeTime, Tabs } from '../../components/ui/misc'
import { useAuth } from '../../lib/auth-context'
import { formatDateTime, formatDuration, formatNumber, localDay } from '../../lib/format'
import { CAPABILITY_LABELS, END_REASON_LABELS, LAYOUT_LABELS, PROVIDER_LABELS } from '../../lib/labels'
import { actions, useAdminMutation, useHostingInForce, useStream } from '../../lib/queries'
import type { StreamDetail } from '../../lib/types'
import { ScopedAuditTable } from '../audit/AuditTable'
import { HostHostingCard, HostingBadge } from '../hosting/HostingStatus'
import { LiveHostingPanel } from '../hosting/LiveHostingPanel'
import { ChatLog } from './ChatLog'

const routeApi = getRouteApi('/_app/streams/$streamId')

export function StreamDetailPage() {
  const { streamId } = routeApi.useParams()
  const stream = useStream(streamId)

  if (stream.isPending) return <DetailSkeleton />
  if (stream.isError) {
    return (
      <Card>
        <ErrorState error={stream.error} onRetry={() => void stream.refetch()} />
      </Card>
    )
  }
  return <StreamView stream={stream.data} />
}

function StreamView({ stream }: { stream: StreamDetail }) {
  const auth = useAuth()
  const search = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const [confirm, setConfirm] = useState<'lock' | 'unlock' | null>(null)
  const lock = useAdminMutation((reason: string) => actions.lockStream(stream.id, reason), {
    toastErrors: false,
    success: 'Live locked. Everyone watching was told why.',
  })
  const unlock = useAdminMutation(() => actions.unlockStream(stream.id), {
    toastErrors: false,
    success: 'Lock cleared. The live stays over.',
  })
  const live = stream.status === 'LIVE'
  const canManage = auth.can('MANAGE_LIVES')
  const hosting = useHostingInForce([stream.host.id], auth.can('VIEW_HOSTING_RESTRICTIONS')).get(stream.host.id)
  const tabs = (
    [
      { value: 'chat', label: 'Chat log', shown: true },
      { value: 'people', label: 'Guests and moderators', shown: true },
      { value: 'hosting', label: 'Hosting', shown: auth.can('VIEW_HOSTING_RESTRICTIONS') },
      { value: 'activity', label: 'Activity', shown: auth.can('VIEW_AUDIT_LOG') },
    ] satisfies Array<{ value: StreamTab; label: string; shown: boolean }>
  ).filter((each) => each.shown)
  const tab = tabs.find((each) => each.value === (search.tab ?? 'chat'))?.value ?? 'chat'

  return (
    <>
      <PageHeader
        breadcrumbs={
          <>
            <Link to="/streams" className="hover:text-zinc-900">
              Lives
            </Link>
            <span className="mx-1.5 text-zinc-300">/</span>
            <span className="text-zinc-700">{liveName(stream)}</span>
          </>
        }
        title={liveName(stream)}
        meta={
          <>
            <StreamStatusBadge status={stream.status} />
            {stream.paused && live && <Badge tone="neutral">Paused by host</Badge>}
            <span className="text-[13px] text-zinc-500">
              {stream.category ? `${stream.category} · ` : ''}started {formatDateTime(stream.startedAt)}
            </span>
          </>
        }
        actions={
          <>
            <Link
              to="/chat"
              search={{ host: stream.host.id, day: localDay(stream.startedAt) === localDay() ? undefined : localDay(stream.startedAt) }}
              className={buttonClasses('primary')}
            >
              <MessageSquareText /> Inspect in Live chat
            </Link>
            {live && auth.can('SEND_ALERTS') && (
              <Link to="/alerts" search={{ streamId: stream.id }} className={buttonClasses('secondary')}>
                <Megaphone /> Send alert
              </Link>
            )}
            {live && canManage && (
              <Button variant="danger" icon={<Lock />} onClick={() => setConfirm('lock')}>
                Lock live
              </Button>
            )}
            {stream.status === 'LOCKED' && canManage && (
              <Button icon={<LockOpen />} onClick={() => setConfirm('unlock')}>
                Clear lock
              </Button>
            )}
          </>
        }
      />

      {hosting && (
        <Callout
          tone="warning"
          className="mb-6"
          title={
            <span className="inline-flex flex-wrap items-center gap-2">
              The host's hosting is paused <HostingBadge appealState={hosting.appealState} />
            </span>
          }
          action={
            tab !== 'hosting' && hosting.streamId === stream.id ? (
              <Button size="sm" onClick={() => void navigate({ search: { tab: 'hosting' }, replace: true })}>
                Open
              </Button>
            ) : undefined
          }
        >
          “{hosting.title}” · since {formatDateTime(hosting.createdAt)} ·{' '}
          {hosting.endsAt ? `until ${formatDateTime(hosting.endsAt)}` : 'until lifted'}
          {hosting.streamId !== stream.id && ' · about another of their lives'}
        </Callout>
      )}

      {stream.status === 'LOCKED' && (
        <Callout tone="warning" className="mb-6" title={`Locked ${stream.lockedAt ? formatDateTime(stream.lockedAt) : ''}`}>
          {stream.lockedBy ? <>By @{stream.lockedBy.username}. </> : null}
          Reason given to viewers: “{stream.lockedReason ?? 'None'}”
        </Callout>
      )}

      <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 sm:grid-cols-3 xl:grid-cols-5">
        {[
          { label: live ? 'Watching now' : 'Peak viewers', value: formatNumber(live ? stream.viewerCount ?? 0 : stream.peakViewerCount) },
          { label: 'Likes', value: formatNumber(stream.likeCount) },
          { label: live ? 'Running for' : 'Lasted', value: formatDuration(stream.startedAt, stream.endedAt) },
          { label: 'Chat messages', value: formatNumber(stream.counts.messages), hint: `${formatNumber(stream.counts.removedMessages)} removed` },
          { label: 'Bans issued', value: formatNumber(stream.counts.roomBans) },
        ].map((item) => (
          <div key={item.label} className="bg-white px-5 py-4 first:col-span-2 xl:first:col-span-1">
            <Stat label={item.label} value={item.value} hint={item.hint} />
          </div>
        ))}
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Card flush>
          <div className="px-4 pt-3">
            <Tabs<StreamTab>
              label="About this live"
              value={tab}
              onChange={(next) => void navigate({ search: { tab: next === 'chat' ? undefined : next }, replace: true })}
              tabs={tabs}
            />
          </div>
          {tab === 'chat' && <ChatLog streamId={stream.id} hostId={stream.host.id} live={live} />}
          {tab === 'people' && <PeoplePanel stream={stream} />}
          {tab === 'hosting' && <LiveHostingPanel stream={stream} />}
          {tab === 'activity' && (
            <ScopedAuditTable filter={{ streamId: stream.id }} emptyText="Nothing has been recorded for this live yet." />
          )}
        </Card>

        <div className="space-y-6">
          <Card title="Host">
            <PersonLink person={stream.host} />
            <HostHostingCard
              key={stream.host.id}
              host={stream.host}
              lives={[{ id: stream.id, title: stream.title, startedAt: stream.startedAt }]}
              className="mt-5"
            />
          </Card>
          <Card title="Details">
            <DescriptionList
              items={[
                { label: 'Live ID', value: <Identifier value={stream.id} /> },
                { label: 'Started', value: formatDateTime(stream.startedAt) },
                { label: 'Ended', value: formatDateTime(stream.endedAt), hidden: !stream.endedAt },
                { label: 'How it ended', value: stream.endedReason ? END_REASON_LABELS[stream.endedReason] : '—', hidden: live },
                { label: 'Layout', value: LAYOUT_LABELS[stream.layout] },
                { label: 'Video', value: `${PROVIDER_LABELS[stream.videoProvider]} · ${stream.channelName}` },
              ]}
            />
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirm === 'lock'}
        onClose={() => setConfirm(null)}
        title="Lock this live?"
        description="It stops at once for everyone: the host and guests stop broadcasting, and viewers see that an administrator stopped it, with your reason. The host's account isn't affected; suspend it separately if needed."
        confirmLabel="Lock live"
        tone="danger"
        reason={{
          label: 'Reason shown to viewers',
          placeholder: 'e.g. This live broke the community rules on violent content.',
          required: true,
          minLength: 3,
          maxLength: 300,
        }}
        onConfirm={(reason) => lock.mutateAsync(reason)}
      />
      <ConfirmDialog
        open={confirm === 'unlock'}
        onClose={() => setConfirm(null)}
        title="Clear the lock?"
        description="Use this after review. The live stays over; this only marks the lock as cleared, and it's recorded in the audit log."
        confirmLabel="Clear lock"
        onConfirm={() => unlock.mutateAsync(undefined)}
      />
    </>
  )
}

function PeoplePanel({ stream }: { stream: StreamDetail }) {
  return (
    <div className="divide-y divide-zinc-200">
      <section className="p-5">
        <h3 className="mb-3 text-sm font-semibold text-zinc-900">On stage</h3>
        {stream.guests.length === 0 ? (
          <p className="text-[13px] text-zinc-500">Nobody joined the host on stage.</p>
        ) : (
          <ul className="space-y-3">
            {stream.guests.map((guest) => (
              <li key={`${guest.user.id}-${guest.joinedAt}`} className="flex flex-wrap items-center justify-between gap-3">
                <PersonLink person={guest.user} />
                <span className="flex items-center gap-2 text-xs text-zinc-500">
                  {guest.micForceMuted && <Badge tone="warning">Mic turned off</Badge>}
                  {guest.active ? (
                    <Badge tone="success" dot>
                      On stage
                    </Badge>
                  ) : (
                    <span>
                      Joined <RelativeTime value={guest.joinedAt} />
                      {guest.leftAt && (
                        <>
                          , left <RelativeTime value={guest.leftAt} />
                        </>
                      )}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="p-5">
        <h3 className="mb-3 text-sm font-semibold text-zinc-900">Moderators for this live</h3>
        {stream.moderators.length === 0 ? (
          <p className="text-[13px] text-zinc-500">The host didn't appoint anyone.</p>
        ) : (
          <ul className="space-y-4">
            {stream.moderators.map((moderator) => (
              <li key={moderator.user.id} className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <PersonLink person={moderator.user} />
                  {moderator.active ? (
                    <Badge tone="success" dot>
                      Active
                    </Badge>
                  ) : (
                    <Badge>Removed</Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 pl-9">
                  {moderator.capabilities.map((capability) => (
                    <Badge key={capability}>{CAPABILITY_LABELS[capability]}</Badge>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-6 w-72" />
        <Skeleton className="h-4 w-56" />
      </div>
      <Skeleton className="h-24 w-full rounded-lg" />
      <Card>
        <EmptyState title="Loading…" />
      </Card>
    </div>
  )
}
