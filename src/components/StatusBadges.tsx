import { Lock } from 'lucide-react'
import {
  ACTOR_ROLE_LABELS,
  ALERT_SEVERITY_LABELS,
  MESSAGE_STATUS_LABELS,
  ROLE_LABELS,
  STREAM_STATUS_LABELS,
  USER_STATUS_LABELS,
} from '../lib/labels'
import type {
  AlertSeverity,
  AuditActorRole,
  ChatModerationStatus,
  PlatformRole,
  StreamStatus,
  UserStatus,
} from '../lib/types'
import { Badge, type BadgeTone } from './ui/Badge'

export function StreamStatusBadge({ status }: { status: StreamStatus }) {
  if (status === 'LOCKED') {
    return (
      <Badge tone="warning" icon={<Lock />}>
        {STREAM_STATUS_LABELS.LOCKED}
      </Badge>
    )
  }
  const tone: BadgeTone = status === 'LIVE' ? 'danger' : status === 'SCHEDULED' ? 'info' : 'neutral'
  return (
    <Badge tone={tone} dot={status === 'LIVE'}>
      {STREAM_STATUS_LABELS[status]}
    </Badge>
  )
}

export function UserStatusBadge({ status }: { status: UserStatus }) {
  return (
    <Badge tone={status === 'ACTIVE' ? 'success' : 'danger'} dot>
      {USER_STATUS_LABELS[status]}
    </Badge>
  )
}

export function RoleBadge({ role, quiet = false }: { role: PlatformRole; quiet?: boolean }) {
  if (role === 'USER') return quiet ? <span className="text-zinc-500">{ROLE_LABELS.USER}</span> : <Badge>{ROLE_LABELS.USER}</Badge>
  return <Badge tone={role === 'SUPER_ADMIN' ? 'brand' : 'info'}>{ROLE_LABELS[role]}</Badge>
}

export function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  const tones: Record<AlertSeverity, BadgeTone> = { INFO: 'neutral', WARNING: 'warning', CRITICAL: 'danger' }
  return <Badge tone={tones[severity]}>{ALERT_SEVERITY_LABELS[severity]}</Badge>
}

export function MessageStatusBadge({ status }: { status: ChatModerationStatus }) {
  if (status === 'VISIBLE') return null
  return <Badge tone={status === 'DELETED' ? 'danger' : 'warning'}>{MESSAGE_STATUS_LABELS[status]}</Badge>
}

export function ActorRoleBadge({ role }: { role: AuditActorRole }) {
  const tones: Record<AuditActorRole, BadgeTone> = {
    SUPER_ADMIN: 'brand',
    PLATFORM_MODERATOR: 'info',
    HOST: 'neutral',
    MODERATOR: 'neutral',
    USER: 'neutral',
    SYSTEM: 'neutral',
  }
  return <Badge tone={tones[role]}>{ACTOR_ROLE_LABELS[role]}</Badge>
}
