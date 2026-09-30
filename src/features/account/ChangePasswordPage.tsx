import { useRouter } from '@tanstack/react-router'
import { KeyRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { useAuth } from '../../lib/auth-context'
import { useToast } from '../../lib/toast-context'
import { PasswordForm } from './PasswordForm'

/** Before anything else, a temporary password (seeded or staff-created) is replaced. */
export function ChangePasswordPage() {
  const auth = useAuth()
  const router = useRouter()
  const toast = useToast()
  const [confirmingSignOut, setConfirmingSignOut] = useState(false)
  const admin = auth.admin

  useEffect(() => {
    if (auth.status === 'authenticated' && admin && !admin.passwordChangeRequired) router.history.replace('/')
  }, [auth.status, admin, router])

  if (!admin) return null
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-zinc-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex size-10 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <KeyRound className="size-5" />
          </div>
          <h1 className="mt-4 text-lg font-semibold tracking-tight text-zinc-900">Choose your own password</h1>
          <p className="mt-1 max-w-sm text-sm text-zinc-500">
            You signed in as <span className="font-medium text-zinc-700">{admin.email}</span> with a temporary
            password. Replace it to continue; the temporary one stops working.
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <PasswordForm
            email={admin.email}
            currentLabel="Temporary password"
            submitLabel="Save and continue"
            onChanged={(updated) => {
              toast.success('Password changed. Your other sessions were signed out.')
              auth.update(updated)
            }}
          />
        </div>
        <div className="mt-4 text-center">
          <Button variant="ghost" size="sm" onClick={() => setConfirmingSignOut(true)}>
            Sign out instead
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmingSignOut}
        onClose={() => setConfirmingSignOut(false)}
        title="Sign out without changing it?"
        description="Your temporary password keeps working until you replace it, so you can come back and finish this later."
        confirmLabel="Sign out"
        onConfirm={() => auth.signOut()}
      />
    </div>
  )
}
