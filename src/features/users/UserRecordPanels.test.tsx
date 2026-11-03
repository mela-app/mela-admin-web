import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../components/ToastProvider'
import { AuthContext, type Auth } from '../../lib/auth-context'
import { actions, useUserBlocks, useUserNotes, useUserReports } from '../../lib/queries'
import type { UserDetail, UserNote } from '../../lib/types'
import { UserBlocksPanel, UserNotesPanel, UserReportsPanel } from './UserRecordPanels'

vi.mock('../../lib/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/queries')>()),
  useUserReports: vi.fn(),
  useUserBlocks: vi.fn(),
  useUserNotes: vi.fn(),
}))

const loaded = <T,>(data: T) =>
  ({ data, isPending: false, isError: false, error: null, refetch: vi.fn() }) as never

const user = {
  id: 'u1',
  username: 'ana',
  displayName: 'Ana',
  safety: {
    reportsAgainst: { open: 1, actioned: 1, dismissed: 0 },
    reportsMade: 3,
    restrictions: { total: 0, inForce: 0 },
    blocked: 0,
    blockedBy: 7,
    notes: 1,
  },
} as UserDetail

const person = (id: string, username: string) => ({
  id,
  username,
  displayName: username.toUpperCase(),
  avatarUrl: null,
  status: 'ACTIVE' as const,
})

function auth(adminId: string, isSuperAdmin = false): Auth {
  return {
    admin: { id: adminId } as Auth['admin'],
    isSuperAdmin,
    can: () => true,
  } as unknown as Auth
}

async function showing(ui: ReactNode, value: Auth = auth('staff-1')) {
  const rootRoute = createRootRoute({ component: () => ui })
  const routes = ['/reports', '/hosting', '/users/$userId'].map((path) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => null }),
  )
  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthContext.Provider value={value}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
  await router.load()
}

afterEach(() => vi.restoreAllMocks())

describe('UserRecordPanels', () => {
  it('lists the reports about them, each opening its case', async () => {
    vi.mocked(useUserReports).mockReturnValue(
      loaded({
        items: [
          {
            id: 'c1',
            status: 'OPEN',
            urgent: true,
            label: 'Chat message from @ana',
            reasons: [{ reason: 'HARASSMENT', count: 2 }],
            reportCount: 2,
            lastReportedAt: '2026-11-02T10:00:00Z',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 10,
      }),
    )
    await showing(<UserReportsPanel user={user} />)

    expect(screen.getByRole('radio', { name: 'About them (2)' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Sent by them (3)' })).toBeInTheDocument()
    const row = screen.getByRole('link', { name: /Chat message from @ana/ })
    expect(row).toHaveAttribute('href', '/reports?report=c1')
    expect(within(row).getByText('Urgent')).toBeInTheDocument()
  })

  it('shows who blocked them', async () => {
    vi.mocked(useUserBlocks).mockReturnValue(
      loaded({
        items: [{ id: 'b1', createdAt: '2026-11-01T10:00:00Z', person: person('u9', 'sam') }],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    )
    await showing(<UserBlocksPanel user={user} />)

    expect(screen.getByRole('radio', { name: 'Blocked them (7)' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /@sam/ })).toHaveAttribute('href', '/users/u9')
  })

  it('adds a note, and offers to remove only your own', async () => {
    const add = vi.spyOn(actions, 'addUserNote').mockResolvedValue({} as UserNote)
    vi.mocked(useUserNotes).mockReturnValue(
      loaded({
        items: [
          { id: 'n1', text: 'Mine', createdAt: '2026-11-01T10:00:00Z', author: person('staff-1', 'me') },
          { id: 'n2', text: 'Theirs', createdAt: '2026-11-01T09:00:00Z', author: person('staff-2', 'kebede') },
        ],
      }),
    )
    await showing(<UserNotesPanel userId="u1" />)
    const u = userEvent.setup()

    expect(screen.getAllByRole('button', { name: 'Remove note' })).toHaveLength(1)
    await u.type(screen.getByLabelText('New note'), '  Warned on Telegram  ')
    await u.click(screen.getByRole('button', { name: 'Add note' }))

    expect(add).toHaveBeenCalledWith('u1', 'Warned on Telegram')
  })

  it("lets a super admin remove anyone's note", async () => {
    vi.mocked(useUserNotes).mockReturnValue(
      loaded({
        items: [{ id: 'n2', text: 'Theirs', createdAt: '2026-11-01T09:00:00Z', author: person('staff-2', 'kebede') }],
      }),
    )
    await showing(<UserNotesPanel userId="u1" />, auth('boss', true))

    expect(screen.getByRole('button', { name: 'Remove note' })).toBeInTheDocument()
  })
})
