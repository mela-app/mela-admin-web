import { getRouteApi } from '@tanstack/react-router'
import { Download, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { AuditSearch } from '../../app/search'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input, Select } from '../../components/ui/forms'
import { PageHeader } from '../../components/ui/misc'
import { SearchInput } from '../../components/ui/SearchInput'
import { download } from '../../lib/api'
import { auditQuery, useAuditCatalog, useStream, useUser } from '../../lib/queries'
import { useToast } from '../../lib/toast-context'
import type { AuditActorRole, AuditCategory } from '../../lib/types'
import { AuditTable } from './AuditTable'

const routeApi = getRouteApi('/_app/audit')

export function AuditPage() {
  const search = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const catalog = useAuditCatalog()
  const toast = useToast()
  const [exporting, setExporting] = useState(false)

  const update = (patch: Partial<AuditSearch>) =>
    void navigate({ search: (previous) => ({ ...previous, ...patch, page: undefined }) })

  const actions = (catalog.data?.actions ?? []).filter((action) => !search.category || action.category === search.category)
  const hasFilters = Object.entries(search).some(([key, value]) => key !== 'page' && key !== 'pageSize' && value !== undefined)

  async function exportCsv() {
    setExporting(true)
    try {
      const stamp = new Date().toISOString().slice(0, 10)
      await download('/admin/audit-logs/export', `audit-log-${stamp}.csv`, auditQuery(search))
      toast.success('Export downloaded. It holds up to 10,000 entries matching these filters.')
    } catch (error) {
      toast.error(error)
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every sign-in, change and moderation action on the platform, in the app and in this console. Entries can't be edited or deleted."
        actions={
          <Button icon={<Download />} loading={exporting} onClick={() => void exportCsv()}>
            Export CSV
          </Button>
        }
      />
      <Card flush>
        <div className="space-y-3 border-b border-zinc-200 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              className="w-full sm:w-96"
              value={search.q}
              onChange={(q) => update({ q })}
              placeholder="Search names, actions, reasons or IPs…"
              label="Search the audit log"
            />
            <Select
              aria-label="Category"
              className="w-44"
              value={search.category ?? ''}
              onChange={(event) =>
                update({ category: (event.target.value || undefined) as AuditCategory | undefined, action: undefined })
              }
            >
              <option value="">All categories</option>
              {catalog.data?.categories.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Action"
              className="w-56"
              value={search.action ?? ''}
              onChange={(event) => update({ action: event.target.value || undefined })}
            >
              <option value="">All actions</option>
              {actions.map((action) => (
                <option key={action.value} value={action.value}>
                  {action.label}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Done by"
              className="w-44"
              value={search.actorRole ?? ''}
              onChange={(event) => update({ actorRole: (event.target.value || undefined) as AuditActorRole | undefined })}
            >
              <option value="">Done by anyone</option>
              {catalog.data?.actorRoles.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </Select>
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                aria-label="From date"
                className="w-38"
                value={search.from ?? ''}
                max={search.to}
                onChange={(event) => update({ from: event.target.value || undefined })}
              />
              <span className="text-zinc-400" aria-hidden>
                –
              </span>
              <Input
                type="date"
                aria-label="To date"
                className="w-38"
                value={search.to ?? ''}
                min={search.from}
                onChange={(event) => update({ to: event.target.value || undefined })}
              />
            </div>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={() => void navigate({ search: {} })}>
                Clear all
              </Button>
            )}
          </div>
          <ScopeChips search={search} onRemove={update} />
        </div>
        <AuditTable
          search={search}
          onPageChange={(page) => void navigate({ search: (previous) => ({ ...previous, page: page > 1 ? page : undefined }) })}
          onPageSizeChange={(pageSize) =>
            void navigate({
              search: (previous) => ({ ...previous, pageSize: pageSize === 25 ? undefined : pageSize, page: undefined }),
            })
          }
        />
      </Card>
    </>
  )
}

function ScopeChips({ search, onRemove }: { search: AuditSearch; onRemove: (patch: Partial<AuditSearch>) => void }) {
  const chips: ReactNode[] = []
  if (search.userId) {
    chips.push(<UserChip key="user" prefix="Involving" userId={search.userId} onRemove={() => onRemove({ userId: undefined })} />)
  }
  if (search.actorId) {
    chips.push(<UserChip key="actor" prefix="Done by" userId={search.actorId} onRemove={() => onRemove({ actorId: undefined })} />)
  }
  if (search.streamId) {
    chips.push(<StreamChip key="stream" streamId={search.streamId} onRemove={() => onRemove({ streamId: undefined })} />)
  }
  if (search.targetType || search.targetId) {
    chips.push(
      <Chip key="target" onRemove={() => onRemove({ targetType: undefined, targetId: undefined })}>
        On {search.targetType?.toLowerCase() ?? 'item'} {search.targetId ? shortId(search.targetId) : ''}
      </Chip>,
    )
  }
  if (chips.length === 0) return null
  return <div className="flex flex-wrap gap-2">{chips}</div>
}

function UserChip({ prefix, userId, onRemove }: { prefix: string; userId: string; onRemove: () => void }) {
  const user = useUser(userId)
  return (
    <Chip onRemove={onRemove}>
      {prefix} {user.data ? `@${user.data.username}` : shortId(userId)}
    </Chip>
  )
}

function StreamChip({ streamId, onRemove }: { streamId: string; onRemove: () => void }) {
  const stream = useStream(streamId)
  return <Chip onRemove={onRemove}>In live “{stream.data?.title ?? shortId(streamId)}”</Chip>
}

function Chip({ children, onRemove }: { children: ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 py-0.5 pr-1 pl-2 text-xs font-medium text-zinc-700">
      {children}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove this filter"
        className="rounded p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
      >
        <X className="size-3" />
      </button>
    </span>
  )
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id
}
