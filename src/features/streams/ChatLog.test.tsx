import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../components/ToastProvider'
import { AuthContext, type Auth } from '../../lib/auth-context'
import { actions, useChatLog } from '../../lib/queries'
import type { AdminPermission, ChatLogEntry } from '../../lib/types'
import { ChatLog } from './ChatLog'

vi.mock('../../lib/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/queries')>()),
  useChatLog: vi.fn(),
}))

const message = (id: string, username: string, text: string): ChatLogEntry => ({
  id,
  text,
  imageUrl: null,
  moderationStatus: 'VISIBLE',
  flaggedReason: null,
  createdAt: '2026-10-07T09:00:00.000Z',
  user: { id: `user-${username}`, username, displayName: username, avatarUrl: null },
})

function showing(messages: ChatLogEntry[], permissions: AdminPermission[]) {
  vi.mocked(useChatLog).mockReturnValue({
    data: { pages: [{ items: messages, nextCursor: null }] },
    isPending: false,
    isError: false,
    hasNextPage: false,
  } as unknown as ReturnType<typeof useChatLog>)
  const auth = { can: (permission: AdminPermission) => permissions.includes(permission) } as Auth
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <AuthContext.Provider value={auth}>
          <ChatLog streamId="s1" hostId="user-host" live={false} />
        </AuthContext.Provider>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

const chat = [message('m1', 'ana', 'first'), message('m2', 'ben', 'second'), message('m3', 'cal', 'third')]

afterEach(() => vi.restoreAllMocks())

describe('picking chat messages to delete', () => {
  it('deletes the picked ones for good, all at once', async () => {
    const user = userEvent.setup()
    const remove = vi.spyOn(actions, 'deleteMessages').mockResolvedValue({ deleted: 2 })
    showing(chat, ['VIEW_LIVES', 'MANAGE_LIVES'])

    await user.click(screen.getByRole('checkbox', { name: 'Pick the message from @ana' }))
    await user.click(screen.getByRole('checkbox', { name: 'Pick the message from @cal' }))
    expect(screen.getByText('2 picked')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete 2 messages' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete 2 messages for good?' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete 2 messages' }))

    expect(remove).toHaveBeenCalledWith(['m1', 'm3'])
    expect(await screen.findByText('Deleted 2 messages for good.')).toBeInTheDocument()
    expect(screen.getByText('Pick all 3 shown')).toBeInTheDocument()
  })

  it('picks every message shown at once, and lets go of them again', async () => {
    const user = userEvent.setup()
    showing(chat, ['VIEW_LIVES', 'MANAGE_LIVES'])

    await user.click(screen.getByRole('checkbox', { name: 'Pick all 3 shown' }))
    expect(screen.getByRole('button', { name: 'Delete 3 messages' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByText('Pick all 3 shown')).toBeInTheDocument()
  })

  it('offers no picking to staff who may only read chat', () => {
    showing(chat, ['VIEW_LIVES'])

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })
})
