import { Link } from '@tanstack/react-router'
import { Ban, CircleCheck, CircleSlash, Lock, MessageSquareX, Radio, Siren, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { PersonLink } from '../../components/PersonLink'
import { StreamStatusBadge, UserStatusBadge } from '../../components/StatusBadges'
import { Badge, type BadgeTone } from '../../components/ui/Badge'
import { buttonClasses } from '../../components/ui/button-styles'
import { Button } from '../../components/ui/Button'
import { DescriptionList } from '../../components/ui/Card'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { Callout, ErrorState, Skeleton } from '../../components/ui/feedback'
import { Field, Textarea } from '../../components/ui/forms'
import { RelativeTime } from '../../components/ui/misc'
import { useAuth } from '../../lib/auth-context'
import { formatDateTime, formatNumber, formatPrecise } from '../../lib/format'
import { REPORT_REASON_LABELS, REPORT_STATUS_LABELS, REPORT_TARGET_LABELS } from '../../lib/labels'
import { actions, useAdminMutation, useReport } from '../../lib/queries'
import type { ReportCaseDetail, ReportCaseStatus } from '../../lib/types'
import { SuspendUserDialog } from '../users/UserActionDialogs'

const STATUS_TONES: Record<ReportCaseStatus, BadgeTone> = { OPEN: 'warning', ACTIONED: 'success', DISMISSED: 'neutral' }

export function ReportStatusBadge({ status }: { status: ReportCaseStatus }) {
  return <Badge tone={STATUS_TONES[status]}>{REPORT_STATUS_LABELS[status]}</Badge>
}

/**
 * One reported thing (docs/features/moderation.md): what it was when first
 * reported - kept even once it's removed - who reported it and why, the
 * console's usual tools to act on it, and the decision everyone who
 * reported it hears about.
 */
export function ReportCase({ caseId }: { caseId: string }) {
  const report = useReport(caseId)
  if (report.isPending) {
    return (
      <div className="space-y-4 p-5">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    )
  }
  if (report.isError) return <ErrorState error={report.error} onRetry={() => void report.refetch()} />
  return <CaseView found={report.data} />
}

type Confirming = 'delete-chat' | 'remove-message' | 'lock' | 'suspend'

function CaseView({ found }: { found: ReportCaseDetail }) {
  const auth = useAuth()
  const [confirming, setConfirming] = useState<Confirming | null>(null)
  const close = () => setConfirming(null)
  const deleteChat = useAdminMutation(() => actions.deleteMessages([found.targetId]), {
    toastErrors: false,
    success: 'Message deleted for good.',
  })
  const removeMessage = useAdminMutation(() => actions.removeReportedMessage(found.id), {
    toastErrors: false,
    success: (result) => (result.removed ? 'Message removed from their conversation.' : 'It was already gone.'),
  })
  const lock = useAdminMutation((reason: string) => actions.lockStream(found.live!.id, reason), {
    toastErrors: false,
    success: 'Live locked. Everyone watching was told why.',
  })

  const person = found.reportedUser
  const tools = [
    found.targetType === 'CHAT_MESSAGE' && found.targetExists && auth.can('MANAGE_LIVES') && (
      <Button key="delete-chat" size="sm" variant="danger" icon={<Trash2 />} onClick={() => setConfirming('delete-chat')}>
        Delete message
      </Button>
    ),
    found.targetType === 'DIRECT_MESSAGE' && found.targetExists && auth.can('MANAGE_REPORTS') && (
      <Button key="remove-message" size="sm" variant="danger" icon={<MessageSquareX />} onClick={() => setConfirming('remove-message')}>
        Remove message
      </Button>
    ),
    found.live?.status === 'LIVE' && auth.can('MANAGE_LIVES') && (
      <Button key="lock" size="sm" variant="danger" icon={<Lock />} onClick={() => setConfirming('lock')}>
        Lock live
      </Button>
    ),
    person?.status === 'ACTIVE' && auth.can('MANAGE_USERS') && (
      <Button key="suspend" size="sm" icon={<Ban />} onClick={() => setConfirming('suspend')}>
        Suspend @{person.username}
      </Button>
    ),
    found.live && auth.can('VIEW_LIVES') && (
      <Link
        key="open-live"
        to="/streams/$streamId"
        params={{ streamId: found.live.id }}
        className={buttonClasses('secondary', 'sm')}
      >
        <Radio /> Open live
      </Link>
    ),
  ].filter(Boolean)

  return (
    <div>
      <header className="border-b border-zinc-200 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <ReportStatusBadge status={found.status} />
          {found.urgent && (
            <Badge tone="danger" icon={<Siren />}>
              Urgent
            </Badge>
          )}
          <Badge>{REPORT_TARGET_LABELS[found.targetType]}</Badge>
        </div>
        <h2 className="mt-2 text-base font-semibold break-words text-zinc-900">{found.label}</h2>
        <p className="mt-0.5 text-[13px] text-zinc-500">
          {formatNumber(found.reportCount)} {found.reportCount === 1 ? 'report' : 'reports'} · first{' '}
          {formatDateTime(found.createdAt)} · latest <RelativeTime value={found.lastReportedAt} />
        </p>
      </header>

      <div className="space-y-6 px-5 py-4">
        <Section title="What was reported">
          {!found.targetExists && (
            <Callout className="mb-3">
              {found.targetType === 'USER'
                ? 'The account was deleted since. This is what its profile said.'
                : "It's been removed since. This is what it was when first reported."}
            </Callout>
          )}
          <Reported found={found} />
        </Section>

        <Section title="Whose it is">
          {person ? (
            <div className="flex flex-wrap items-center gap-3">
              <PersonLink person={person} />
              {person.status !== 'ACTIVE' && <UserStatusBadge status={person.status} />}
              <span className="text-[13px] text-zinc-500">
                {found.otherCases === 0
                  ? 'Nothing else of theirs was reported.'
                  : `${formatNumber(found.otherCases)} other ${found.otherCases === 1 ? 'thing' : 'things'} of theirs reported.`}
              </span>
            </div>
          ) : (
            <p className="text-[13px] text-zinc-500">The account was deleted.</p>
          )}
        </Section>

        <Section title={`Reports (${formatNumber(found.reports.length)})`}>
          <ol className="space-y-2.5">
            {found.reports.map((report) => (
              <li key={report.id} className="rounded-lg border border-zinc-200 px-3.5 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-zinc-900">{REPORT_REASON_LABELS[report.reason]}</span>
                  <RelativeTime value={report.createdAt} className="text-xs text-zinc-500" />
                </div>
                {report.details && (
                  <p className="mt-1 text-[13px] break-words whitespace-pre-wrap text-zinc-700">“{report.details}”</p>
                )}
                <div className="mt-1.5 text-xs text-zinc-500">
                  By <PersonLink person={report.reporter} compact className="text-xs" />
                </div>
              </li>
            ))}
          </ol>
        </Section>

        {tools.length > 0 && (
          <Section title="Act on it" hint="Each is recorded in the audit log.">
            <div className="flex flex-wrap gap-2">{tools}</div>
          </Section>
        )}

        {found.status === 'OPEN' ? (
          auth.can('MANAGE_REPORTS') ? (
            <Decision key={found.id} found={found} />
          ) : (
            <Callout>Staff who may decide on reports close it - you can see it, but not decide.</Callout>
          )
        ) : (
          <Callout title={`${REPORT_STATUS_LABELS[found.status]} ${formatDateTime(found.resolvedAt)}`}>
            By {found.resolvedBy ? `@${found.resolvedBy.username}` : 'a deleted account'}.{' '}
            {found.resolutionNote ? <>Note: {found.resolutionNote}</> : 'No note.'}
          </Callout>
        )}
      </div>

      <ConfirmDialog
        open={confirming === 'delete-chat'}
        onClose={close}
        title="Delete this chat message for good?"
        description="It disappears from the live's chat for everyone. The report keeps what it said."
        confirmLabel="Delete message"
        tone="danger"
        onConfirm={() => deleteChat.mutateAsync(undefined)}
      />
      <ConfirmDialog
        open={confirming === 'remove-message'}
        onClose={close}
        title="Remove this private message?"
        description="It disappears from both people's conversation at once. The report keeps what it said."
        confirmLabel="Remove message"
        tone="danger"
        onConfirm={() => removeMessage.mutateAsync(undefined)}
      />
      <ConfirmDialog
        open={confirming === 'lock'}
        onClose={close}
        title="Lock this live?"
        description="It stops at once for everyone, and viewers see your reason. The host's account isn't affected; suspend it separately if needed."
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
      <SuspendUserDialog user={confirming === 'suspend' ? person : null} onClose={close} />
    </div>
  )
}

function Reported({ found }: { found: ReportCaseDetail }) {
  const { snapshot } = found
  const owner = snapshot.person ? `@${snapshot.person.username}` : 'a deleted account'
  switch (found.targetType) {
    case 'CHAT_MESSAGE':
    case 'DIRECT_MESSAGE': {
      const photo = webImage(snapshot.imageUrl)
      return (
        <figure className="rounded-lg border border-zinc-200 bg-zinc-50 p-3.5">
          {photo && (
            <img
              src={photo}
              alt="The photo that was reported"
              referrerPolicy="no-referrer"
              className="mb-2 max-h-60 rounded-md object-contain"
            />
          )}
          {snapshot.text ? (
            <blockquote className="text-sm break-words whitespace-pre-wrap text-zinc-900">{snapshot.text}</blockquote>
          ) : (
            !photo && <p className="text-sm text-zinc-400">No text</p>
          )}
          <figcaption className="mt-2 text-xs text-zinc-500">
            From {owner}
            {snapshot.sentAt && (
              <>
                {' · '}
                <time dateTime={snapshot.sentAt} title={formatPrecise(snapshot.sentAt)}>
                  {formatDateTime(snapshot.sentAt)}
                </time>
              </>
            )}
            {found.targetType === 'CHAT_MESSAGE' && snapshot.liveTitle && <> · in the live “{snapshot.liveTitle}”</>}
            {found.targetType === 'DIRECT_MESSAGE' && ' · private: shown because it was reported'}
          </figcaption>
        </figure>
      )
    }
    case 'LIVE':
      return (
        <DescriptionList
          items={[
            { label: 'Title', value: snapshot.title ?? 'Untitled' },
            { label: 'Category', value: snapshot.category ?? 'None' },
            { label: 'Started', value: formatDateTime(snapshot.startedAt ?? null), hidden: !snapshot.startedAt },
            {
              label: 'Now',
              value: found.live ? <StreamStatusBadge status={found.live.status} /> : 'Deleted',
            },
          ]}
        />
      )
    case 'USER':
      return (
        <DescriptionList
          items={[
            { label: 'Name', value: snapshot.person ? `${snapshot.person.displayName} (${owner})` : owner },
            {
              label: 'Bio',
              value: snapshot.bio ? (
                <span className="whitespace-pre-wrap">{snapshot.bio}</span>
              ) : (
                <span className="text-zinc-400">None</span>
              ),
            },
          ]}
        />
      )
  }
}

function Decision({ found }: { found: ReportCaseDetail }) {
  const [note, setNote] = useState('')
  const reporters = new Set(found.reports.flatMap((report) => (report.reporter ? [report.reporter.id] : []))).size
  const resolve = useAdminMutation(
    (outcome: 'ACTIONED' | 'DISMISSED') => actions.resolveReport(found.id, outcome, note.trim() || undefined),
    {
      success: (_, outcome) =>
        `${outcome === 'ACTIONED' ? 'Marked as action taken' : 'Closed as no violation'}. ${toldText(reporters)}`,
    },
  )
  const deciding = resolve.isPending ? resolve.variables : null
  return (
    <Section
      title="Decide"
      hint="Act on it above first, if it needs it. Everyone who reported it gets a notification with the outcome - not your note, and not who decided."
    >
      <div className="space-y-3">
        <Field label="Note for the team" hint="Optional. Kept with the report and in the audit log.">
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
            rows={2}
            placeholder="e.g. Deleted the message and suspended the account"
          />
        </Field>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            icon={<CircleSlash />}
            loading={deciding === 'DISMISSED'}
            disabled={deciding !== null}
            onClick={() => resolve.mutate('DISMISSED')}
          >
            No violation
          </Button>
          <Button
            variant="primary"
            icon={<CircleCheck />}
            loading={deciding === 'ACTIONED'}
            disabled={deciding !== null}
            onClick={() => resolve.mutate('ACTIONED')}
          >
            Action taken
          </Button>
        </div>
      </div>
    </Section>
  )
}

function toldText(reporters: number): string {
  if (reporters === 0) return "Nobody to tell: the reporters' accounts are gone."
  return reporters === 1 ? 'The person who reported it was told.' : `The ${formatNumber(reporters)} people who reported it were told.`
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
function webImage(url: string | null | undefined): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null
}
