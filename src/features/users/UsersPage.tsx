import { getRouteApi, useNavigate } from '@tanstack/react-router'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import { Users } from 'lucide-react'
import { useMemo } from 'react'
import type { UsersSearch } from '../../app/search'
import { PersonLink } from '../../components/PersonLink'
import { RoleBadge, UserStatusBadge } from '../../components/StatusBadges'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { DataTable, Pagination } from '../../components/ui/DataTable'
import { EmptyState } from '../../components/ui/feedback'
import { Select } from '../../components/ui/forms'
import { PageHeader, RelativeTime } from '../../components/ui/misc'
import { SearchInput } from '../../components/ui/SearchInput'
import { formatDate, formatNumber } from '../../lib/format'
import { useUsers } from '../../lib/queries'
import { DEFAULT_PAGE_SIZE } from '../../lib/search'
import type { PlatformRole, UserRow, UserStatus } from '../../lib/types'

const routeApi = getRouteApi('/_app/users')

export function UsersPage() {
  const search = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const goTo = useNavigate()
  const users = useUsers(search)
  const columns = useMemo(() => userColumns(), [])

  const update = (patch: Partial<UsersSearch>) =>
    void navigate({ search: (previous) => ({ ...previous, ...patch, page: undefined }) })
  const sortId = search.sort ?? 'createdAt'
  const sorting: SortingState = [
    { id: sortId, desc: (search.order ?? (sortId === 'username' ? 'asc' : 'desc')) === 'desc' },
  ]
  const filtered = Boolean(search.q || search.status || search.role)

  return (
    <>
      <PageHeader
        title="Users"
        description="Every account on the platform. Search by name, username, email address or account ID."
      />
      <Card flush>
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 p-4">
          <SearchInput
            className="w-full sm:w-96"
            value={search.q}
            onChange={(q) => update({ q })}
            placeholder="Search name, username, email or ID…"
            label="Search users"
          />
          <Select
            aria-label="Status"
            className="w-40"
            value={search.status ?? ''}
            onChange={(event) => update({ status: (event.target.value || undefined) as UserStatus | undefined })}
          >
            <option value="">Any status</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
          </Select>
          <Select
            aria-label="Role"
            className="w-48"
            value={search.role ?? ''}
            onChange={(event) => update({ role: (event.target.value || undefined) as PlatformRole | undefined })}
          >
            <option value="">Any role</option>
            <option value="USER">Users</option>
            <option value="PLATFORM_MODERATOR">Platform moderators</option>
            <option value="SUPER_ADMIN">Super admins</option>
          </Select>
          {filtered && (
            <Button variant="ghost" size="sm" onClick={() => update({ q: undefined, status: undefined, role: undefined })}>
              Clear filters
            </Button>
          )}
        </div>
        <DataTable
          label="Users"
          columns={columns}
          data={users.data?.items}
          getRowId={(row) => row.id}
          loading={users.isFetching}
          error={users.error}
          onRetry={() => void users.refetch()}
          onRowClick={(row) => void goTo({ to: '/users/$userId', params: { userId: row.id } })}
          sorting={sorting}
          onSortingChange={(next) => {
            const first = next[0]
            if (!first) return
            const id = first.id as NonNullable<UsersSearch['sort']> | 'createdAt'
            const natural = id === 'username' ? 'asc' : 'desc'
            const order = first.desc ? 'desc' : 'asc'
            update({ sort: id === 'createdAt' ? undefined : id, order: order === natural ? undefined : order })
          }}
          empty={
            <EmptyState
              icon={<Users />}
              title="No accounts found"
              description={filtered ? 'Try a different search or fewer filters.' : 'Accounts appear here once people sign up.'}
            />
          }
        />
        {users.data && users.data.total > 0 && (
          <Pagination
            page={search.page ?? 1}
            pageSize={search.pageSize ?? DEFAULT_PAGE_SIZE}
            total={users.data.total}
            onPageChange={(page) => void navigate({ search: (previous) => ({ ...previous, page: page > 1 ? page : undefined }) })}
            onPageSizeChange={(pageSize) =>
              void navigate({
                search: (previous) => ({ ...previous, pageSize: pageSize === 25 ? undefined : pageSize, page: undefined }),
              })
            }
          />
        )}
      </Card>
    </>
  )
}

function userColumns(): Array<ColumnDef<UserRow>> {
  return [
    {
      id: 'username',
      header: 'Account',
      accessorFn: (row) => row.username,
      cell: ({ row }) => <PersonLink person={row.original} />,
    },
    {
      id: 'email',
      header: 'Email',
      enableSorting: false,
      cell: ({ row }) => <span className="text-zinc-700">{row.original.email}</span>,
    },
    {
      id: 'role',
      header: 'Role',
      enableSorting: false,
      cell: ({ row }) => <RoleBadge role={row.original.platformRole} quiet />,
    },
    {
      id: 'status',
      header: 'Status',
      enableSorting: false,
      cell: ({ row }) => <UserStatusBadge status={row.original.status} />,
    },
    {
      id: 'streams',
      header: 'Lives',
      enableSorting: false,
      meta: { align: 'right' },
      cell: ({ row }) => formatNumber(row.original.streamCount),
    },
    {
      id: 'followers',
      header: 'Followers',
      enableSorting: false,
      meta: { align: 'right' },
      cell: ({ row }) => formatNumber(row.original.followerCount),
    },
    {
      id: 'createdAt',
      header: 'Joined',
      accessorFn: (row) => row.createdAt,
      cell: ({ row }) => <span className="whitespace-nowrap text-zinc-700">{formatDate(row.original.createdAt)}</span>,
    },
    {
      id: 'lastLoginAt',
      header: 'Last sign-in',
      accessorFn: (row) => row.lastLoginAt,
      cell: ({ row }) => <RelativeTime value={row.original.lastLoginAt} className="whitespace-nowrap text-zinc-700" />,
    },
  ]
}
