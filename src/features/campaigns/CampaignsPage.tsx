import { getRouteApi } from '@tanstack/react-router'
import type { CampaignsTab } from '../../app/search'
import { PageHeader, Tabs } from '../../components/ui/misc'
import { BannersPanel } from './BannersPanel'
import { FeaturedHostsPanel } from './FeaturedHostsPanel'
import { PushCampaignsPanel } from './PushCampaignsPanel'

const routeApi = getRouteApi('/_app/campaigns')

/**
 * Reaching many people at once (docs/features/campaigns.md): pushes to an
 * audience, banners in the app, and hosts featured on For You.
 */
export function CampaignsPage() {
  const search = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const tab = search.tab ?? 'push'

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Reach many people at once: a push to their phones, a banner in the app, or a host featured on For You. Everything here is in the audit log."
      />
      <div className="mb-6">
        <Tabs<CampaignsTab>
          label="Campaign kinds"
          value={tab}
          onChange={(next) => void navigate({ search: { tab: next === 'push' ? undefined : next }, replace: true })}
          tabs={[
            { value: 'push', label: 'Push notifications' },
            { value: 'banners', label: 'In-app banners' },
            { value: 'featured', label: 'Featured hosts' },
          ]}
        />
      </div>
      {tab === 'push' && <PushCampaignsPanel />}
      {tab === 'banners' && <BannersPanel />}
      {tab === 'featured' && <FeaturedHostsPanel />}
    </>
  )
}
