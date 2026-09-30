import { getRouteApi, useRouter } from '@tanstack/react-router'
import { LockKeyhole } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { MelaLogo } from '../../components/brand/MelaLogo'
import { Button } from '../../components/ui/Button'
import { Callout } from '../../components/ui/feedback'
import { Field, Input } from '../../components/ui/forms'
import { ApiError } from '../../lib/api'
import { useAuth } from '../../lib/auth-context'

const routeApi = getRouteApi('/login')

export function LoginPage() {
  const auth = useAuth()
  const router = useRouter()
  const { redirect } = routeApi.useSearch()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  // Signed in (just now, or already): on to where they were going.
  useEffect(() => {
    if (auth.status === 'authenticated') router.history.replace(redirect ?? '/')
  }, [auth.status, redirect, router])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await auth.signIn(email.trim(), password)
    } catch (failure) {
      setPassword('')
      setError(failure instanceof ApiError ? failure.message : 'Something went wrong. Try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-50 px-4">
      <main className="flex flex-1 flex-col items-center justify-center py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center">
            <MelaLogo className="h-14 w-auto" />
            <h1 className="mt-6 text-lg font-semibold tracking-tight text-zinc-900">Sign in to the admin console</h1>
            <p className="mt-1 text-sm text-zinc-500">Mela platform staff only.</p>
          </div>

          <form
            onSubmit={submit}
            className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
            noValidate
          >
            {error && <Callout tone="danger">{error}</Callout>}
            <Field label="Email">
              <Input
                type="email"
                autoComplete="username"
                inputMode="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoFocus
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </Field>
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              loading={pending}
              disabled={!email.trim() || !password}
            >
              Sign in
            </Button>
          </form>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-zinc-500">
            <LockKeyhole className="size-3.5" aria-hidden />
            Every sign-in and action here is recorded in the audit log.
          </p>
        </div>
      </main>

      <footer className="py-6 text-center text-xs leading-5 text-zinc-500">
        <p>© {new Date().getFullYear()} Mela. All rights reserved.</p>
        <p>Version {__APP_VERSION__}</p>
      </footer>
    </div>
  )
}
