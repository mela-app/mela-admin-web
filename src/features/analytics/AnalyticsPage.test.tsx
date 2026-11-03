import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type Auth } from '../../lib/auth-context'
import { useAnalytics } from '../../lib/queries'
import type { AnalyticsOverview } from '../../lib/types'
import { analyticsCsv, rangeEnding } from './analytics-data'
import { AnalyticsPage } from './AnalyticsPage'

vi.mock('../../lib/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/queries')>()),
  useAnalytics: vi.fn(),
}))

const data: AnalyticsOverview = {
  from: '2026-10-05',
  to: '2026-11-03',
  trackingSince: '2026-11-01',
  totals: {
    users: 1200,
    newUsers: 85,
    lives: 40,
    liveMinutes: 1500,
    viewerMinutes: 12_000,
    installs: 60,
    dailyActive: 210,
    weeklyActive: 640,
    monthlyActive: 900,
    stickiness: 23.3,
    monthlyByPlatform: [{ platform: 'ANDROID', users: 900 }],
  },
  days: [
    { day: '2026-11-02', newUsers: 3, activeUsers: 200, lives: 2, liveMinutes: 90, viewerMinutes: 400, installs: 2 },
    { day: '2026-11-03', newUsers: 4, activeUsers: 210, lives: 1, liveMinutes: 30, viewerMinutes: 100, installs: 1 },
  ],
  retention: [{ week: '2026-10-26', size: 40, d1: 55, d7: null, d30: null }],
  topHosts: [
    {
      host: { id: 'h1', username: 'ana', displayName: 'Ana', avatarUrl: null },
      lives: 5,
      viewerMinutes: 6000,
      viewers: 300,
      likes: 900,
      peakViewers: 80,
    },
  ],
  installSources: [
    { source: 'shared_live', count: 45 },
    { source: 'play_store', count: 15 },
  ],
}

async function showing() {
  vi.mocked(useAnalytics).mockReturnValue({
    data,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useAnalytics>)
  const rootRoute = createRootRoute()
  const app = createRoute({ getParentRoute: () => rootRoute, id: '_app' })
  const routes = [
    createRoute({ getParentRoute: () => app, path: '/analytics', component: AnalyticsPage }),
    createRoute({ getParentRoute: () => app, path: '/users/$userId', component: () => null }),
  ]
  const router = createRouter({
    routeTree: rootRoute.addChildren([app.addChildren(routes)]),
    history: createMemoryHistory({ initialEntries: ['/analytics'] }),
  })
  const auth = { can: () => true, isSuperAdmin: true } as unknown as Auth
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthContext.Provider value={auth}>
        <RouterProvider router={router} />
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
  await router.load()
}

afterEach(() => vi.restoreAllMocks())

describe('AnalyticsPage', () => {
  it('shows active users, coming back, where installs come from and the hosts watched most', async () => {
    await showing()

    expect(await screen.findByText('Active today')).toBeInTheDocument()
    expect(screen.getByText('Active today').parentElement).toHaveTextContent('210')
    expect(screen.getByText('23.3% of them come on a given day')).toBeInTheDocument()
    expect(screen.getByText(/Active users are counted from/)).toBeInTheDocument()

    const retention = screen.getByRole('columnheader', { name: 'Next day' }).closest('table')!
    expect(within(retention).getByText('55%')).toBeInTheDocument()

    expect(screen.getByText('A shared live')).toBeInTheDocument()
    expect(screen.getByText('45 · 75%')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ana/ })).toHaveAttribute('href', '/users/h1')
    expect(screen.getByText('100 h')).toBeInTheDocument()
  })
})

describe('the analytics data', () => {
  it('is the last N UTC days, today included', () => {
    expect(rangeEnding(7, new Date('2026-11-03T22:00:00Z'))).toEqual({ from: '2026-10-28', to: '2026-11-03' })
  })

  it('exports a row a day', () => {
    expect(analyticsCsv(data).split('\n')).toEqual([
      'Day (UTC),Active users,New accounts,Installs,Lives started,Minutes live,Minutes watched',
      '2026-11-02,200,3,2,2,90,400',
      '2026-11-03,210,4,1,1,30,100',
      '',
    ])
  })
})
