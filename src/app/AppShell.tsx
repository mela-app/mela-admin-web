import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import {
  Database,
  Flag,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  MessageSquareText,
  MessagesSquare,
  Radio,
  ScrollText,
  Settings,
  ShieldBan,
  ShieldOff,
  ShieldUser,
  Smartphone,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../lib/auth-context'
import { cn } from '../lib/cn'
import { formatCompact } from '../lib/format'
import { ROLE_LABELS } from '../lib/labels'
import { useOverview } from '../lib/queries'
import { useToast } from '../lib/toast-context'
import type { AdminPermission } from '../lib/types'
import { MelaLogo } from '../components/brand/MelaLogo'
import { ConfirmDialog } from '../components/ui/Dialog'
import { Avatar } from '../components/ui/misc'
import { IconButton } from '../components/ui/Button'

type NavTarget =
  | '/'
  | '/streams'
  | '/chat'
  | '/users'
  | '/staff'
  | '/app-updates'
  | '/hosting'
  | '/reports'
  | '/alerts'
  | '/phrases'
  | '/audit'
  | '/messages'
  | '/data'

interface NavItem {
  to: NavTarget
  label: string
  icon: LucideIcon
  count?: number
  // The count in red: something waits that shouldn't.
  urgent?: boolean
  // Hidden from staff without it (the page itself refuses them too).
  needs?: AdminPermission
  superAdminOnly?: boolean
}

export function AppShell() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  // The page the small-screen menu was opened on: going anywhere closes it.
  const [menuPath, setMenuPath] = useState<string | null>(null)
  const menuOpen = menuPath === pathname
  const closeMenu = () => setMenuPath(null)

  return (
    <div className="min-h-dvh lg:pl-60">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-white px-3 py-2 font-medium shadow focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-zinc-200 bg-white lg:flex">
        <Sidebar />
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-zinc-900/40"
            onClick={closeMenu}
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 border-r border-zinc-200 bg-white shadow-xl">
            <Sidebar />
            <IconButton label="Close menu" className="absolute top-3 right-2" onClick={closeMenu}>
              <X />
            </IconButton>
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-zinc-200 bg-white px-4 lg:hidden">
        <IconButton label="Open menu" onClick={() => setMenuPath(pathname)}>
          <Menu />
        </IconButton>
        <Brand />
      </header>

      <main id="main" className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Outlet />
      </main>
    </div>
  )
}

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-3">
      <MelaLogo className="h-8 w-auto" />
      <span aria-hidden className="h-7 w-px bg-zinc-200" />
      <span className="text-[11px] leading-tight font-medium tracking-wide text-zinc-500 uppercase">
        Admin
        <br />
        console
      </span>
    </Link>
  )
}

function Sidebar() {
  const auth = useAuth()
  const overview = useOverview()
  const liveCount = overview.data?.live.streams
  const reports = overview.data?.reports

  const sections: Array<{ label: string; items: NavItem[] }> = [
    {
      label: 'Monitor',
      items: [
        { to: '/', label: 'Overview', icon: LayoutDashboard },
        { to: '/streams', label: 'Lives', icon: Radio, count: liveCount, needs: 'VIEW_LIVES' },
        { to: '/chat', label: 'Live chat', icon: MessageSquareText, needs: 'VIEW_LIVES' },
      ],
    },
    {
      label: 'Manage',
      items: [
        { to: '/users', label: 'Users', icon: Users, needs: 'VIEW_USERS' },
        { to: '/staff', label: 'Staff', icon: ShieldUser },
        { to: '/app-updates', label: 'App updates', icon: Smartphone, needs: 'VIEW_APP_RELEASES' },
      ],
    },
    {
      label: 'Safety',
      items: [
        {
          to: '/reports',
          label: 'Reports',
          icon: Flag,
          count: reports?.open,
          urgent: (reports?.urgent ?? 0) > 0,
          needs: 'VIEW_REPORTS',
        },
        {
          to: '/hosting',
          label: 'Hosting restrictions',
          icon: ShieldOff,
          count: overview.data?.hosting?.waitingAppeals,
          needs: 'VIEW_HOSTING_RESTRICTIONS',
        },
        { to: '/alerts', label: 'Alerts', icon: Megaphone, needs: 'VIEW_ALERTS' },
        { to: '/phrases', label: 'Banned phrases', icon: ShieldBan, needs: 'VIEW_PHRASES' },
      ],
    },
    {
      label: 'Records',
      items: [
        { to: '/audit', label: 'Audit log', icon: ScrollText, needs: 'VIEW_AUDIT_LOG' },
        { to: '/messages', label: 'Private messages', icon: MessagesSquare, needs: 'VIEW_PRIVATE_MESSAGES' },
      ],
    },
    {
      label: 'System',
      items: [{ to: '/data', label: 'Data', icon: Database, superAdminOnly: true }],
    },
  ]
  const visible = sections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => (!item.needs || auth.can(item.needs)) && (!item.superAdminOnly || auth.isSuperAdmin),
      ),
    }))
    .filter((section) => section.items.length > 0)

  return (
    <div className="flex w-full flex-col">
      <div className="flex h-14 shrink-0 items-center border-b border-zinc-200 px-4">
        <Brand />
      </div>
      <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {visible.map((section) => (
          <div key={section.label}>
            <p className="px-2 pb-1.5 text-[11px] font-medium tracking-wide text-zinc-400 uppercase">{section.label}</p>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink item={item} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <AccountBlock />
    </div>
  )
}

function NavLink({ item }: { item: NavItem }) {
  const Icon = item.icon
  return (
    <Link
      to={item.to}
      activeOptions={{ exact: item.to === '/' }}
      className={cn(
        'group flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] font-medium text-zinc-600',
        'hover:bg-zinc-100 hover:text-zinc-900',
        'data-[status=active]:bg-zinc-100 data-[status=active]:text-zinc-900',
      )}
    >
      <Icon
        className="size-4 shrink-0 text-zinc-400 group-hover:text-zinc-600 group-data-[status=active]:text-brand-600"
        strokeWidth={1.9}
        aria-hidden
      />
      <span className="flex-1 truncate">{item.label}</span>
      {item.count !== undefined && item.count > 0 && (
        <span
          className={cn(
            'rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums',
            item.urgent ? 'bg-red-600 text-white' : 'bg-zinc-200/70 text-zinc-700',
          )}
        >
          {formatCompact(item.count)}
        </span>
      )}
    </Link>
  )
}

function AccountBlock() {
  const auth = useAuth()
  const toast = useToast()
  const [confirming, setConfirming] = useState(false)
  const admin = auth.admin
  if (!admin) return null
  return (
    <div className="flex items-center gap-2.5 border-t border-zinc-200 p-3">
      <Avatar name={admin.displayName} url={admin.avatarUrl} size="md" />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-[13px] font-medium text-zinc-900">{admin.displayName}</p>
        <p className="truncate text-xs text-zinc-500">{ROLE_LABELS[admin.platformRole]}</p>
      </div>
      <Link
        to="/account"
        aria-label="Account settings"
        title="Account settings"
        className="inline-flex size-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 data-[status=active]:bg-zinc-100 data-[status=active]:text-zinc-900"
      >
        <Settings className="size-4" />
      </Link>
      <IconButton label="Sign out" onClick={() => setConfirming(true)}>
        <LogOut />
      </IconButton>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Sign out of the console?"
        description="You'll need your email and password to sign in again. Every tab in this browser signs out; your other devices stay signed in."
        confirmLabel="Sign out"
        onConfirm={() => auth.signOut().then(() => toast.show('You have signed out.'))}
      />
    </div>
  )
}
