import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../components/ToastProvider'
import { AuthContext, type Auth } from '../../lib/auth-context'
import { actions, useHostingReasons } from '../../lib/queries'
import type { HostingReason, HostingRestrictionDetail } from '../../lib/types'
import { RestrictHostDialog } from './RestrictHostDialog'

vi.mock('../../lib/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/queries')>()),
  useHostingReasons: vi.fn(),
}))

const host = { id: 'u-ana', username: 'ana', displayName: 'Ana', avatarUrl: null }
const insults: HostingReason = {
  id: 'reason-1',
  title: 'Insulting viewers',
  message: 'You insulted viewers in your live.',
  archived: false,
  createdAt: '2026-10-01T09:00:00.000Z',
  updatedAt: '2026-10-01T09:00:00.000Z',
  createdBy: null,
  used: 3,
}
const lives = [
  { id: 's1', title: '', startedAt: '2026-10-12T08:00:00.000Z' },
  { id: 's2', title: 'Bingo night', startedAt: '2026-10-12T20:00:00.000Z' },
]

function showing() {
  vi.mocked(useHostingReasons).mockReturnValue({ data: [insults] } as unknown as ReturnType<typeof useHostingReasons>)
  const auth = { can: () => true } as unknown as Auth
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <AuthContext.Provider value={auth}>
          <RestrictHostDialog open onClose={vi.fn()} host={host} lives={lives} />
        </AuthContext.Provider>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => vi.restoreAllMocks())

describe('pausing a host', () => {
  it('starts on the newest live, fills a saved reason, and shows what the host will read', async () => {
    const user = userEvent.setup()
    const restrict = vi.spyOn(actions, 'restrictHost').mockResolvedValue({} as HostingRestrictionDetail)
    showing()

    expect(screen.getByLabelText('About which live')).toHaveValue('s2')
    await user.selectOptions(screen.getByLabelText('Start from'), 'reason-1')
    expect(screen.getByLabelText(/Title the host sees/)).toHaveValue('Insulting viewers')
    expect(screen.getByRole('region', { name: 'What the host will see' })).toHaveTextContent('Insulting viewers')
    expect(screen.queryByLabelText(/Save as a reason/)).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('How long'), '24h')
    await user.click(screen.getByRole('button', { name: 'Pause hosting' }))

    expect(restrict).toHaveBeenCalledWith({
      userId: 'u-ana',
      streamId: 's2',
      reasonId: 'reason-1',
      title: 'Insulting viewers',
      message: 'You insulted viewers in your live.',
      note: undefined,
      durationHours: 24,
      saveAsReason: false,
    })
  })

  it('names an untitled live after its host, and needs words before pausing', async () => {
    const user = userEvent.setup()
    const restrict = vi.spyOn(actions, 'restrictHost')
    showing()

    expect(screen.getByRole('option', { name: /^Ana's live/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Pause hosting' }))

    expect(restrict).not.toHaveBeenCalled()
    expect(screen.getByText('Give it a title of at least 3 characters.')).toBeInTheDocument()
  })
})
