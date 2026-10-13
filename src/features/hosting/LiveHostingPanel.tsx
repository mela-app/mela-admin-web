import { ShieldOff } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/feedback'
import { useAuth } from '../../lib/auth-context'
import { useHostingInForce, useHostingRestrictions } from '../../lib/queries'
import type { Person } from '../../lib/types'
import { RestrictHostDialog } from './RestrictHostDialog'
import { RestrictionView } from './RestrictionView'

interface LiveHostingPanelProps {
  stream: { id: string; title: string; startedAt: string; host: Person }
}

/**
 * A live's Hosting tab (docs/features/hosting-restrictions.md): the
 * restrictions made because of it, each with the host's appeal - or, when
 * there are none, the way to pause the host's hosting because of it.
 */
export function LiveHostingPanel({ stream }: LiveHostingPanelProps) {
  const auth = useAuth()
  const [restricting, setRestricting] = useState(false)
  const restrictions = useHostingRestrictions({ streamId: stream.id })
  const inForce = useHostingInForce([stream.host.id], true).get(stream.host.id)
  const rows = restrictions.data?.items ?? []
  const canPause = auth.can('MANAGE_HOSTING_RESTRICTIONS') && !inForce

  return (
    <div>
      {restrictions.isPending && (
        <div className="space-y-3 p-5">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      )}
      {restrictions.isError && !restrictions.data && (
        <ErrorState error={restrictions.error} onRetry={() => void restrictions.refetch()} />
      )}
      {restrictions.data && rows.length === 0 && (
        <EmptyState
          icon={<ShieldOff />}
          title="No hosting restriction for this live"
          description={
            inForce
              ? "The host's hosting is already paused, because of another live."
              : 'When the host broke the rules here, pause their hosting: they stop streaming, still watch and chat, and may appeal. Reading the chat first? Use Inspect in Live chat.'
          }
          action={
            canPause ? (
              <Button variant="danger" icon={<ShieldOff />} onClick={() => setRestricting(true)}>
                Pause hosting…
              </Button>
            ) : undefined
          }
        />
      )}
      <div className="divide-y-8 divide-zinc-100">
        {rows.map((row) => (
          <RestrictionView key={row.id} restrictionId={row.id} showLive={false} />
        ))}
      </div>

      <RestrictHostDialog
        open={restricting}
        onClose={() => setRestricting(false)}
        host={stream.host}
        lives={[{ id: stream.id, title: stream.title, startedAt: stream.startedAt }]}
      />
    </div>
  )
}
