import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../components/ToastProvider'
import { ApiError } from '../../lib/api'
import { actions } from '../../lib/queries'
import type { AdminView } from '../../lib/types'
import { passwordAcceptable, passwordRules } from './password'
import { PasswordForm } from './PasswordForm'

function wrap(children: ReactNode) {
  const client = new QueryClient()
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  )
}

describe('password rules (mirroring the API)', () => {
  it('needs 12 characters with letters and numbers, not built on the email', () => {
    expect(passwordAcceptable('correct horse 42', 'ana@example.com')).toBe(true)
    expect(passwordAcceptable('short1', 'ana@example.com')).toBe(false)
    expect(passwordAcceptable('onlyletterslong', 'ana@example.com')).toBe(false)
    expect(passwordAcceptable('Abebekebede2026', 'abebekebede@example.com')).toBe(false)
    expect(passwordRules('', 'ana@example.com').every((rule) => !rule.met)).toBe(true)
  })
})

describe('PasswordForm', () => {
  it('only submits a valid, confirmed password, then reports the updated account', async () => {
    const user = userEvent.setup()
    const updated = { id: 'a1', passwordChangeRequired: false } as AdminView
    const change = vi.spyOn(actions, 'changePassword').mockResolvedValue(updated)
    const onChanged = vi.fn()
    render(wrap(<PasswordForm email="ana@example.com" onChanged={onChanged} />))
    const submit = screen.getByRole('button', { name: 'Change password' })

    await user.type(screen.getByLabelText(/Current password/), 'temporary-pass-1')
    await user.type(screen.getByLabelText(/^New password/), 'short1')
    expect(submit).toBeDisabled()

    await user.clear(screen.getByLabelText(/^New password/))
    await user.type(screen.getByLabelText(/^New password/), 'a much longer one 42')
    await user.type(screen.getByLabelText(/Confirm new password/), 'a much longer one 4')
    expect(screen.getByText("The passwords don't match.")).toBeInTheDocument()
    expect(submit).toBeDisabled()

    await user.type(screen.getByLabelText(/Confirm new password/), '2')
    expect(submit).toBeEnabled()
    await user.click(submit)

    expect(change).toHaveBeenCalledWith('temporary-pass-1', 'a much longer one 42')
    expect(onChanged).toHaveBeenCalledWith(updated)
  })

  it("shows the API's reason when the change is refused", async () => {
    const user = userEvent.setup()
    vi.spyOn(actions, 'changePassword').mockRejectedValue(new ApiError(400, 'Your current password is incorrect.'))
    render(wrap(<PasswordForm email="ana@example.com" onChanged={vi.fn()} />))

    await user.type(screen.getByLabelText(/Current password/), 'wrong')
    await user.type(screen.getByLabelText(/^New password/), 'a much longer one 42')
    await user.type(screen.getByLabelText(/Confirm new password/), 'a much longer one 42')
    await user.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByText('Your current password is incorrect.')).toBeInTheDocument()
  })
})
