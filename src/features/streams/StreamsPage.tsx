import { getRouteApi } from '@tanstack/react-router'
import type { StreamsSearch } from '../../app/search'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/forms'
import { PageHeader, Tabs } from '../../components/ui/misc'
import { SearchInput } from '../../components/ui/SearchInput'
import { useOverview } from '../../lib/queries'
import type { StreamStatus } from '../../lib/types'
import { StreamsTable } from './StreamsTable'

const routeApi = getRouteApi('/_app/streams')

type StatusTab = 'ALL' | StreamStatus

export function StreamsPage() {
  const search = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const overview = useOverview()

  const update = (patch: Partial<StreamsSearch>) =>
    void navigate({ search: (previous) => ({ ...previous, ...patch, page: undefined }) })
  const filtered = Boolean(search.q || search.from || search.to || search.hostId)

  return (
    <>
      <PageHeader
        title="Lives"
        description="Every live on the platform, running or over. Open one to read its chat, see who was on stage, or stop it."
      />
      <Card flush>
        <div className="px-4 pt-3">
          <Tabs<StatusTab>
            label="Status"
            value={search.status ?? 'ALL'}
            onChange={(status) => update({ status: status === 'ALL' ? undefined : status })}
            tabs={[
              { value: 'ALL', label: 'All' },
              { value: 'LIVE', label: 'Live now', count: overview.data?.live.streams },
              { value: 'LOCKED', label: 'Locked' },
              { value: 'ENDED', label: 'Ended' },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 p-4">
          <SearchInput
            className="w-full sm:w-96"
            value={search.q}
            onChange={(q) => update({ q })}
            placeholder="Search host, title or ID…"
            label="Search lives"
          />
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] text-zinc-500">Started</span>
            <Input
              type="date"
              aria-label="Started on or after"
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
              aria-label="Started on or before"
              className="w-38"
              value={search.to ?? ''}
              min={search.from}
              onChange={(event) => update({ to: event.target.value || undefined })}
            />
          </div>
          {filtered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => update({ q: undefined, from: undefined, to: undefined, hostId: undefined })}
            >
              Clear filters
            </Button>
          )}
        </div>
        <StreamsTable
          search={search}
          onPageChange={(page) => void navigate({ search: (previous) => ({ ...previous, page: page > 1 ? page : undefined }) })}
          onPageSizeChange={(pageSize) =>
            void navigate({
              search: (previous) => ({ ...previous, pageSize: pageSize === 25 ? undefined : pageSize, page: undefined }),
            })
          }
          onSortChange={(sort, order) => update({ sort, order })}
          emptyText={search.status === 'LIVE' ? 'Nobody is live right now.' : undefined}
        />
      </Card>
    </>
  )
}
