import { ConfirmDialog } from '../../components/ui/Dialog'
import { actions, useAdminMutation } from '../../lib/queries'

interface Target {
  id: string
  displayName: string
  username: string
}

interface DialogProps {
  user: Target | null
  onClose: () => void
}

export function SuspendUserDialog({ user, onClose }: DialogProps) {
  const suspend = useAdminMutation(
    ({ userId, reason }: { userId: string; reason: string }) => actions.suspendUser(userId, reason),
    {
      toastErrors: false,
      success: (result) =>
        result.lockedLives > 0
          ? `Account suspended. Their live was stopped.`
          : 'Account suspended. They were signed out everywhere.',
    },
  )
  return (
    <ConfirmDialog
      open={user !== null}
      onClose={onClose}
      title={`Suspend @${user?.username ?? ''}?`}
      description="They're signed out on every device at once and can't sign in again until reinstated. A live they're running is stopped."
      confirmLabel="Suspend account"
      tone="danger"
      reason={{
        label: 'Reason',
        hint: 'Kept in the audit log. The account holder is not shown it.',
        placeholder: 'e.g. Repeated harassment in chat after a warning',
        required: true,
        minLength: 3,
        maxLength: 500,
      }}
      onConfirm={(reason) => suspend.mutateAsync({ userId: user!.id, reason })}
    />
  )
}

export function ReinstateUserDialog({ user, onClose }: DialogProps) {
  const reinstate = useAdminMutation((userId: string) => actions.reinstateUser(userId), {
    toastErrors: false,
    success: 'Account reinstated. They can sign in again.',
  })
  return (
    <ConfirmDialog
      open={user !== null}
      onClose={onClose}
      title={`Reinstate @${user?.username ?? ''}?`}
      description="They'll be able to sign in and use the app again."
      confirmLabel="Reinstate account"
      onConfirm={() => reinstate.mutateAsync(user!.id)}
    />
  )
}

export function SignOutEverywhereDialog({ user, onClose }: DialogProps) {
  const revoke = useAdminMutation((userId: string) => actions.revokeUserSessions(userId), {
    toastErrors: false,
    success: (result) =>
      result.revoked === 1 ? 'Signed out of 1 device.' : `Signed out of ${result.revoked} devices.`,
  })
  return (
    <ConfirmDialog
      open={user !== null}
      onClose={onClose}
      title={`Sign @${user?.username ?? ''} out everywhere?`}
      description="Every session ends at once, on every device. They can sign in again straight away, so use this after a leaked password rather than as a penalty."
      confirmLabel="Sign out everywhere"
      onConfirm={() => revoke.mutateAsync(user!.id)}
    />
  )
}
