import { Link } from '@tanstack/react-router'
import { CircleCheck, HelpCircle, Lock, Radio } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { PersonLink } from '../../components/PersonLink'
import { Badge, type BadgeTone } from '../../components/ui/Badge'
import { buttonClasses } from '../../components/ui/button-styles'
import { Button } from '../../components/ui/Button'
import { DescriptionList } from '../../components/ui/Card'
import { Callout, ErrorState, Skeleton } from '../../components/ui/feedback'
import { Field, Select, Textarea } from '../../components/ui/forms'
import { RelativeTime } from '../../components/ui/misc'
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
 * One hosting restriction (docs/features/hosting-restrictions.md): what the
 * host was told, the appeal conversation with their pictures, and - for
 * staff who manage them - answering, lifting and changing how long.
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
    <div>
      <header className="border-b border-zinc-200 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <RestrictionBadges status={found.status} appealState={found.appealState} />
        </div>
        <h2 className="mt-2 text-base font-semibold break-words text-zinc-900">{found.title}</h2>
        <p className="mt-0.5 text-[13px] text-zinc-500">
          Since {formatDateTime(found.createdAt)} ·{' '}
          {found.liftedAt
            ? `lifted ${formatDateTime(found.liftedAt)}`
            : found.endsAt
              ? `${active ? 'until' : 'ran out'} ${formatDateTime(found.endsAt)}`
              : 'until the team lifts it'}
        </p>
      </header>

      <div className="space-y-6 px-5 py-4">
        <Section title="Host">
          <PersonLink person={found.user} />
        </Section>

        <Section title="What the host was told">
          <figure className="rounded-lg border border-zinc-200 bg-zinc-50 p-3.5">
            <p className="text-sm font-medium text-zinc-900">{found.title}</p>
            <p className="mt-1 text-sm break-words whitespace-pre-wrap text-zinc-700">{found.message}</p>
          </figure>
          <DescriptionList
            items={[
              {
                label: 'Live',
                value: found.stream ? (
                  auth.can('VIEW_LIVES') ? (
                    <Link to="/streams/$streamId" params={{ streamId: found.stream.id }} search={{ tab: 'hosting' }} className="font-medium text-brand-700 hover:underline">
                      {liveName(found.stream)}
                    </Link>
                  ) : (
                    liveName(found.stream)
                  )
                ) : (
                  'Not about one live'
                ),
                hidden: !showLive,
              },
              { label: 'Saved reason', value: found.reason?.title ?? 'Written for this one' },
              { label: 'By', value: found.createdBy ? `@${found.createdBy.username}` : 'A deleted account' },
              { label: 'Lifted by', value: found.liftedBy ? `@${found.liftedBy.username}` : '—', hidden: !found.liftedAt },
              { label: 'Team note', value: found.note ?? 'None' },
            ]}
          />
        </Section>

        <Section
          title="Appeal"
          hint={
            active
              ? found.appealState === 'WAITING_STAFF'
                ? "The host is waiting for the team's answer."
                : found.appealState === 'KEPT' && found.hostCanWriteFrom
                  ? `Kept. The host can write again ${formatDateTime(found.hostCanWriteFrom)}.`
                  : found.appealState === 'WAITING_HOST'
                    ? 'The team asked for more; waiting for the host.'
                    : "The host hasn't written."
              : undefined
          }
        >
          {found.messages.length === 0 ? (
            <p className="text-[13px] text-zinc-500">No messages.</p>
          ) : (
            <ol className="space-y-2.5">
              {found.messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </ol>
          )}
        </Section>

        {active && canManage && <Answer key={`${found.id}:${found.messages.length}`} found={found} />}
        {active && canManage && <ChangeDuration key={`${found.id}:duration`} found={found} />}
        {active && !canManage && <Callout>Staff who manage hosting restrictions answer the host and lift it.</Callout>}

        {found.history.length > 0 && (
          <Section title="Their other restrictions">
            <ul className="space-y-1.5 text-[13px]">
              {found.history.map((other) => (
                <li key={other.id} className="flex flex-wrap items-center gap-2">
                  <Badge tone={STATUS_TONES[other.status]}>{HOSTING_STATUS_LABELS[other.status]}</Badge>
                  <Link to="/hosting" search={{ tab: 'ended', restriction: other.id }} className="text-zinc-800 hover:underline">
                    {other.title}
                  </Link>
                  <RelativeTime value={other.createdAt} className="text-xs text-zinc-500" />
                </li>
              ))}
            </ul>
          </Section>
        )}

        {showLive && found.stream && auth.can('VIEW_LIVES') && (
          <Link
            to="/streams/$streamId"
            params={{ streamId: found.stream.id }}
            search={{ tab: 'hosting' }}
            className={buttonClasses('secondary', 'sm')}
          >
            <Radio /> Open live
          </Link>
        )}
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: HostingRestrictionMessage }) {
  return (
    <li
      className={cn(
        'rounded-lg border px-3.5 py-2.5',
        message.fromStaff ? 'ml-8 border-brand-100 bg-brand-50/60' : 'mr-8 border-zinc-200 bg-white',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
        <span className="font-medium text-zinc-800">
          {message.fromStaff
            ? `Mela team${message.author ? ` (@${message.author.username})` : ''}`
            : 'Host'}
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
                className="h-28 w-28 rounded-md border border-zinc-200 object-cover"
              />
            </a>
          ))}
        </div>
      )}
    </li>
  )
}

function Answer({ found }: { found: HostingRestrictionDetail }) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
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
  const pending = answer.isPending ? answer.variables : lift.isPending ? 'LIFT' : null

  async function run(action: 'KEEP' | 'ASK' | 'LIFT') {
    if (action !== 'LIFT' && text.trim().length === 0) return setError('Write your answer to the host first.')
    setError(null)
    try {
      if (action === 'LIFT') await lift.mutateAsync(undefined)
      else await answer.mutateAsync(action)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Something went wrong. Try again.')
    }
  }

  return (
    <Section title="Answer the host" hint="The host sees your words as from the Mela team - not your name.">
      <div className="space-y-3">
        <Field label="Your message">
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="e.g. Thanks for explaining. Please keep your live respectful from now on."
          />
        </Field>
        {error && <Callout tone="danger">{error}</Callout>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button icon={<HelpCircle />} loading={pending === 'ASK'} disabled={pending !== null} onClick={() => void run('ASK')}>
            Ask for more
          </Button>
          <Button icon={<Lock />} loading={pending === 'KEEP'} disabled={pending !== null} onClick={() => void run('KEEP')}>
            Keep restriction
          </Button>
          <Button
            variant="primary"
            icon={<CircleCheck />}
            loading={pending === 'LIFT'}
            disabled={pending !== null}
            onClick={() => void run('LIFT')}
          >
            Lift - they can host again
          </Button>
        </div>
      </div>
    </Section>
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
    <Section title="How long" hint="Counted from now.">
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="How long from now" className="w-full sm:w-56" value={duration} onChange={(event) => setDuration(event.target.value)}>
          <option value="">Pick…</option>
          {DURATIONS.map((each) => (
            <option key={each.value} value={each.value}>
              {each.label}
            </option>
          ))}
        </Select>
        <Button
          size="sm"
          disabled={!duration}
          loading={change.isPending}
          onClick={() => change.mutate(DURATIONS.find((each) => each.value === duration)?.hours ?? null)}
        >
          Change
        </Button>
      </div>
    </Section>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-medium tracking-wide text-zinc-500 uppercase">{title}</h3>
      {hint && <p className="mt-1 text-[13px] text-zinc-500">{hint}</p>}
      <div className="mt-2.5 space-y-3">{children}</div>
    </section>
  )
}

// Only a real web address goes into an <img>.
function isWebUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}
