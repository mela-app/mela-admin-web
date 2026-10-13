import { Link } from '@tanstack/react-router'
import { CircleCheck, ShieldOff } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Skeleton } from '../../components/ui/feedback'
import { RelativeTime } from '../../components/ui/misc'
import { useAuth } from '../../lib/auth-context'
import { formatDateTime, formatNumber } from '../../lib/format'
import { useHostingRestrictions } from '../../lib/queries'
import type { HostingAppealState, Person } from '../../lib/types'
import { RestrictHostDialog, type LiveChoice } from './RestrictHostDialog'
import { RestrictionView } from './RestrictionView'

/** "Hosting paused", or louder when the host's appeal waits for the team. */
export function HostingBadge({ appealState }: { appealState: HostingAppealState }) {
  return appealState === 'WAITING_STAFF' ? (
    <Badge tone="danger" dot>
      Appeal waiting
    </Badge>
  ) : (
    <Badge tone="warning" icon={<ShieldOff />}>
      Hosting paused
    </Badge>
  )
}

interface HostHostingCardProps {
  host: Person
  // The lives it could be about, newest last; the newest is picked first.
  lives: LiveChoice[]
  className?: string
}

/**
 * Whether [host] may host, for staff inspecting their lives: the
 * restriction in force - why, until when, the appeal - opened beside the
 * page to answer; or the way to pause it, picking the live it's about. With
 * how many times it happened before. See docs/features/hosting-restrictions.md.
 */
export function HostHostingCard({ host, lives, className }: HostHostingCardProps) {
  const auth = useAuth()
  const canView = auth.can('VIEW_HOSTING_RESTRICTIONS')
  const canManage = auth.can('MANAGE_HOSTING_RESTRICTIONS')
  const [restricting, setRestricting] = useState(false)
  const [reviewing, setReviewing] = useState<string | null>(null)
  const restrictions = useHostingRestrictions({ userId: host.id }, { pageSize: 10 }, canView)
  if (!canView) return null

  const rows = restrictions.data?.items ?? []
  const active = rows.find((row) => row.status === 'ACTIVE')
  const before = (restrictions.data?.total ?? 0) - (active ? 1 : 0)

  return (
    <section aria-label="Hosting" className={className}>
      <h3 className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Hosting</h3>
      {restrictions.isPending ? (
        <Skeleton className="mt-2.5 h-16 w-full rounded-lg" />
      ) : active ? (
        <div className="mt-2.5 rounded-lg border border-amber-200 bg-amber-50/70 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <HostingBadge appealState={active.appealState} />
          </div>
          <p className="mt-2 text-[13px] font-medium break-words text-zinc-900">{active.title}</p>
          <p className="mt-0.5 text-xs text-zinc-600">
            Since {formatDateTime(active.createdAt)} ·{' '}
            {active.endsAt ? `until ${formatDateTime(active.endsAt)}` : 'until lifted'}
          </p>
          <Button size="sm" className="mt-3 w-full" variant={active.appealState === 'WAITING_STAFF' ? 'primary' : 'secondary'} onClick={() => setReviewing(active.id)}>
            {active.appealState === 'WAITING_STAFF' ? 'Answer the appeal' : 'Open restriction'}
          </Button>
        </div>
      ) : (
        <div className="mt-2.5 rounded-lg border border-zinc-200 p-3">
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-zinc-800">
            <CircleCheck className="size-4 text-emerald-600" aria-hidden />
            Can go live
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            Pausing stops their live and keeps them off stages. They can still watch, chat and appeal.
          </p>
          {canManage && (
            <Button size="sm" variant="danger" icon={<ShieldOff />} className="mt-3 w-full" onClick={() => setRestricting(true)}>
              Pause hosting…
            </Button>
          )}
        </div>
      )}
      {before > 0 && (
        <p className="mt-2 text-xs text-zinc-500">
          Paused {formatNumber(before)} {before === 1 ? 'time' : 'times'} before
          {rows.find((row) => row.status !== 'ACTIVE') && (
            <>
              , last <RelativeTime value={rows.find((row) => row.status !== 'ACTIVE')!.createdAt} />
            </>
          )}
          .{' '}
          <Link to="/hosting" search={{ tab: 'all', q: host.username }} className="font-medium text-brand-700 hover:underline">
            See all
          </Link>
        </p>
      )}

      <RestrictHostDialog open={restricting} onClose={() => setRestricting(false)} host={host} lives={lives} />
      <Dialog
        open={reviewing !== null}
        onClose={() => setReviewing(null)}
        variant="panel"
        title={`@${host.username}'s hosting`}
        description="What they were told, their appeal and your answer."
      >
        {reviewing && (
          <div className="-mx-5 -my-4">
            <RestrictionView restrictionId={reviewing} />
          </div>
        )}
      </Dialog>
    </section>
  )
}
