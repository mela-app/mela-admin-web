import { day, oneOf, pageSearch, text, type PageSearch } from '../lib/search'
import type {
  AuditActorRole,
  AuditCategory,
  BannedPhraseSeverity,
  PlatformRole,
  ReportTargetType,
  StreamStatus,
  UserStatus,
} from '../lib/types'

// What each page keeps in its URL. Every value is optional; a default stays
// out of the URL so links stay short.

const STREAM_STATUSES: readonly StreamStatus[] = ['LIVE', 'ENDED', 'LOCKED', 'SCHEDULED']
const USER_STATUSES: readonly UserStatus[] = ['ACTIVE', 'SUSPENDED']
const ROLES: readonly PlatformRole[] = ['USER', 'PLATFORM_MODERATOR', 'SUPER_ADMIN']
const ORDERS = ['asc', 'desc'] as const

export interface StreamsSearch extends PageSearch {
  q?: string
  status?: StreamStatus
  hostId?: string
  from?: string
  to?: string
  sort?: 'startedAt' | 'peakViewerCount' | 'likeCount'
  order?: 'asc' | 'desc'
}

export function streamsSearch(search: Record<string, unknown>): StreamsSearch {
  return {
    q: text(search.q, 100),
    status: oneOf(search.status, STREAM_STATUSES),
    hostId: text(search.hostId, 64),
    from: day(search.from),
    to: day(search.to),
    sort: oneOf(search.sort, ['peakViewerCount', 'likeCount'] as const),
    order: oneOf(search.order, ORDERS),
    ...pageSearch(search),
  }
}

export type StreamTab = 'chat' | 'activity' | 'people' | 'hosting'

export function streamSearch(search: Record<string, unknown>): { tab?: StreamTab } {
  return { tab: oneOf(search.tab, ['activity', 'people', 'hosting'] as const) }
}

export type CameraEffectsTab = 'effects' | 'makeup' | 'backgrounds' | 'beauty' | 'categories'

export function cameraEffectsSearch(search: Record<string, unknown>): { tab?: CameraEffectsTab } {
  return { tab: oneOf(search.tab, ['makeup', 'backgrounds', 'beauty', 'categories'] as const) }
}

export type HostingTab = 'waiting' | 'active' | 'ended' | 'all' | 'reasons'

export interface HostingSearch extends PageSearch {
  // None means the appeals waiting for the team.
  tab?: Exclude<HostingTab, 'waiting'>
  // A host's name or username.
  q?: string
  // The restriction open beside the list.
  restriction?: string
}

export function hostingSearch(search: Record<string, unknown>): HostingSearch {
  return {
    tab: oneOf(search.tab, ['active', 'ended', 'all', 'reasons'] as const),
    q: text(search.q, 100),
    restriction: text(search.restriction, 64),
    ...pageSearch(search),
  }
}

export interface UsersSearch extends PageSearch {
  q?: string
  status?: UserStatus
  role?: PlatformRole
  sort?: 'createdAt' | 'lastLoginAt' | 'username'
  order?: 'asc' | 'desc'
}

export function usersSearch(search: Record<string, unknown>): UsersSearch {
  return {
    q: text(search.q, 100),
    status: oneOf(search.status, USER_STATUSES),
    role: oneOf(search.role, ROLES),
    sort: oneOf(search.sort, ['lastLoginAt', 'username'] as const),
    order: oneOf(search.order, ORDERS),
    ...pageSearch(search),
  }
}

export type UserTab = 'activity' | 'lives' | 'sessions'

export function userSearch(search: Record<string, unknown>): { tab?: UserTab } {
  return { tab: oneOf(search.tab, ['lives', 'sessions'] as const) }
}

export interface AlertsSearch extends PageSearch {
  // Opens the composer aimed at this live.
  streamId?: string
}

export function alertsSearch(search: Record<string, unknown>): AlertsSearch {
  return { streamId: text(search.streamId, 64), ...pageSearch(search) }
}

export interface PhrasesSearch {
  q?: string
  severity?: BannedPhraseSeverity
}

export function phrasesSearch(search: Record<string, unknown>): PhrasesSearch {
  return { q: text(search.q, 100), severity: oneOf(search.severity, ['MASK', 'REJECT'] as const) }
}

export interface MessagesSearch extends PageSearch {
  // A local calendar day; none means today.
  day?: string
  q?: string
  userId?: string
  // The conversation open beside the list.
  conversation?: string
}

export function messagesSearch(search: Record<string, unknown>): MessagesSearch {
  return {
    day: day(search.day),
    q: text(search.q, 100),
    userId: text(search.userId, 64),
    conversation: text(search.conversation, 64),
    ...pageSearch(search),
  }
}

export interface LiveChatSearch extends PageSearch {
  // A local calendar day; none means today.
  day?: string
  q?: string
  // The host whose chat shows beside the list.
  host?: string
}

export function liveChatSearch(search: Record<string, unknown>): LiveChatSearch {
  return {
    day: day(search.day),
    q: text(search.q, 100),
    host: text(search.host, 64),
    ...pageSearch(search),
  }
}

export function appUpdatesSearch(search: Record<string, unknown>): PageSearch {
  return pageSearch(search)
}

const REPORT_TYPES: readonly ReportTargetType[] = ['LIVE', 'CHAT_MESSAGE', 'USER', 'DIRECT_MESSAGE']

export interface ReportsSearch extends PageSearch {
  // None means the open ones.
  status?: 'ACTIONED' | 'DISMISSED'
  type?: ReportTargetType
  // The case open beside the list.
  report?: string
}

export function reportsSearch(search: Record<string, unknown>): ReportsSearch {
  return {
    status: oneOf(search.status, ['ACTIONED', 'DISMISSED'] as const),
    type: oneOf(search.type, REPORT_TYPES),
    report: text(search.report, 64),
    ...pageSearch(search),
  }
}

const CATEGORIES: readonly AuditCategory[] = [
  'AUTH',
  'ACCOUNT',
  'STREAM',
  'CHAT',
  'MODERATION',
  'GUEST',
  'SOCIAL',
  'ALERT',
  'SETTINGS',
  'ADMIN',
]
const ACTOR_ROLES: readonly AuditActorRole[] = ['SUPER_ADMIN', 'PLATFORM_MODERATOR', 'HOST', 'MODERATOR', 'USER', 'SYSTEM']

export interface AuditSearch extends PageSearch {
  q?: string
  category?: AuditCategory
  action?: string
  actorRole?: AuditActorRole
  actorId?: string
  userId?: string
  targetType?: string
  targetId?: string
  streamId?: string
  from?: string
  to?: string
}

export function auditSearch(search: Record<string, unknown>): AuditSearch {
  return {
    q: text(search.q, 200),
    category: oneOf(search.category, CATEGORIES),
    action: text(search.action, 80),
    actorRole: oneOf(search.actorRole, ACTOR_ROLES),
    actorId: text(search.actorId, 64),
    userId: text(search.userId, 64),
    targetType: text(search.targetType, 20),
    targetId: text(search.targetId, 64),
    streamId: text(search.streamId, 64),
    from: day(search.from),
    to: day(search.to),
    ...pageSearch(search),
  }
}

/** Only a path on this site - never a full URL someone put in a link. */
export function safeRedirect(value: unknown): string | undefined {
  const target = text(value, 500)
  if (!target || !target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) return undefined
  if (target.startsWith('/login') || target.startsWith('/change-password')) return undefined
  return target
}
