import { ShieldOff } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/feedback'
import { useAuth } from '../../lib/auth-context'
import { useHostingRestrictions } from '../../lib/queries'
import type { Person } from '../../lib/types'
import { RestrictHostDialog } from './RestrictHostDialog'
import { RestrictionView } from './RestrictionView'

interface LiveHostingPanelProps {
  stream: { id: string; title: string; host: Person }
}

/**
 * A live's hosting restrictions (docs/features/hosting-restrictions.md): the
 * ones made because of it, each with the host's appeal - or the way to pause
 * the host's hosting because of it.
 */
export function LiveHostingPanel({ stream }: LiveHostingPanelProps) {
  const auth = useAuth()
  const [restricting, setRestricting] = useState(false)
  const restrictions = useHostingRestrictions({ streamId: stream.id })
  const rows = restrictions.data?.items ?? []
  const canManage = auth.can('MANAGE_HOSTING_RESTRICTIONS')

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
          title="No hosting restriction"
          description="Nobody's hosting was paused because of this live. Pause it when the host broke the rules - they can still watch and chat, and may appeal."
          action={
            canManage ? (
              <Button variant="danger" icon={<ShieldOff />} onClick={() => setRestricting(true)}>
                Pause host's hosting
              </Button>
            ) : undefined
          }
        />
      )}
      <div className="divide-y divide-zinc-200">
        {rows.map((row) => (
          <RestrictionView key={row.id} restrictionId={row.id} showLive={false} />
        ))}
      </div>

      <RestrictHostDialog
        open={restricting}
        onClose={() => setRestricting(false)}
        host={stream.host}
        stream={{ id: stream.id, title: stream.title }}
      />
    </div>
  )
}
