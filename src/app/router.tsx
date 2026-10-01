import type { QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
} from '@tanstack/react-router'
import type { Auth } from '../lib/auth-context'
import type { AdminPermission } from '../lib/types'
import { ChangePasswordPage } from '../features/account/ChangePasswordPage'
import { LoginPage } from '../features/auth/LoginPage'
import { OverviewPage } from '../features/overview/OverviewPage'
import { AppShell } from './AppShell'
import { NoAccessPage, NotFoundPage, RouteErrorPage, RoutePending } from './RouteStates'
import {
  alertsSearch,
  auditSearch,
  messagesSearch,
  phrasesSearch,
  safeRedirect,
  streamSearch,
  streamsSearch,
  userSearch,
  usersSearch,
} from './search'

export interface RouterContext {
  auth: Auth
  queryClient: QueryClient
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: NotFoundPage,
})

// A signed-in visitor is sent on by the page itself, to where they were going.
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({ redirect: safeRedirect(search.redirect) }),
  component: LoginPage,
})

// A temporary password (seeded or staff-created) must be replaced before anything else.
const changePasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/change-password',
  beforeLoad: ({ context }) => {
    if (context.auth.status !== 'authenticated') throw redirect({ to: '/login' })
    if (!context.auth.admin?.passwordChangeRequired) throw redirect({ to: '/' })
  },
  component: ChangePasswordPage,
})

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_app',
  beforeLoad: ({ context, location }) => {
    if (context.auth.status !== 'authenticated') {
      throw redirect({ to: '/login', search: location.href === '/' ? {} : { redirect: location.href } })
    }
    if (context.auth.admin?.passwordChangeRequired) throw redirect({ to: '/change-password' })
  },
  component: AppShell,
})

const overviewRoute = createRoute({ getParentRoute: () => appRoute, path: '/', component: OverviewPage })

const noAccessRoute = createRoute({ getParentRoute: () => appRoute, path: '/no-access', component: NoAccessPage })

// Checked before the page loads anything; the API refuses the same requests anyway.
function needs(permission: AdminPermission) {
  return ({ context }: { context: RouterContext }) => {
    if (!context.auth.can(permission)) throw redirect({ to: '/no-access', replace: true })
  }
}

// Each page below is its own chunk, fetched on first visit (or on hovering a link to it).
const streamsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/streams',
  validateSearch: streamsSearch,
  beforeLoad: needs('VIEW_LIVES'),
  component: lazyRouteComponent(() => import('../features/streams/StreamsPage'), 'StreamsPage'),
})

const streamRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/streams/$streamId',
  validateSearch: streamSearch,
  beforeLoad: needs('VIEW_LIVES'),
  component: lazyRouteComponent(() => import('../features/streams/StreamDetailPage'), 'StreamDetailPage'),
})

const usersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/users',
  validateSearch: usersSearch,
  beforeLoad: needs('VIEW_USERS'),
  component: lazyRouteComponent(() => import('../features/users/UsersPage'), 'UsersPage'),
})

const userRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/users/$userId',
  validateSearch: userSearch,
  beforeLoad: needs('VIEW_USERS'),
  component: lazyRouteComponent(() => import('../features/users/UserDetailPage'), 'UserDetailPage'),
})

const alertsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/alerts',
  validateSearch: alertsSearch,
  beforeLoad: needs('VIEW_ALERTS'),
  component: lazyRouteComponent(() => import('../features/alerts/AlertsPage'), 'AlertsPage'),
})

const phrasesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/phrases',
  validateSearch: phrasesSearch,
  beforeLoad: needs('VIEW_PHRASES'),
  component: lazyRouteComponent(() => import('../features/phrases/PhrasesPage'), 'PhrasesPage'),
})

const auditRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/audit',
  validateSearch: auditSearch,
  beforeLoad: needs('VIEW_AUDIT_LOG'),
  component: lazyRouteComponent(() => import('../features/audit/AuditPage'), 'AuditPage'),
})

const messagesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/messages',
  validateSearch: messagesSearch,
  beforeLoad: needs('VIEW_PRIVATE_MESSAGES'),
  component: lazyRouteComponent(() => import('../features/messages/MessagesPage'), 'MessagesPage'),
})

const staffRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/staff',
  component: lazyRouteComponent(() => import('../features/staff/StaffPage'), 'StaffPage'),
})

const accountRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/account',
  component: lazyRouteComponent(() => import('../features/account/AccountPage'), 'AccountPage'),
})

const routeTree = rootRoute.addChildren([
  loginRoute,
  changePasswordRoute,
  appRoute.addChildren([
    overviewRoute,
    noAccessRoute,
    streamsRoute,
    streamRoute,
    usersRoute,
    userRoute,
    alertsRoute,
    phrasesRoute,
    auditRoute,
    messagesRoute,
    staffRoute,
    accountRoute,
  ]),
])

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    // Filled in by <RouterProvider context> once the session is known.
    context: { auth: undefined!, queryClient },
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: RouteErrorPage,
    defaultPendingComponent: RoutePending,
    scrollRestoration: true,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
