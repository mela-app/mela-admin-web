import { getRouteApi, Link } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { CircleAlert, Megaphone, Send, TriangleAlert } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { PersonLink } from '../../components/PersonLink'
import { SeverityBadge } from '../../components/StatusBadges'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { DataTable, Pagination } from '../../components/ui/DataTable'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { Callout, EmptyState } from '../../components/ui/feedback'
import { Field, Segmented, Select, Textarea } from '../../components/ui/forms'
import { PageHeader, RelativeTime } from '../../components/ui/misc'
import { useAuth } from '../../lib/auth-context'
import { cn } from '../../lib/cn'
import { formatNumber, formatPrecise } from '../../lib/format'
import { actions, useAdminMutation, useAlerts, useAlertTargets } from '../../lib/queries'
import { DEFAULT_PAGE_SIZE } from '../../lib/search'
import type { AdminAlert, AlertScope, AlertSeverity } from '../../lib/types'

const routeApi = getRouteApi('/_app/alerts')

const SEVERITY_HELP: Record<AlertSeverity, string> = {
  INFO: 'Hides by itself after 8 seconds.',
  WARNING: 'Hides by itself after 12 seconds.',
  CRITICAL: 'Stays on screen until it is tapped away.',
}

export function AlertsPage() {
  const auth = useAuth()
  const search = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const alerts = useAlerts(search.page ?? 1)
  const canOpenLives = auth.can('VIEW_LIVES')
  const columns = useMemo(() => alertColumns(canOpenLives), [canOpenLives])

  return (
    <>
      <PageHeader
        title="Alerts"
        description="Messages from the team, shown over the app as a banner, apart from the chat. Use them for policy warnings, maintenance and safety notices."
      />
      <div className="space-y-6">
        {auth.can('SEND_ALERTS') && <Composer initialStreamId={search.streamId} />}
        <Card title="Sent alerts" flush>
          <DataTable
            label="Sent alerts"
            columns={columns}
            data={alerts.data?.items}
            getRowId={(row) => row.id}
            loading={alerts.isFetching}
            error={alerts.error}
            onRetry={() => void alerts.refetch()}
            empty={<EmptyState icon={<Megaphone />} title="No alerts sent yet" description="Alerts you send appear here." />}
          />
          {alerts.data && alerts.data.total > 0 && (
            <Pagination
              page={search.page ?? 1}
              pageSize={DEFAULT_PAGE_SIZE}
              total={alerts.data.total}
              onPageChange={(page) =>
                void navigate({ search: (previous) => ({ ...previous, page: page > 1 ? page : undefined }) })
              }
            />
          )}
        </Card>
      </div>
    </>
  )
}

function Composer({ initialStreamId }: { initialStreamId?: string }) {
  const auth = useAuth()
  const canAlertEveryone = auth.can('SEND_GLOBAL_ALERTS')
  const [scope, setScope] = useState<AlertScope>(initialStreamId || !canAlertEveryone ? 'STREAM' : 'GLOBAL')
  const [streamId, setStreamId] = useState(initialStreamId ?? '')
  const [severity, setSeverity] = useState<AlertSeverity>('INFO')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const lives = useAlertTargets(scope === 'STREAM')
  const send = useAdminMutation(
    () => actions.sendAlert({ scope, streamId: scope === 'STREAM' ? streamId : undefined, message: message.trim(), severity }),
    {
      toastErrors: false,
      success: (alert) =>
        `Alert sent to ${formatNumber(alert.recipientCount)} connected ${alert.recipientCount === 1 ? 'device' : 'devices'}.`,
    },
  )
  const trimmed = message.trim()
  const ready = trimmed.length >= 3 && (scope === 'GLOBAL' || streamId !== '')
  const liveOptions = lives.data?.items ?? []
  const selectedLive = liveOptions.find((live) => live.id === streamId)

  async function deliver() {
    await send.mutateAsync(undefined)
    setMessage('')
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!ready) return
    setError(null)
    // Everyone at once deserves a second look; the dialog shows its own errors.
    if (scope === 'GLOBAL') {
      setConfirming(true)
      return
    }
    deliver().catch((failure: unknown) =>
      setError(failure instanceof Error ? failure.message : 'Something went wrong.'),
    )
  }

  return (
    <Card title="New alert" description="It reaches apps that are open right now; it isn't a push notification.">
      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          {error && <Callout tone="danger">{error}</Callout>}
          <fieldset>
            <legend className="mb-1.5 text-[13px] font-medium text-zinc-800">Send to</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <ScopeOption
                label="Everyone using the app"
                hint={canAlertEveryone ? 'Every connected device.' : "Your role doesn't include alerting everyone."}
                checked={scope === 'GLOBAL'}
                disabled={!canAlertEveryone}
                onChange={() => setScope('GLOBAL')}
              />
              <ScopeOption
                label="One live"
                hint="Everyone watching or on stage."
                checked={scope === 'STREAM'}
                onChange={() => setScope('STREAM')}
              />
            </div>
          </fieldset>
          {scope === 'STREAM' && (
            <Field
              label="Live"
              hint={
                lives.data && liveOptions.length === 0
                  ? 'Nobody is live right now.'
                  : selectedLive
                    ? `Hosted by @${selectedLive.host.username} · reaches ${formatNumber(selectedLive.reach)} ${selectedLive.reach === 1 ? 'device' : 'devices'} now`
                    : undefined
              }
            >
              <Select value={streamId} onChange={(event) => setStreamId(event.target.value)} disabled={lives.isPending}>
                <option value="">{lives.isPending ? 'Loading lives…' : 'Choose a live'}</option>
                {liveOptions.map((live) => (
                  <option key={live.id} value={live.id}>
                    {live.title} · @{live.host.username}
                  </option>
                ))}
                {streamId && !selectedLive && lives.data && <option value={streamId}>A live that has ended</option>}
              </Select>
            </Field>
          )}
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-zinc-800">Severity</p>
            <Segmented<AlertSeverity>
              label="Severity"
              value={severity}
              onChange={setSeverity}
              options={[
                { value: 'INFO', label: 'Info' },
                { value: 'WARNING', label: 'Warning' },
                { value: 'CRITICAL', label: 'Critical' },
              ]}
            />
            <p className="mt-1.5 text-xs text-zinc-500">{SEVERITY_HELP[severity]}</p>
          </div>
          <Field label="Message" hint={`${trimmed.length}/280 characters`} required>
            <Textarea
              value={message}
              maxLength={280}
              rows={3}
              placeholder="e.g. Scheduled maintenance tonight at 02:00 UTC. Lives will end for about ten minutes."
              onChange={(event) => setMessage(event.target.value)}
            />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" icon={<Send />} loading={send.isPending} disabled={!ready}>
              Send alert
            </Button>
          </div>
        </div>
        <Preview severity={severity} scope={scope} message={trimmed} />
      </form>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Alert everyone?"
        description="It appears at once on every open app, over whatever people are watching."
        confirmLabel="Send to everyone"
        tone={severity === 'CRITICAL' ? 'danger' : 'default'}
        onConfirm={deliver}
      />
    </Card>
  )
}

function ScopeOption({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  disabled?: boolean
  onChange: () => void
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer gap-3 rounded-md border border-zinc-200 p-3 has-checked:border-zinc-900 has-checked:bg-zinc-50',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <input type="radio" name="scope" checked={checked} disabled={disabled} onChange={onChange} className="mt-0.5 accent-zinc-900" />
      <span>
        <span className="block text-sm font-medium text-zinc-900">{label}</span>
        <span className="block text-xs text-zinc-500">{hint}</span>
      </span>
    </label>
  )
}

/** Roughly how the app shows it: a dark banner with a coloured edge. */
function Preview({ severity, scope, message }: { severity: AlertSeverity; scope: AlertScope; message: string }) {
  const accent = { INFO: '#8B5CF6', WARNING: '#F59E0B', CRITICAL: '#EF4444' }[severity]
  const title = { INFO: 'Notice', WARNING: 'Warning', CRITICAL: 'Important' }[severity]
  const Icon = severity === 'INFO' ? Megaphone : severity === 'WARNING' ? TriangleAlert : CircleAlert
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium text-zinc-800">In the app</p>
      <div className="rounded-xl bg-[#0E0E14] p-3">
        <div className="overflow-hidden rounded-[14px] bg-[#191922]" style={{ borderLeft: `4px solid ${accent}` }}>
          <div className="flex gap-3 p-3">
            <Icon className="mt-0.5 size-5 shrink-0" style={{ color: accent }} aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-semibold" style={{ color: accent }}>
                {title} {scope === 'STREAM' ? 'for this live' : 'from the team'}
              </p>
              <p className="mt-0.5 text-sm break-words text-[#F5F5F7]">{message || 'Your message appears here.'}</p>
              {severity === 'CRITICAL' && <p className="mt-2 text-right text-xs font-semibold text-[#8B5CF6]">Got it</p>}
            </div>
          </div>
        </div>
        <div className="mt-3 h-24 rounded-lg bg-white/[0.04]" aria-hidden />
      </div>
    </div>
  )
}

function alertColumns(canOpenLives: boolean): Array<ColumnDef<AdminAlert>> {
  return [
    {
      id: 'createdAt',
      header: 'Sent',
      cell: ({ row }) => (
        <span className="block leading-tight" title={formatPrecise(row.original.createdAt)}>
          <RelativeTime value={row.original.createdAt} className="whitespace-nowrap text-zinc-900" />
        </span>
      ),
    },
    {
      id: 'scope',
      header: 'To',
      cell: ({ row }) =>
        row.original.scope === 'GLOBAL' ? (
          <span className="font-medium text-zinc-900">Everyone</span>
        ) : row.original.stream && canOpenLives ? (
          <Link
            to="/streams/$streamId"
            params={{ streamId: row.original.stream.id }}
            className="block max-w-56 truncate font-medium text-zinc-900 hover:underline"
          >
            {row.original.stream.title}
          </Link>
        ) : row.original.stream ? (
          <span className="block max-w-56 truncate font-medium text-zinc-900">{row.original.stream.title}</span>
        ) : (
          <span className="text-zinc-500">A deleted live</span>
        ),
    },
    {
      id: 'severity',
      header: 'Severity',
      cell: ({ row }) => <SeverityBadge severity={row.original.severity} />,
    },
    {
      id: 'message',
      header: 'Message',
      cell: ({ row }) => <span className="line-clamp-2 block max-w-md whitespace-normal text-zinc-800">{row.original.message}</span>,
    },
    {
      id: 'reached',
      header: 'Reached',
      meta: { align: 'right' },
      cell: ({ row }) => `${formatNumber(row.original.recipientCount)} devices`,
    },
    {
      id: 'sender',
      header: 'Sent by',
      cell: ({ row }) => <PersonLink person={row.original.createdBy} compact className="font-normal" />,
    },
  ]
}
