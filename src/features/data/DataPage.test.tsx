import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../components/ToastProvider'
import { ApiError } from '../../lib/api'
import { actions, useDataOverview } from '../../lib/queries'
import type { DataOverview, DataSet } from '../../lib/types'
import { DataPage } from './DataPage'

vi.mock('../../lib/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/queries')>()),
  useDataOverview: vi.fn(),
}))

const set = (overrides: Partial<DataSet> & Pick<DataSet, 'key' | 'label'>): DataSet => ({
  group: 'lives',
  description: `About ${overrides.label}.`,
  tables: [overrides.key],
  ageFilter: null,
  count: 10,
  ...overrides,
})

const overview: DataOverview = {
  runningLives: 0,
  sets: [
    set({ key: 'follows', label: 'Follows', group: 'people', count: 0 }),
    set({ key: 'chat', label: 'Live chat', ageFilter: 'created', count: 1234, tables: ['chat_messages'] }),
    set({ key: 'blocks', label: 'Blocks', group: 'people', count: 3 }),
  ],
}

function showing(data: DataOverview) {
  vi.mocked(useDataOverview).mockReturnValue({
    data,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useDataOverview>)
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <DataPage />
      </ToastProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => vi.restoreAllMocks())

describe('DataPage', () => {
  it('shows how much of each kind is stored, by area, and only offers to remove what exists', () => {
    showing(overview)

    expect(screen.getByRole('heading', { name: 'People' })).toBeInTheDocument()
    expect(screen.getByText('1,234 rows')).toBeInTheDocument()
    expect(screen.getByText('chat_messages')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove follows' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove blocks' })).toBeEnabled()
  })

  it('removes only the older chat, after the password is typed again', async () => {
    const user = userEvent.setup()
    const clear = vi.spyOn(actions, 'clearData').mockResolvedValue({ removed: 120 })
    showing(overview)

    await user.click(screen.getByRole('button', { name: 'Remove live chat' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('radio', { name: 'Only older' }))
    const remove = within(dialog).getByRole('button', { name: 'Remove older' })
    expect(remove).toBeDisabled()

    await user.clear(within(dialog).getByLabelText(/Older than/))
    await user.type(within(dialog).getByLabelText(/Older than/), '90')
    await user.type(within(dialog).getByLabelText(/Your password/), 'my password 1')
    await user.click(remove)

    expect(clear).toHaveBeenCalledWith({ dataSet: 'chat', olderThanDays: 90, password: 'my password 1' })
    expect(await screen.findByText('Removed 120 rows of live chat.')).toBeInTheDocument()
  })

  it('removes everything of a kind that has no age to go by, and keeps the dialog open on a refusal', async () => {
    const user = userEvent.setup()
    const clear = vi
      .spyOn(actions, 'clearData')
      .mockRejectedValue(new ApiError(400, 'Your password is incorrect', 'WRONG_PASSWORD'))
    showing(overview)

    await user.click(screen.getByRole('button', { name: 'Remove blocks' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByRole('radio')).not.toBeInTheDocument()
    await user.type(within(dialog).getByLabelText(/Your password/), 'a wrong one 1')
    await user.click(within(dialog).getByRole('button', { name: 'Remove all' }))

    expect(clear).toHaveBeenCalledWith({ dataSet: 'blocks', olderThanDays: undefined, password: 'a wrong one 1' })
    expect(await within(dialog).findByText('Your password is incorrect')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('resets everything only once RESET and the password are typed, keeping what was picked', async () => {
    const user = userEvent.setup()
    const reset = vi.spyOn(actions, 'resetData').mockResolvedValue({ usersRemoved: 25 })
    showing(overview)

    await user.click(screen.getByRole('button', { name: 'Reset everything…' }))
    const dialog = screen.getByRole('dialog')
    const confirm = within(dialog).getByRole('button', { name: 'Reset everything' })
    await user.click(within(dialog).getByLabelText(/Keep the audit log/))
    await user.type(within(dialog).getByLabelText(/Your password/), 'my password 1')
    expect(confirm).toBeDisabled()

    await user.type(within(dialog).getByLabelText(/Type RESET/), 'RESET')
    await user.click(confirm)

    expect(reset).toHaveBeenCalledWith({ password: 'my password 1', keep: ['auditLog'] })
    expect(await screen.findByText('Everything is reset - 25 accounts removed.')).toBeInTheDocument()
  })
})
