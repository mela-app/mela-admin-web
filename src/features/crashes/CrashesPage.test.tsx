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
import { crashesSearch } from '../../app/search'
import { ToastProvider } from '../../components/ToastProvider'
import { AuthContext, type Auth } from '../../lib/auth-context'
import { actions, useCrashGroups, useCrashReports } from '../../lib/queries'
import type { AdminPermission, CrashGroup, CrashReport } from '../../lib/types'
import { CrashesPage } from './CrashesPage'

vi.mock('../../lib/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/queries')>()),
  useCrashGroups: vi.fn(),
  useCrashReports: vi.fn(),
}))

const loaded = <T,>(data: T) =>
  ({ data, isPending: false, isFetching: false, isError: false, error: null, refetch: vi.fn() }) as never

const group: CrashGroup = {
  signature: 'abcdef0123456789',
  kind: 'JAVA_CRASH',
  fatal: true,
  message: 'java.lang.IllegalStateException: release() called on an object with refcount < 1',
  count: 21,
  users: 4,
  firstSeen: '2026-11-24T16:20:41Z',
  lastSeen: '2026-11-24T16:37:46Z',
  versions: ['1.0.17'],
  devices: ['TECNO TECNO CL6k'],
}

const report: CrashReport = {
  id: '0190f0a0-0000-7000-8000-000000000001',
  kind: 'JAVA_CRASH',
  fatal: true,
  message: group.message,
  stack: null,
  breadcrumbs: ['2026-11-24T16:37:42.309Z app start'],
  platform: 'ANDROID',
  appVersion: '1.0.17',
  appBuild: 27,
  deviceModel: 'TECNO TECNO CL6k',
  osVersion: 'Android 16 (API 36)',
  occurredAt: '2026-11-24T16:37:46Z',
  user: null,
}

function showing(path: string, permissions: AdminPermission[]) {
  vi.mocked(useCrashGroups).mockReturnValue(
    loaded({
      items: [group],
      total: 1,
      page: 1,
      pageSize: 25,
      totals: { reports: 21, fatal: 21, users: 4 },
      days: [],
      versions: ['1.0.17'],
    }),
  )
  vi.mocked(useCrashReports).mockReturnValue(loaded({ items: [report], total: 2, page: 1, pageSize: 10 }))
  const rootRoute = createRootRoute()
  const app = createRoute({ getParentRoute: () => rootRoute, id: '_app' })
  const routes = [
    createRoute({ getParentRoute: () => app, path: '/crashes', validateSearch: crashesSearch, component: CrashesPage }),
    createRoute({ getParentRoute: () => app, path: '/users/$userId', component: () => null }),
  ]
  const router = createRouter({
    routeTree: rootRoute.addChildren([app.addChildren(routes)]),
    history: createMemoryHistory({ initialEntries: [path] }),
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
}

afterEach(() => vi.restoreAllMocks())

describe('CrashesPage removing crashes', () => {
  it('removes a crash with all its reports after confirming', async () => {
    const remove = vi.spyOn(actions, 'deleteCrash').mockResolvedValue({ removed: 21 })
    const user = userEvent.setup()
    showing('/crashes', ['VIEW_APP_RELEASES', 'MANAGE_APP_RELEASES'])

    await user.click(await screen.findByRole('button', { name: 'Remove this crash' }))
    const dialog = await screen.findByRole('dialog', { name: 'Remove this crash?' })
    expect(within(dialog).getByText(/All 21 reports of it/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Remove crash' }))

    expect(remove).toHaveBeenCalledWith('abcdef0123456789')
  })

  it('removes one report from an open crash', async () => {
    const remove = vi.spyOn(actions, 'deleteCrashReport').mockResolvedValue({ removed: 1 })
    const user = userEvent.setup()
    showing('/crashes?crash=abcdef0123456789', ['VIEW_APP_RELEASES', 'MANAGE_APP_RELEASES'])

    await user.click(await screen.findByRole('button', { name: 'Remove this report' }))
    const dialog = await screen.findByRole('dialog', { name: 'Remove this report?' })
    await user.click(within(dialog).getByRole('button', { name: 'Remove report' }))

    expect(remove).toHaveBeenCalledWith(report.id)
  })

  it('offers no removing to staff who only view releases', async () => {
    showing('/crashes?crash=abcdef0123456789', ['VIEW_APP_RELEASES'])

    expect(await screen.findAllByText(/refcount < 1/)).not.toHaveLength(0)
    expect(screen.queryByRole('button', { name: /Remove this/ })).not.toBeInTheDocument()
  })
})
