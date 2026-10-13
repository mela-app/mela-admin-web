import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../components/ToastProvider'
import { AuthContext, type Auth } from '../../lib/auth-context'
import { actions, useHostingRestriction } from '../../lib/queries'
import type { AdminPermission, HostingRestrictionDetail } from '../../lib/types'
import { RestrictionView } from './RestrictionView'

vi.mock('../../lib/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/queries')>()),
  useHostingRestriction: vi.fn(),
}))

const host = { id: 'u-ana', username: 'ana', displayName: 'Ana', avatarUrl: null }
const staff = { id: 'u-sam', username: 'sam', displayName: 'Sam', avatarUrl: null }

const restriction = (overrides: Partial<HostingRestrictionDetail> = {}): HostingRestrictionDetail => ({
  id: 'r1',
  title: 'Insulting viewers in your live',
  message: 'You repeatedly insulted viewers in chat.',
  note: 'Second time this month',
  endsAt: null,
  liftedAt: null,
  appealState: 'WAITING_STAFF',
  keptAt: null,
  createdAt: '2026-10-12T09:00:00.000Z',
  updatedAt: '2026-10-12T10:00:00.000Z',
  status: 'ACTIVE',
  messageCount: 1,
  hostCanWriteFrom: null,
  user: host,
  stream: { id: 's1', title: 'Bingo night', startedAt: '2026-10-12T08:00:00.000Z', status: 'ENDED' },
  createdBy: staff,
  liftedBy: null,
  reason: null,
  messages: [
    {
      id: 'm1',
      fromStaff: false,
      text: 'It was a joke between friends, sorry.',
      imageUrls: ['https://cdn.example.com/hosting-appeals/r1/a.jpg'],
      createdAt: '2026-10-12T10:00:00.000Z',
      author: host,
    },
  ],
  history: [],
  ...overrides,
})

function showing(found: HostingRestrictionDetail, permissions: AdminPermission[]) {
  vi.mocked(useHostingRestriction).mockReturnValue({
    data: found,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useHostingRestriction>)
  // No VIEW_USERS or VIEW_LIVES: names and lives show without links, so no router is needed.
  const auth = { can: (permission: AdminPermission) => permissions.includes(permission) } as Auth
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <AuthContext.Provider value={auth}>
          <RestrictionView restrictionId={found.id} />
        </AuthContext.Provider>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => vi.restoreAllMocks())

describe('a hosting restriction', () => {
  it("shows what the host was told, the team's note and the appeal with its picture", () => {
    showing(restriction(), ['VIEW_HOSTING_RESTRICTIONS'])

    expect(screen.getByRole('heading', { name: 'Insulting viewers in your live' })).toBeInTheDocument()
    expect(screen.getByText('You repeatedly insulted viewers in chat.')).toBeInTheDocument()
    expect(screen.getByText('Second time this month')).toBeInTheDocument()
    expect(screen.getByText('It was a joke between friends, sorry.')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'A picture the host sent' })).toBeInTheDocument()
    expect(screen.getByText('Bingo night')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Lift/ })).not.toBeInTheDocument()
  })

  it('keeps it with an answer to the host', async () => {
    const user = userEvent.setup()
    const answer = vi.spyOn(actions, 'answerAppeal').mockResolvedValue(restriction({ appealState: 'KEPT' }))
    showing(restriction(), ['VIEW_HOSTING_RESTRICTIONS', 'MANAGE_HOSTING_RESTRICTIONS'])

    await user.type(screen.getByLabelText('Your message'), 'The recording shows otherwise.')
    await user.click(screen.getByRole('button', { name: 'Keep restriction' }))

    expect(answer).toHaveBeenCalledWith('r1', 'KEEP', 'The recording shows otherwise.')
  })

  it('needs words before keeping it or asking for more', async () => {
    const user = userEvent.setup()
    const answer = vi.spyOn(actions, 'answerAppeal')
    showing(restriction(), ['VIEW_HOSTING_RESTRICTIONS', 'MANAGE_HOSTING_RESTRICTIONS'])

    await user.click(screen.getByRole('button', { name: 'Ask for more' }))

    expect(answer).not.toHaveBeenCalled()
    expect(screen.getByText('Write your answer to the host first.')).toBeInTheDocument()
  })

  it('lifts it, a word to the host optional', async () => {
    const user = userEvent.setup()
    const lift = vi.spyOn(actions, 'liftRestriction').mockResolvedValue(restriction({ status: 'LIFTED' }))
    showing(restriction(), ['VIEW_HOSTING_RESTRICTIONS', 'MANAGE_HOSTING_RESTRICTIONS'])

    await user.click(screen.getByRole('button', { name: 'Lift - they can host again' }))

    expect(lift).toHaveBeenCalledWith('r1', undefined)
  })

  it('offers nothing to do once it ended', () => {
    showing(restriction({ status: 'LIFTED', liftedAt: '2026-10-12T11:00:00.000Z', liftedBy: staff }), [
      'VIEW_HOSTING_RESTRICTIONS',
      'MANAGE_HOSTING_RESTRICTIONS',
    ])

    expect(screen.getByText('Lifted')).toBeInTheDocument()
    expect(screen.queryByLabelText('Your message')).not.toBeInTheDocument()
  })
})
