import { ArrowRightLeft, CheckCircle2, CircleAlert, RefreshCw } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, Stat } from '../../components/ui/Card'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { Callout, ErrorState, Skeleton } from '../../components/ui/feedback'
import { Checkbox, Field, Input } from '../../components/ui/forms'
import { PageHeader, RelativeTime } from '../../components/ui/misc'
import { cn } from '../../lib/cn'
import { formatDate, formatDateTime, formatNumber } from '../../lib/format'
import { actions, useAdminMutation, useVideoOverview } from '../../lib/queries'
import type { VideoOverview, VideoProviderKind, VideoSettings } from '../../lib/types'
import { PROVIDER_NAMES, timeUntil } from './video-format'

const PROVIDER_NOTES: Record<VideoProviderKind, string> = {
  AGORA: "Agora's cloud: 10,000 free minutes a month, paid after that.",
  LIVEKIT: 'Our own LiveKit server: no per-minute charge.',
}

const minutes = (count: number) => `${formatNumber(count)} ${count === 1 ? 'minute' : 'minutes'}`

/**
 * Where new lives go - Agora or LiveKit - and how much of Agora's free
 * minutes are left this month (docs/features/video-provider.md). Super
 * admins only. Running lives keep the provider they started on.
 */
export function VideoPage() {
  const overview = useVideoOverview()
  const [switchTo, setSwitchTo] = useState<VideoProviderKind | null>(null)
  const data = overview.data

  return (
    <>
      <PageHeader
        title="Video"
        description="Where new lives go, and how much of Agora's free minutes are left. A switch never touches a running live: it keeps its provider until it ends."
      />

      {overview.isPending && <VideoSkeleton />}
      {overview.isError && !data && <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />}
      {data && (
        <div className="space-y-6">
          <ProvidersCard data={data} onSwitch={setSwitchTo} />
          <QuotaCard data={data} />
          <SettingsCard key={JSON.stringify(data.settings)} settings={data.settings} />
          <HistoryCard switches={data.switches} />
        </div>
      )}

      {data && (
        <SwitchDialog
          to={switchTo}
          from={data.activeProvider}
          liveOnCurrent={data.providers.find((each) => each.kind === data.activeProvider)?.liveNow ?? 0}
          onClose={() => setSwitchTo(null)}
        />
      )}
    </>
  )
}

function ProvidersCard({ data, onSwitch }: { data: VideoOverview; onSwitch(kind: VideoProviderKind): void }) {
  return (
    <Card title="Provider" description="New lives start on the active provider. Hosts already live stay where they are." flush>
      <ul className="grid divide-y divide-zinc-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        {data.providers.map((provider) => {
          const active = provider.kind === data.activeProvider
          return (
            <li key={provider.kind} className={cn('flex flex-col gap-3 p-5', active && 'bg-brand-50/40')}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-base font-semibold text-zinc-900">{PROVIDER_NAMES[provider.kind]}</p>
                {active && (
                  <Badge tone="success" icon={<CheckCircle2 />}>
                    Active
                  </Badge>
                )}
                {!provider.configured && (
                  <Badge tone="warning" icon={<CircleAlert />}>
                    Not set up
                  </Badge>
                )}
              </div>
              <p className="text-[13px] text-zinc-500">{PROVIDER_NOTES[provider.kind]}</p>
              <p className="text-sm text-zinc-700">
                <span className="font-medium tabular-nums">{formatNumber(provider.liveNow)}</span>{' '}
                {provider.liveNow === 1 ? 'live' : 'lives'} running on it now
              </p>
              {!active && (
                <div>
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<ArrowRightLeft />}
                    disabled={!provider.configured}
                    onClick={() => onSwitch(provider.kind)}
                  >
                    Switch to {PROVIDER_NAMES[provider.kind]}…
                  </Button>
                  {!provider.configured && (
                    <p className="mt-2 text-xs text-zinc-500">
                      Its keys aren't set on the server yet - add them to the API's environment and redeploy.
                    </p>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function QuotaCard({ data }: { data: VideoOverview }) {
  const quota = data.agora
  const report = quota.report
  const tone = quota.percentUsed >= 95 ? 'bg-red-500' : quota.percentUsed >= 80 ? 'bg-amber-500' : 'bg-emerald-500'
  const refresh = useAdminMutation(() => actions.refreshAgoraReport(), {
    success: (overview) =>
      overview.agora.report.error ? "Agora's report couldn't be fetched." : "Agora's report is up to date.",
  })
  return (
    <Card
      title="Agora free minutes"
      description={`${formatDate(quota.periodStart)} to ${formatDate(quota.resetsAt)} - they restart on the 1st of each month.`}
      actions={
        report.configured && (
          <Button size="sm" icon={<RefreshCw />} loading={refresh.isPending} onClick={() => refresh.mutate(undefined)}>
            Refresh from Agora
          </Button>
        )
      }
    >
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        <Stat label="Remaining" value={formatNumber(quota.remainingMinutes)} hint={`of ${minutes(quota.freeMinutes)}`} />
        <Stat label="Used" value={formatNumber(quota.usedMinutes)} hint={`${quota.percentUsed}% of the free minutes`} />
        <Stat
          label="Using now"
          value={`${formatNumber(quota.burnPerMinute)}/min`}
          hint={quota.burnPerMinute === 0 ? 'No one is on Agora' : 'Everyone on a live on Agora'}
        />
        <Stat label="Restarts in" value={timeUntil(quota.resetsAt)} hint={formatDateTime(quota.resetsAt)} />
      </div>
      <div
        className="mt-5 h-2.5 overflow-hidden rounded-full bg-zinc-100"
        role="progressbar"
        aria-label="Agora free minutes used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={quota.percentUsed}
      >
        <div className={cn('h-full rounded-full transition-all', tone)} style={{ width: `${quota.percentUsed}%` }} />
      </div>
      <dl className="mt-4 grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">
        <div className="flex justify-between gap-3 sm:block">
          <dt className="text-zinc-500">
            From Agora's report
            {quota.reportedThrough ? ` (up to ${formatDate(quota.reportedThrough)})` : ''}
          </dt>
          <dd className="font-medium text-zinc-900 tabular-nums">{minutes(quota.reportedMinutes)}</dd>
        </div>
        <div className="flex justify-between gap-3 sm:block">
          <dt className="text-zinc-500">Not reported by Agora yet (counted by Mela)</dt>
          <dd className="font-medium text-zinc-900 tabular-nums">{minutes(quota.pendingMinutes)}</dd>
        </div>
      </dl>
      <div className="mt-4 space-y-3">
        {quota.remainingMinutes === 0 ? (
          <Callout tone="danger" title="The free minutes are used up">
            Every minute on Agora is paid until {formatDate(quota.resetsAt)}.
            {data.activeProvider === 'AGORA' && ' Switch to LiveKit to stop paying for new lives.'}
          </Callout>
        ) : (
          quota.runsOutAt && (
            <Callout tone="warning" title={`At this pace they run out ${formatDateTime(quota.runsOutAt)}`}>
              That's before they restart.
              {data.activeProvider === 'AGORA' &&
                !data.settings.autoSwitch &&
                ' Switch to LiveKit, or turn on the automatic switch below.'}
            </Callout>
          )
        )}
        {!report.configured && (
          <Callout title="Only Mela's own count">
            Agora's exact numbers need its Customer ID and Secret (Agora console &gt; RESTful API) as{' '}
            <code className="text-[12px]">AGORA_CUSTOMER_ID</code> and{' '}
            <code className="text-[12px]">AGORA_CUSTOMER_SECRET</code> in the API's environment.
          </Callout>
        )}
        {report.configured && report.error && (
          <Callout tone="warning" title="Agora's report couldn't be fetched">
            {report.error} Until it works, the days it misses use Mela's own count.
          </Callout>
        )}
        <p className="text-xs text-zinc-500">
          Agora reports a day's minutes after it ends, so today is counted by Mela - once a minute, the host, guests on
          stage and every viewer of a live on Agora - and replaced by Agora's figure once reported.
          {report.fetchedAt && (
            <>
              {' '}
              Agora's report was fetched <RelativeTime value={report.fetchedAt} />; again every 30 minutes.
            </>
          )}
        </p>
      </div>
    </Card>
  )
}

function SettingsCard({ settings }: { settings: VideoSettings }) {
  const [free, setFree] = useState(String(settings.agoraFreeMinutes))
  const [autoSwitch, setAutoSwitch] = useState(settings.autoSwitch)
  const [below, setBelow] = useState(String(settings.autoSwitchBelowMinutes))
  const [switchBack, setSwitchBack] = useState(settings.switchBackOnReset)
  const freeValue = Number(free)
  const belowValue = Number(below)
  const freeProblem = Number.isInteger(freeValue) && freeValue >= 0 ? null : 'A whole number of minutes.'
  const belowProblem = Number.isInteger(belowValue) && belowValue >= 0 ? null : 'A whole number of minutes.'
  const changed =
    freeValue !== settings.agoraFreeMinutes ||
    autoSwitch !== settings.autoSwitch ||
    belowValue !== settings.autoSwitchBelowMinutes ||
    switchBack !== settings.switchBackOnReset
  const save = useAdminMutation(
    () =>
      actions.updateVideoSettings({
        agoraFreeMinutes: freeValue,
        autoSwitch,
        autoSwitchBelowMinutes: belowValue,
        switchBackOnReset: switchBack,
      }),
    { success: 'Video settings saved.' },
  )

  function submit(event: FormEvent) {
    event.preventDefault()
    if (freeProblem || belowProblem || !changed) return
    save.mutate(undefined)
  }

  return (
    <Card title="Settings" description="Agora's plan, and switching by itself to save the free minutes.">
      <form onSubmit={submit} className="space-y-5">
        <Field label="Free minutes a month" hint="Agora gives 10,000." error={freeProblem} className="max-w-xs">
          <Input type="number" inputMode="numeric" min={0} value={free} onChange={(e) => setFree(e.target.value)} />
        </Field>
        <div className="space-y-3 rounded-md border border-zinc-200 p-4">
          <Checkbox
            label="Switch new lives to LiveKit by itself when the free minutes run low"
            description="Running lives stay on Agora until they end; hosts going live after that start on LiveKit."
            checked={autoSwitch}
            onChange={(e) => setAutoSwitch(e.target.checked)}
          />
          {autoSwitch && (
            <div className="space-y-3 pl-7">
              <Field label="When fewer minutes are left than" error={belowProblem} className="max-w-xs">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={below}
                  onChange={(e) => setBelow(e.target.value)}
                />
              </Field>
              <Checkbox
                label="Back to Agora when the free minutes restart on the 1st"
                description="Only when the automatic switch moved them - never after a switch made here by hand."
                checked={switchBack}
                onChange={(e) => setSwitchBack(e.target.checked)}
              />
            </div>
          )}
        </div>
        <div className="flex justify-end">
          <Button
            type="submit"
            variant="primary"
            loading={save.isPending}
            disabled={!changed || !!freeProblem || !!belowProblem}
          >
            Save settings
          </Button>
        </div>
      </form>
    </Card>
  )
}

function HistoryCard({ switches }: { switches: VideoOverview['switches'] }) {
  return (
    <Card title="Switches" description="The last 15, newest first." flush>
      {switches.length === 0 ? (
        <p className="px-5 py-6 text-[13px] text-zinc-500">No switch yet - every live so far used the server's default.</p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {switches.map((each) => (
            <li key={each.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-3">
              <p className="text-sm font-medium text-zinc-900">
                {PROVIDER_NAMES[each.from]} → {PROVIDER_NAMES[each.to]}
              </p>
              <p className="min-w-0 flex-1 text-[13px] text-zinc-600">{each.reason}</p>
              <p className="text-xs text-zinc-500">
                {each.actor ? each.actor.displayName || `@${each.actor.username}` : 'Automatic'} ·{' '}
                <span title={formatDateTime(each.createdAt)}>
                  <RelativeTime value={each.createdAt} />
                </span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function SwitchDialog({
  to,
  from,
  liveOnCurrent,
  onClose,
}: {
  to: VideoProviderKind | null
  from: VideoProviderKind
  liveOnCurrent: number
  onClose(): void
}) {
  const switchProvider = useAdminMutation(
    ({ provider, reason }: { provider: VideoProviderKind; reason: string }) =>
      actions.switchVideoProvider(provider, reason || undefined),
    { success: (_, { provider }) => `New lives now go to ${PROVIDER_NAMES[provider]}.` },
  )
  return (
    <ConfirmDialog
      open={to !== null}
      onClose={onClose}
      title={to ? `Switch to ${PROVIDER_NAMES[to]}?` : 'Switch provider?'}
      confirmLabel={to ? `Switch to ${PROVIDER_NAMES[to]}` : 'Switch'}
      reason={{ label: 'Why', placeholder: 'For the team, e.g. Saving Agora minutes', maxLength: 200 }}
      onConfirm={(reason) => (to ? switchProvider.mutateAsync({ provider: to, reason }) : Promise.resolve())}
    >
      <ul className="list-disc space-y-1.5 pl-5 text-[13px] text-zinc-600">
        <li>
          {liveOnCurrent > 0
            ? `${formatNumber(liveOnCurrent)} ${liveOnCurrent === 1 ? 'live' : 'lives'} running on ${PROVIDER_NAMES[from]} stay there until they end - no one is cut off.`
            : `No live is running on ${PROVIDER_NAMES[from]} right now.`}
        </li>
        <li>Hosts going live from now on start on {to ? PROVIDER_NAMES[to] : 'it'}; the app tells them it changed.</li>
        <li>Viewers join whatever provider the live they open uses - nothing to update.</li>
      </ul>
    </ConfirmDialog>
  )
}

function VideoSkeleton() {
  return (
    <div className="space-y-6">
      {[0, 1].map((card) => (
        <div key={card} className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5">
          <Skeleton className="h-4 w-40" />
          <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
            {[0, 1, 2, 3].map((stat) => (
              <div key={stat} className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-24" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
