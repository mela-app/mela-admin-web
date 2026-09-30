import { accessSummary } from '../lib/permissions'
import type { AdminPermission, PlatformRole } from '../lib/types'
import { Badge } from './ui/Badge'

interface AccessSummaryProps {
  role: PlatformRole
  permissions: AdminPermission[]
  /** One line per area with what it allows, instead of short badges. */
  detailed?: boolean
}

/** What a staff member may do in the console, as a super admin set it. */
export function AccessSummary({ role, permissions, detailed = false }: AccessSummaryProps) {
  if (role === 'SUPER_ADMIN') {
    return detailed ? (
      <p className="text-sm text-zinc-700">Everything, including adding staff and choosing what each moderator can do.</p>
    ) : (
      <Badge tone="brand">Everything</Badge>
    )
  }
  const areas = accessSummary(permissions)
  if (areas.length === 0) return <span className="text-[13px] text-zinc-500">No access yet</span>
  if (!detailed) {
    return (
      <span className="flex flex-wrap gap-1">
        {areas.map(({ area, level }) => (
          <Badge key={area.key} tone="neutral">
            {area.label}: {level.label.toLowerCase()}
          </Badge>
        ))}
      </span>
    )
  }
  return (
    <ul className="space-y-2.5">
      {areas.map(({ area, level }) => (
        <li key={area.key} className="text-sm leading-snug">
          <span className="font-medium text-zinc-900">
            {area.label} <span className="font-normal text-zinc-500">· {level.label}</span>
          </span>
          <span className="block text-xs text-zinc-500">{level.description}</span>
        </li>
      ))}
    </ul>
  )
}
