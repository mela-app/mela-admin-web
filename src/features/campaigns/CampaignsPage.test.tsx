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
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../components/ToastProvider'
import { AuthContext, type Auth } from '../../lib/auth-context'
import {
  actions,
  useAnnouncements,
  useAudienceSize,
  useCampaigns,
  useFeaturedHosts,
  useUsers,
} from '../../lib/queries'
import type { AdminPermission, PushCampaign } from '../../lib/types'
import { appPathOf, audienceText, bannerState } from './campaign-format'
import { CampaignsPage } from './CampaignsPage'

vi.mock('../../lib/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/queries')>()),
  useCampaigns: vi.fn(),
  useAudienceSize: vi.fn(),
  useAnnouncements: vi.fn(),
  useFeaturedHosts: vi.fn(),
  useUsers: vi.fn(),
}))

const loaded = <T,>(data: T) =>
  ({ data, isPending: false, isError: false, error: null, refetch: vi.fn() }) as never

const sent: PushCampaign = {
  id: 'c1',
  title: 'Big live tonight',
  body: 'Join at 20:00',
  openPath: null,
  audience: { platform: 'ANDROID', hostsOnly: true },
  status: 'SENT',
  scheduledAt: '2026-11-02T17:00:00Z',
  sentAt: '2026-11-02T17:00:05Z',
  recipientCount: 400,
  openCount: 60,
  openRate: 15,
  failureReason: null,
  createdAt: '2026-11-02T16:59:00Z',
  createdBy: { id: 's1', username: 'kebede', displayName: 'Kebede' },
}

async function showing(tab: string, permissions: AdminPermission[] = ['VIEW_CAMPAIGNS', 'MANAGE_CAMPAIGNS']) {
  vi.mocked(useCampaigns).mockReturnValue(loaded({ items: [sent], total: 1, page: 1, pageSize: 25 }))
  vi.mocked(useAudienceSize).mockReturnValue(loaded({ count: 1234 }))
  vi.mocked(useAnnouncements).mockReturnValue(loaded({ items: [], total: 0, page: 1, pageSize: 25 }))
  vi.mocked(useFeaturedHosts).mockReturnValue(loaded({ items: [] }))
  vi.mocked(useUsers).mockReturnValue(loaded({ items: [], total: 0, page: 1, pageSize: 6 }))
  const rootRoute = createRootRoute()
  const app = createRoute({ getParentRoute: () => rootRoute, id: '_app' })
  const routes = [
    createRoute({ getParentRoute: () => app, path: '/campaigns', component: CampaignsPage }),
    createRoute({ getParentRoute: () => app, path: '/users/$userId', component: () => null }),
    createRoute({ getParentRoute: () => app, path: '/streams/$streamId', component: () => null }),
  ]
  const router = createRouter({
    routeTree: rootRoute.addChildren([app.addChildren(routes)]),
    history: createMemoryHistory({ initialEntries: [`/campaigns${tab}`] }),
  })
  const auth = { can: (permission: AdminPermission) => permissions.includes(permission) } as unknown as Auth
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthContext.Provider value={auth}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
  await router.load()
}

afterEach(() => vi.restoreAllMocks())

describe('CampaignsPage', () => {
  it('shows how many opened a sent campaign, and whom it was for', async () => {
    await showing('')

    expect(await screen.findByText('Big live tonight')).toBeInTheDocument()
    expect(screen.getByText('15% opened')).toBeInTheDocument()
    expect(screen.getByText('60 of 400')).toBeInTheDocument()
    expect(screen.getByText(/Android · hosts · by @kebede/)).toBeInTheDocument()
  })

  it('sends a push to an audience after showing how many it reaches', async () => {
    const create = vi.spyOn(actions, 'createCampaign').mockResolvedValue(sent)
    await showing('')
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText(/^Title/), 'Hello hosts')
    await user.type(screen.getByLabelText(/^Message/), 'New studio effects are out')
    await user.type(screen.getByLabelText(/^Opens/), 'https://mela.live/live/0f9e4a1e-1111-4a3b-9c8d-123456789abc')
    await user.click(screen.getByLabelText(/Only hosts/))
    expect(screen.getByText('1,234')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Send…' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Send to 1,234 people now?')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Send now' }))

    expect(create).toHaveBeenCalledWith({
      title: 'Hello hosts',
      body: 'New studio effects are out',
      openPath: '/live/0f9e4a1e-1111-4a3b-9c8d-123456789abc',
      audience: { hostsOnly: true },
    })
 
    // Types several fields: slower than most.
  }, 15_000)

  it('only shows campaigns to staff who may not send them', async () => {
    await showing('', ['VIEW_CAMPAIGNS'])

    expect(await screen.findByText('View only')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send…' })).not.toBeInTheDocument()
  })

  it('publishes a banner', async () => {
    const save = vi.spyOn(actions, 'saveAnnouncement').mockResolvedValue({} as never)
    await showing('?tab=banners')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'New banner' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText(/^Title/), 'Maintenance tonight')
    await user.type(within(dialog).getByLabelText(/^Message/), 'From 22:00 for 30 minutes')
    await user.click(within(dialog).getByRole('button', { name: 'Publish' }))

    expect(save).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ title: 'Maintenance tonight', tone: 'INFO', dismissible: true, endsAt: null }),
    )
  })
})

describe('campaign wording', () => {
  it('describes an audience', () => {
    expect(audienceText({})).toBe('Everyone')
    expect(audienceText({ appVersions: ['1.0.3'], inactiveForDays: 14 })).toBe('version 1.0.3 · not seen for 14 days')
  })

  it('reads a live or profile out of a share link', () => {
    const id = '0f9e4a1e-1111-4a3b-9c8d-123456789abc'
    expect(appPathOf(`https://mela.live/profile/${id}?ref=x`)).toBe(`/profile/${id}`)
    expect(appPathOf('https://example.com/settings')).toBeNull()
  })

  it("tells a banner's state", () => {
    const now = new Date('2026-11-03T12:00:00Z')
    expect(bannerState({ startsAt: '2026-11-03T10:00:00Z', endsAt: null }, now)).toBe('showing')
    expect(bannerState({ startsAt: '2026-11-04T10:00:00Z', endsAt: null }, now)).toBe('upcoming')
    expect(bannerState({ startsAt: '2026-11-01T10:00:00Z', endsAt: '2026-11-02T10:00:00Z' }, now)).toBe('ended')
  })
})
