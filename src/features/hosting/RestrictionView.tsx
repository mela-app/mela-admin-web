import { Link } from '@tanstack/react-router'
import { CircleCheck, Clock, HelpCircle, Lock, Radio, ShieldOff, UserRound } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { PersonLink } from '../../components/PersonLink'
import { Badge, type BadgeTone } from '../../components/ui/Badge'
import { buttonClasses } from '../../components/ui/button-styles'
import { Button } from '../../components/ui/Button'
import { DescriptionList } from '../../components/ui/Card'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { Callout, ErrorState, Skeleton } from '../../components/ui/feedback'
import { Select, Textarea } from '../../components/ui/forms'
import { Avatar, RelativeTime } from '../../components/ui/misc'
import { useAuth } from '../../lib/auth-context'
import { cn } from '../../lib/cn'
import { formatDateTime, formatPrecise } from '../../lib/format'
import { HOSTING_APPEAL_LABELS, HOSTING_STATUS_LABELS } from '../../lib/labels'
import { liveName } from '../../lib/live-name'
import { actions, useAdminMutation, useHostingRestriction } from '../../lib/queries'
import type {
  HostingAppealState,
  HostingRestrictionDetail,
  HostingRestrictionMessage,
  HostingRestrictionStatus,
} from '../../lib/types'
import { DURATIONS } from './durations'

const STATUS_TONES: Record<HostingRestrictionStatus, BadgeTone> = { ACTIVE: 'danger', LIFTED: 'success', EXPIRED: 'neutral' }
const APPEAL_TONES: Record<HostingAppealState, BadgeTone> = {
  NONE: 'neutral',
  WAITING_STAFF: 'warning',
  WAITING_HOST: 'info',
  KEPT: 'neutral',
}

export function RestrictionBadges({ status, appealState }: { status: HostingRestrictionStatus; appealState: HostingAppealState }) {
  return (
    <>
      <Badge tone={STATUS_TONES[status]}>{HOSTING_STATUS_LABELS[status]}</Badge>
      {status === 'ACTIVE' && appealState !== 'NONE' && (
        <Badge tone={APPEAL_TONES[appealState]}>{HOSTING_APPEAL_LABELS[appealState]}</Badge>
      )}
    </>
  )
}

/**
 * One hosting restriction, as a case (docs/features/hosting-restrictions.md):
 * who and why at the top with what can be done, the appeal as a timeline,
 * and the answer box at the bottom for staff who manage them.
 */
export function RestrictionView({ restrictionId, showLive = true }: { restrictionId: string; showLive?: boolean }) {
  const restriction = useHostingRestriction(restrictionId)
  if (restriction.isPending) {
    return (
      <div className="space-y-4 p-5">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    )
  }
  if (restriction.isError) return <ErrorState error={restriction.error} onRetry={() => void restriction.refetch()} />
  return <Restriction found={restriction.data} showLive={showLive} />
}

function Restriction({ found, showLive }: { found: HostingRestrictionDetail; showLive: boolean }) {
  const auth = useAuth()
  const active = found.status === 'ACTIVE'
  const canManage = auth.can('MANAGE_HOSTING_RESTRICTIONS')

  return (
    <article className="flex min-h-full flex-col">
      <header className="border-b border-zinc-200 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <PersonLink person={found.user} />
          <div className="flex flex-wrap items-center gap-1.5">
            <RestrictionBadges status={found.status} appealState={found.appealState} />
          </div>
        </div>
        <h2 className="mt-3 text-base font-semibold break-words text-zinc-900">{found.title}</h2>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[13px] text-zinc-500">
          <Clock className="size-3.5" aria-hidden />
          {period(found)}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {showLive && found.stream && auth.can('VIEW_LIVES') && (
            <Link
              to="/streams/$streamId"
              params={{ streamId: found.stream.id }}
              search={{ tab: 'hosting' }}
              className={buttonClasses('secondary', 'sm')}
            >
              <Radio /> Open the live
            </Link>
          )}
          {auth.can('VIEW_USERS') && (
            <Link to="/users/$userId" params={{ userId: found.user.id }} className={buttonClasses('secondary', 'sm')}>
              <UserRound /> Account
            </Link>
          )}
          {active && canManage && <ChangeDuration key={`${found.id}:${found.endsAt}`} found={found} />}
        </div>
      </header>

      <div className="flex-1 space-y-6 px-5 py-4">
        <Section title="What the host was told">
          <figure className="rounded-lg border border-zinc-200 bg-zinc-50 p-3.5">
            <p className="text-sm font-medium text-zinc-900">{found.title}</p>
            <p className="mt-1 text-sm break-words whitespace-pre-wrap text-zinc-700">{found.message}</p>
          </figure>
        </Section>

        <Section title="Details">
          <DescriptionList
            columns={2}
            items={[
              {
                label: 'Live',
                value: found.stream ? (
                  auth.can('VIEW_LIVES') ? (
                    <Link
                      to="/streams/$streamId"
                      params={{ streamId: found.stream.id }}
                      search={{ tab: 'hosting' }}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {liveName({ ...found.stream, host: found.user })}
                    </Link>
                  ) : (
                    liveName({ ...found.stream, host: found.user })
                  )
                ) : (
                  'Not about one live'
                ),
              },
              { label: 'Saved reason', value: found.reason?.title ?? 'Written for this one' },
              { label: 'Paused by', value: found.createdBy ? `@${found.createdBy.username}` : 'A deleted account' },
              { label: 'Team note', value: found.note ?? <span className="text-zinc-400">None</span> },
            ]}
          />
        </Section>

        <Section title="Appeal" hint={turnHint(found)}>
          <ol className="space-y-3">
            <TimelineEvent icon={<ShieldOff />} at={found.createdAt}>
              Hosting paused{found.createdBy ? ` by @${found.createdBy.username}` : ''}
            </TimelineEvent>
            {found.messages.map((message) => (
              <MessageItem key={message.id} message={message} host={found.user} />
            ))}
            {found.liftedAt && (
              <TimelineEvent icon={<CircleCheck />} at={found.liftedAt}>
                Lifted{found.liftedBy ? ` by @${found.liftedBy.username}` : ''} - they can host again
              </TimelineEvent>
            )}
            {found.status === 'EXPIRED' && found.endsAt && (
              <TimelineEvent icon={<Clock />} at={found.endsAt}>
                Ran out - they can host again
              </TimelineEvent>
            )}
          </ol>
        </Section>

        {found.history.length > 0 && (
          <Section title={`Their other restrictions (${found.history.length})`}>
            <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 text-[13px]">
              {found.history.map((other) => (
                <li key={other.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <Badge tone={STATUS_TONES[other.status]}>{HOSTING_STATUS_LABELS[other.status]}</Badge>
                  <Link
                    to="/hosting"
                    search={{ tab: other.status === 'ACTIVE' ? 'active' : 'ended', restriction: other.id }}
                    className="min-w-0 flex-1 truncate text-zinc-800 hover:underline"
                  >
                    {other.title}
                  </Link>
                  <RelativeTime value={other.createdAt} className="text-xs text-zinc-500" />
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>

      {active && canManage && <Answer key={`${found.id}:${found.messages.length}`} found={found} />}
      {active && !canManage && (
        <div className="border-t border-zinc-200 px-5 py-3">
          <Callout>Staff who manage hosting restrictions answer the host and lift it.</Callout>
        </div>
      )}
    </article>
  )
}

function period(found: HostingRestrictionDetail): string {
  const since = `Since ${formatDateTime(found.createdAt)}`
  if (found.liftedAt) return `${since} · lifted ${formatDateTime(found.liftedAt)}`
  if (!found.endsAt) return `${since} · until lifted`
  return `${since} · ${found.status === 'EXPIRED' ? 'ran out' : 'until'} ${formatDateTime(found.endsAt)}`
}

function turnHint(found: HostingRestrictionDetail): string | undefined {
  if (found.status !== 'ACTIVE') return undefined
  switch (found.appealState) {
    case 'WAITING_STAFF':
      return 'The host is waiting for your answer.'
    case 'WAITING_HOST':
      return 'You asked for more - waiting for the host.'
    case 'KEPT':
      return found.hostCanWriteFrom
        ? `Kept. The host can write again ${formatDateTime(found.hostCanWriteFrom)}.`
        : 'Kept.'
    case 'NONE':
      return "The host hasn't written."
  }
}

function TimelineEvent({ icon, at, children }: { icon: ReactNode; at: string; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2.5 text-xs text-zinc-500">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-zinc-100 text-zinc-500 [&_svg]:size-3.5">{icon}</span>
      <span className="font-medium text-zinc-700">{children}</span>
      <time dateTime={at} title={formatPrecise(at)} className="ml-auto shrink-0">
        {formatDateTime(at)}
      </time>
    </li>
  )
}

function MessageItem({
  message,
  host,
}: {
  message: HostingRestrictionMessage
  host: { displayName: string; avatarUrl?: string | null }
}) {
  const staff = message.fromStaff
  return (
    <li className="flex gap-2.5">
      {staff ? (
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-600 text-[11px] font-bold text-white">M</span>
      ) : (
        <Avatar name={host.displayName} url={host.avatarUrl} size="sm" />
      )}
      <div
        className={cn(
          'min-w-0 flex-1 rounded-lg border px-3.5 py-2.5',
          staff ? 'border-brand-100 bg-brand-50/60' : 'border-zinc-200 bg-white',
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
          <span className="font-medium text-zinc-800">
            {staff ? `Mela team${message.author ? ` · @${message.author.username}` : ''}` : `${host.displayName} (host)`}
          </span>
          <time dateTime={message.createdAt} title={formatPrecise(message.createdAt)}>
            {formatDateTime(message.createdAt)}
          </time>
        </div>
        <p className="mt-1 text-[13px] break-words whitespace-pre-wrap text-zinc-800">{message.text}</p>
        {message.imageUrls.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.imageUrls.filter(isWebUrl).map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer noopener">
                <img
                  src={url}
                  alt="A picture the host sent"
                  referrerPolicy="no-referrer"
                  className="h-28 w-28 rounded-md border border-zinc-200 object-cover hover:opacity-90"
                />
              </a>
            ))}
          </div>
        )}
      </div>
    </li>
  )
}

/** The answer box, at the bottom: keep it, ask for more, or lift it. */
function Answer({ found }: { found: HostingRestrictionDetail }) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmLift, setConfirmLift] = useState(false)
  const answer = useAdminMutation(
    (decision: 'KEEP' | 'ASK') => actions.answerAppeal(found.id, decision, text.trim()),
    {
      toastErrors: false,
      success: (_, decision) =>
        decision === 'KEEP' ? 'Kept. The host was told, and can write again in a day.' : 'Sent. The host was asked for more.',
    },
  )
  const lift = useAdminMutation(() => actions.liftRestriction(found.id, text.trim() || undefined), {
    toastErrors: false,
    success: 'Lifted. The host can go live again and was told.',
  })
  const pending = answer.isPending ? answer.variables : null

  async function run(decision: 'KEEP' | 'ASK') {
    if (text.trim().length === 0) return setError('Write your answer to the host first.')
    setError(null)
    try {
      await answer.mutateAsync(decision)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Something went wrong. Try again.')
    }
  }

  return (
    <footer className="sticky bottom-0 border-t border-zinc-200 bg-zinc-50/95 px-5 py-4 backdrop-blur">
      <label htmlFor={`answer-${found.id}`} className="block text-[13px] font-medium text-zinc-800">
        Your message
      </label>
      <p className="text-xs text-zinc-500">The host sees it from “the Mela team” - not your name.</p>
      <Textarea
        id={`answer-${found.id}`}
        className="mt-2 bg-white"
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={1000}
        rows={3}
        placeholder="e.g. Thanks for explaining. Please keep your live respectful from now on."
      />
      {error && <Callout tone="danger" className="mt-2">{error}</Callout>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" icon={<HelpCircle />} loading={pending === 'ASK'} disabled={pending != null} onClick={() => void run('ASK')}>
          Ask for more
        </Button>
        <Button size="sm" icon={<Lock />} loading={pending === 'KEEP'} disabled={pending != null} onClick={() => void run('KEEP')}>
          Keep restriction
        </Button>
        <Button
          size="sm"
          variant="primary"
          className="ml-auto"
          icon={<CircleCheck />}
          disabled={pending != null}
          onClick={() => setConfirmLift(true)}
        >
          Lift - they can host again
        </Button>
      </div>
      <ConfirmDialog
        open={confirmLift}
        onClose={() => setConfirmLift(false)}
        title="Lift the restriction?"
        description={
          text.trim()
            ? 'They can go live again at once, and get your message with the notification.'
            : 'They can go live again at once and are told so. You can still write a message above first.'
        }
        confirmLabel="Lift restriction"
        onConfirm={() => lift.mutateAsync(undefined)}
      />
    </footer>
  )
}

function ChangeDuration({ found }: { found: HostingRestrictionDetail }) {
  const [duration, setDuration] = useState('')
  const change = useAdminMutation(
    (hours: number | null) =>
      actions.updateRestriction(found.id, {
        endsAt: hours === null ? null : new Date(Date.now() + hours * 3_600_000).toISOString(),
      }),
    { success: 'Changed. The host sees the new end.' },
  )
  return (
    <span className="inline-flex items-center gap-1.5">
      <Select
        aria-label="Change how long, from now"
        className="h-8 w-44 text-[13px]"
        value={duration}
        onChange={(event) => setDuration(event.target.value)}
      >
        <option value="">Change how long…</option>
        {DURATIONS.map((each) => (
          <option key={each.value} value={each.value}>
            {each.hours ? `${each.label} from now` : each.label}
          </option>
        ))}
      </Select>
      {duration && (
        <Button
          size="sm"
          loading={change.isPending}
          onClick={() => change.mutate(DURATIONS.find((each) => each.value === duration)?.hours ?? null)}
        >
          Apply
        </Button>
      )}
    </span>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-medium tracking-wide text-zinc-500 uppercase">{title}</h3>
      {hint && <p className="mt-1 text-[13px] text-zinc-500">{hint}</p>}
      <div className="mt-2.5">{children}</div>
    </section>
  )
}

// Only a real web address goes into an <img>.
function isWebUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}
