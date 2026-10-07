import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../components/ToastProvider'
import { AuthContext, type Auth } from '../../lib/auth-context'
import { actions, useReport } from '../../lib/queries'
import type { AdminPermission, ReportCaseDetail } from '../../lib/types'
import { ReportCase } from './ReportCase'

vi.mock('../../lib/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/queries')>()),
  useReport: vi.fn(),
}))

const ana = { id: 'u-ana', username: 'ana', displayName: 'Ana', avatarUrl: null, status: 'ACTIVE' as const }
const ben = { id: 'u-ben', username: 'ben', displayName: 'Ben', avatarUrl: null, status: 'ACTIVE' as const }
const cal = { id: 'u-cal', username: 'cal', displayName: 'Cal', avatarUrl: null, status: 'ACTIVE' as const }

const chatCase = (overrides: Partial<ReportCaseDetail> = {}): ReportCaseDetail => ({
  id: 'case-1',
  targetType: 'CHAT_MESSAGE',
  targetId: 'm1',
  streamId: 's1',
  snapshot: { text: 'send me your password', sentAt: '2026-10-07T09:00:00.000Z', liveTitle: 'Poker night', person: ana },
  status: 'OPEN',
  urgent: false,
  reportCount: 2,
  lastReportedAt: '2026-10-07T09:05:00.000Z',
  createdAt: '2026-10-07T09:01:00.000Z',
  resolvedAt: null,
  resolutionNote: null,
  reportedUser: ana,
  resolvedBy: null,
  label: 'Chat message from @ana',
  reasons: [
    { reason: 'SCAM', count: 1 },
    { reason: 'SPAM', count: 1 },
  ],
  reports: [
    { id: 'r1', reason: 'SCAM', details: 'Asked everyone for passwords', createdAt: '2026-10-07T09:01:00.000Z', reporter: ben },
    { id: 'r2', reason: 'SPAM', details: null, createdAt: '2026-10-07T09:05:00.000Z', reporter: cal },
  ],
  targetExists: true,
  live: null,
  otherCases: 0,
  ...overrides,
})

function showing(found: ReportCaseDetail, permissions: AdminPermission[]) {
  vi.mocked(useReport).mockReturnValue({
    data: found,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useReport>)
  // No VIEW_USERS or VIEW_LIVES: names and lives show without links, so no router is needed.
  const auth = { can: (permission: AdminPermission) => permissions.includes(permission) } as Auth
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <AuthContext.Provider value={auth}>
          <ReportCase caseId={found.id} />
        </AuthContext.Provider>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => vi.restoreAllMocks())

describe('a reported case', () => {
  it('shows what was reported, by whom and why', () => {
    showing(chatCase(), ['VIEW_REPORTS'])

    expect(screen.getByRole('heading', { name: 'Chat message from @ana' })).toBeInTheDocument()
    expect(screen.getByText('send me your password')).toBeInTheDocument()
    expect(screen.getByText(/in the live “Poker night”/)).toBeInTheDocument()
    expect(screen.getByText('Scam or fraud')).toBeInTheDocument()
    expect(screen.getByText('“Asked everyone for passwords”')).toBeInTheDocument()
    expect(screen.getByText('Ben')).toBeInTheDocument()
    expect(screen.getByText('Cal')).toBeInTheDocument()
  })

  it('lets staff who may decide close it with a note - everyone who reported it is told', async () => {
    const user = userEvent.setup()
    const resolve = vi.spyOn(actions, 'resolveReport').mockResolvedValue(chatCase({ status: 'ACTIONED' }))
    showing(chatCase(), ['VIEW_REPORTS', 'MANAGE_REPORTS'])

    await user.type(screen.getByLabelText('Note for the team'), 'Deleted it, warned her')
    await user.click(screen.getByRole('button', { name: 'Action taken' }))

    expect(resolve).toHaveBeenCalledWith('case-1', 'ACTIONED', 'Deleted it, warned her')
    expect(await screen.findByText('Marked as action taken. The 2 people who reported it were told.')).toBeInTheDocument()
  })

  it('closes as no violation without a note', async () => {
    const user = userEvent.setup()
    const resolve = vi.spyOn(actions, 'resolveReport').mockResolvedValue(chatCase({ status: 'DISMISSED' }))
    showing(chatCase(), ['VIEW_REPORTS', 'MANAGE_REPORTS'])

    await user.click(screen.getByRole('button', { name: 'No violation' }))

    expect(resolve).toHaveBeenCalledWith('case-1', 'DISMISSED', undefined)
  })

  it('only shows the decision to staff who may only look', () => {
    showing(chatCase(), ['VIEW_REPORTS'])

    expect(screen.queryByRole('button', { name: 'Action taken' })).not.toBeInTheDocument()
    expect(screen.getByText(/you can see it, but not decide/)).toBeInTheDocument()
  })

  it("deletes the reported chat message for staff who manage lives, once it's confirmed", async () => {
    const user = userEvent.setup()
    const remove = vi.spyOn(actions, 'deleteMessages').mockResolvedValue({ deleted: 1 })
    showing(chatCase(), ['VIEW_REPORTS', 'MANAGE_LIVES'])

    await user.click(screen.getByRole('button', { name: 'Delete message' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete this chat message for good?' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete message' }))

    expect(remove).toHaveBeenCalledWith(['m1'])
  })

  it('removes a reported private message from the conversation', async () => {
    const user = userEvent.setup()
    const remove = vi.spyOn(actions, 'removeReportedMessage').mockResolvedValue({ removed: true })
    showing(
      chatCase({
        targetType: 'DIRECT_MESSAGE',
        targetId: 'dm-1',
        streamId: null,
        snapshot: { text: 'you will regret this', sentAt: '2026-10-07T09:00:00.000Z', person: ana },
        label: 'Private message from @ana',
      }),
      ['VIEW_REPORTS', 'MANAGE_REPORTS'],
    )
    expect(screen.getByText(/private: shown because it was reported/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove message' }))
    const dialog = screen.getByRole('dialog', { name: 'Remove this private message?' })
    await user.click(within(dialog).getByRole('button', { name: 'Remove message' }))

    expect(remove).toHaveBeenCalledWith('case-1')
    expect(await screen.findByText('Message removed from their conversation.')).toBeInTheDocument()
  })

  it("says when it's gone since, and offers no removing then", () => {
    showing(chatCase({ targetExists: false }), ['VIEW_REPORTS', 'MANAGE_LIVES', 'MANAGE_REPORTS'])

    expect(screen.getByText(/removed since/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete message' })).not.toBeInTheDocument()
  })

  it('a decided case shows the outcome and the note, not the decision', () => {
    showing(
      chatCase({
        status: 'DISMISSED',
        resolvedAt: '2026-10-07T10:00:00.000Z',
        resolvedBy: { ...ben, username: 'mod-ben' },
        resolutionNote: 'A joke between friends',
      }),
      ['VIEW_REPORTS', 'MANAGE_REPORTS'],
    )

    expect(screen.getByText(/By @mod-ben\./)).toBeInTheDocument()
    expect(screen.getByText(/Note: A joke between friends/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'No violation' })).not.toBeInTheDocument()
  })
})
