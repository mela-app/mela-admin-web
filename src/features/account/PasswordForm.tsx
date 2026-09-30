import { Check, Circle } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Callout } from '../../components/ui/feedback'
import { Field, Input } from '../../components/ui/forms'
import { cn } from '../../lib/cn'
import { actions } from '../../lib/queries'
import type { AdminView } from '../../lib/types'
import { passwordAcceptable, passwordRules } from './password'

interface PasswordFormProps {
  email: string
  currentLabel?: string
  submitLabel?: string
  onChanged: (admin: AdminView) => void
}

/** Current password, then the new one twice, with the rules ticked off as you type. */
export function PasswordForm({ email, currentLabel = 'Current password', submitLabel = 'Change password', onChanged }: PasswordFormProps) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const rules = passwordRules(next, email)
  const mismatch = confirm.length > 0 && confirm !== next
  const ready = current.length > 0 && passwordAcceptable(next, email) && confirm === next

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!ready) return
    setPending(true)
    setError(null)
    try {
      const admin = await actions.changePassword(current, next)
      setCurrent('')
      setNext('')
      setConfirm('')
      onChanged(admin)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Something went wrong. Try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error && <Callout tone="danger">{error}</Callout>}
      <Field label={currentLabel} required>
        <Input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
        />
      </Field>
      <Field label="New password" required>
        <Input
          type="password"
          autoComplete="new-password"
          value={next}
          maxLength={128}
          onChange={(event) => setNext(event.target.value)}
        />
      </Field>
      <ul className="space-y-1" aria-label="Password requirements">
        {rules.map((rule) => (
          <li
            key={rule.label}
            className={cn('flex items-center gap-2 text-xs', rule.met ? 'text-emerald-700' : 'text-zinc-500')}
          >
            {rule.met ? <Check className="size-3.5" aria-hidden /> : <Circle className="size-3" aria-hidden />}
            {rule.label}
            <span className="sr-only">{rule.met ? '(met)' : '(not met yet)'}</span>
          </li>
        ))}
      </ul>
      <Field label="Confirm new password" required error={mismatch ? "The passwords don't match." : null}>
        <Input
          type="password"
          autoComplete="new-password"
          value={confirm}
          maxLength={128}
          onChange={(event) => setConfirm(event.target.value)}
        />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={pending} disabled={!ready}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
