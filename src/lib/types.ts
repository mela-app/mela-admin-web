// Shapes of the admin API's responses (mela-backend: src/admin). Dates arrive as ISO strings.

export type PlatformRole = 'USER' | 'PLATFORM_MODERATOR' | 'SUPER_ADMIN'
export type StaffRole = Exclude<PlatformRole, 'USER'>
// What a platform moderator may do, as a super admin chose; a super admin has them all.
export type AdminPermission =
  | 'VIEW_LIVES'
  | 'MANAGE_LIVES'
  | 'VIEW_USERS'
  | 'MANAGE_USERS'
  | 'VIEW_ALERTS'
  | 'SEND_ALERTS'
  | 'SEND_GLOBAL_ALERTS'
  | 'VIEW_PHRASES'
  | 'MANAGE_PHRASES'
  | 'VIEW_AUDIT_LOG'
  | 'VIEW_PRIVATE_MESSAGES'
  | 'VIEW_APP_RELEASES'
  | 'MANAGE_APP_RELEASES'
  | 'VIEW_REPORTS'
  | 'MANAGE_REPORTS'
export type UserStatus = 'ACTIVE' | 'SUSPENDED'
export type SessionPlatform = 'ANDROID' | 'IOS' | 'WEB' | 'UNKNOWN'
export type StreamStatus = 'SCHEDULED' | 'LIVE' | 'ENDED' | 'LOCKED'
export type StreamEndReason = 'HOST_ENDED' | 'HOST_DISCONNECTED' | 'REPLACED' | 'LOCKED'
export type StreamLayout = 'FULL' | 'FIT' | 'SPLIT' | 'FLOATING' | 'MINIMAL'
export type VideoProviderKind = 'AGORA' | 'LIVEKIT'
export type ChatModerationStatus = 'VISIBLE' | 'HIDDEN' | 'DELETED'
export type ModeratorCapability =
  | 'DELETE_MESSAGES'
  | 'PIN_MESSAGES'
  | 'MUTE_CHAT'
  | 'BAN_USERS'
  | 'MANAGE_GUEST_REQUESTS'
  | 'REMOVE_GUESTS'
  | 'FORCE_MUTE_GUESTS'
  | 'ARRANGE_GUESTS'
export type BannedPhraseSeverity = 'REJECT' | 'MASK'
export type AlertScope = 'GLOBAL' | 'STREAM'
export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL'
export type AuditCategory =
  | 'AUTH'
  | 'ACCOUNT'
  | 'STREAM'
  | 'CHAT'
  | 'MODERATION'
  | 'GUEST'
  | 'SOCIAL'
  | 'ALERT'
  | 'SETTINGS'
  | 'ADMIN'
export type AuditActorRole = 'SUPER_ADMIN' | 'PLATFORM_MODERATOR' | 'HOST' | 'MODERATOR' | 'USER' | 'SYSTEM'
export type AppPlatform = 'ANDROID' | 'IOS'
export type ReportTargetType = 'LIVE' | 'CHAT_MESSAGE' | 'USER' | 'DIRECT_MESSAGE'
export type ReportReason =
  | 'SPAM'
  | 'SCAM'
  | 'HARASSMENT'
  | 'HATE'
  | 'VIOLENCE'
  | 'SEXUAL_CONTENT'
  | 'CHILD_SAFETY'
  | 'SELF_HARM'
  | 'ILLEGAL'
  | 'IMPERSONATION'
  | 'OTHER'
export type ReportCaseStatus = 'OPEN' | 'ACTIONED' | 'DISMISSED'

export interface Page<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface Person {
  id: string
  username: string
  displayName: string
  avatarUrl?: string | null
}

export interface AdminView {
  id: string
  username: string
  email: string
  displayName: string
  avatarUrl: string | null
  platformRole: PlatformRole
  permissions: AdminPermission[]
  passwordChangeRequired: boolean
}

export interface SignInResponse {
  accessToken: string
  admin: AdminView
}

// A running live the alert composer offers; reach is how many devices are in it now.
export interface AlertTarget {
  id: string
  title: string
  host: Person
  reach: number
}

export interface DeviceSession {
  id: string
  platform: SessionPlatform
  createdAt: string
  lastSeenAt: string
  current?: boolean
}

export interface Overview {
  generatedAt: string
  live: {
    streams: number
    viewers: number
    top: Array<{
      id: string
      title: string
      category: string | null
      startedAt: string
      viewerCount: number
      host: Person
    }>
  }
  users: { total: number; new24h: number; suspended: number }
  activity24h: { messages: number; streamsStarted: number; alertsSent: number }
  daily: Array<{ day: string; streams: number; signups: number }>
  // Null for staff who can't see reports.
  reports: { open: number; urgent: number } | null
}

export interface StreamRow {
  id: string
  title: string
  category: string | null
  status: StreamStatus
  startedAt: string
  endedAt: string | null
  endedReason: StreamEndReason | null
  peakViewerCount: number
  likeCount: number
  videoProvider: VideoProviderKind
  lockedAt: string | null
  host: Person
  viewerCount: number | null
}

export interface StreamDetail extends Omit<StreamRow, 'viewerCount'> {
  layout: StreamLayout
  channelName: string
  lockedReason: string | null
  lockedBy: Person | null
  viewerCount: number | null
  paused: boolean
  counts: { messages: number; removedMessages: number; roomBans: number }
  guests: Array<{
    status: 'ACTIVE' | 'REMOVED'
    active: boolean
    joinedAt: string
    leftAt: string | null
    micForceMuted: boolean
    user: Person
  }>
  moderators: Array<{
    status: 'ACTIVE' | 'REVOKED'
    active: boolean
    capabilities: ModeratorCapability[]
    grantedAt: string
    revokedAt: string | null
    user: Person
  }>
}

export interface ChatLogEntry {
  id: string
  // With a photo, its caption - maybe empty.
  text: string
  // The host's photo.
  imageUrl: string | null
  moderationStatus: ChatModerationStatus
  flaggedReason: string | null
  createdAt: string
  user: Person
}

export interface ChatLogPage {
  items: ChatLogEntry[]
  nextCursor: string | null
}

export interface UserRow {
  id: string
  username: string
  displayName: string
  email: string
  avatarUrl: string | null
  platformRole: PlatformRole
  status: UserStatus
  createdAt: string
  lastLoginAt: string | null
  suspendedAt: string | null
  streamCount: number
  followerCount: number
}

export interface UserDetail extends Omit<UserRow, 'streamCount' | 'followerCount'> {
  bio: string | null
  suspensionReason: string | null
  passwordChangeRequired: boolean
  // Empty for app users.
  permissions: AdminPermission[]
  counts: {
    streams: number
    followers: number
    following: number
    messages: number
    sessions: number
    blockedBy: number
  }
  liveStream: { id: string; title: string; startedAt: string } | null
}

export interface StaffMember {
  id: string
  username: string
  displayName: string
  email: string
  avatarUrl: string | null
  platformRole: StaffRole
  permissions: AdminPermission[]
  status: UserStatus
  createdAt: string
  lastLoginAt: string | null
  passwordChangeRequired: boolean
}

export interface AdminAlert {
  id: string
  scope: AlertScope
  message: string
  severity: AlertSeverity
  recipientCount: number
  createdAt: string
  createdBy: Person | null
  stream: { id: string; title: string; status: StreamStatus } | null
}

export interface BannedPhrase {
  id: string
  phrase: string
  severity: BannedPhraseSeverity
  createdAt: string
  creator: Person | null
}

export interface PhraseTestResult {
  matches: Array<{ phrase: string; severity: BannedPhraseSeverity }>
  outcome: 'ALLOWED' | 'MASKED' | 'REJECTED'
  delivered: string | null
}

export interface AuditEntry {
  id: string
  category: AuditCategory
  categoryLabel: string
  action: string
  actionLabel: string
  actorId: string | null
  actorRole: AuditActorRole
  actorLabel: string | null
  targetType: string | null
  targetId: string | null
  targetLabel: string | null
  streamId: string | null
  reason: string | null
  metadata: Record<string, unknown> | null
  ip: string | null
  userAgent: string | null
  createdAt: string
}

export interface AuditCatalog {
  categories: Array<{ value: AuditCategory; label: string }>
  actions: Array<{ value: string; label: string; category: AuditCategory }>
  actorRoles: Array<{ value: AuditActorRole; label: string }>
}

// Direct messages between users - who wrote to whom, without the text.
export interface PrivateConversationRow {
  id: string
  people: [Person, Person]
  // In the range asked for.
  messageCount: number
  firstMessageAt: string
  lastMessageAt: string
}

export interface PrivateConversationPage extends Page<PrivateConversationRow> {
  messageCount: number
}

export interface PrivateMessage {
  id: string
  senderId: string
  text: string
  createdAt: string
  readAt: string | null
}

// Opening one is recorded in the audit log.
export interface PrivateTranscript {
  id: string
  people: [Person, Person]
  messages: PrivateMessage[]
  nextCursor: string | null
}

// Live chat a day at a time: the hosts whose lives had chat that day.
export interface LiveChatHostRow {
  host: Person
  liveCount: number
  messageCount: number
  firstMessageAt: string
  lastMessageAt: string
}

export interface LiveChatHostPage extends Page<LiveChatHostRow> {
  messageCount: number
}

export interface LiveChatLive {
  id: string
  title: string
  category: string | null
  status: StreamStatus
  startedAt: string
  endedAt: string | null
  // Matching messages that day.
  messageCount: number
}

export interface LiveChatEntry extends ChatLogEntry {
  streamId: string
}

// One host's chat that day, oldest first, across their lives.
export interface HostChat {
  host: Person
  lives: LiveChatLive[]
  messages: LiveChatEntry[]
  nextCursor: string | null
}

export interface AppRelease {
  id: string
  platform: AppPlatform
  // What phones compare, as people see it in the store (1.2.0).
  version: string
  // Only on releases published before versions were compared.
  build: number | null
  notes: string
  // A link of its own, on those same older releases; null: the store.
  downloadUrl: string | null
  required: boolean
  createdAt: string
  updatedAt: string
  publishedBy: Person | null
}

export interface AppPlatformStatus {
  latest: AppRelease | null
  // Versions below this one can't be used.
  required: AppRelease | null
  // Where phones get updates: Google Play, or the App Store - null until there's a listing.
  storeLink: string | null
  // The next patch version, to start the form with.
  suggestedVersion: string
}

export interface AppReleasePage extends Page<AppRelease> {
  platforms: Record<AppPlatform, AppPlatformStatus>
}

export type DataGroup = 'people' | 'lives' | 'messages' | 'console'
// 'created': only what's older than some days; 'lastUsed': only devices unused for some days.
export type DataAgeFilter = 'created' | 'lastUsed'
// What a reset can leave in place.
export type KeepOnReset = 'appUpdates' | 'bannedPhrases' | 'auditLog'

export interface DataSet {
  key: string
  group: DataGroup
  label: string
  description: string
  tables: string[]
  ageFilter: DataAgeFilter | null
  count: number
}

export interface DataOverview {
  runningLives: number
  sets: DataSet[]
}

// Someone in a report, and whether their account is suspended.
export interface ReportPerson extends Person {
  status: UserStatus
}

// What was reported, as it was when first reported - kept after it's removed.
export interface ReportSnapshot {
  // Whose it is: the host, the sender, the account.
  person?: Person
  // A live.
  title?: string
  category?: string | null
  startedAt?: string | null
  // A chat or private message.
  text?: string
  imageUrl?: string | null
  sentAt?: string
  liveTitle?: string
  // An account.
  bio?: string | null
}

// One reported thing, however many people reported it.
export interface ReportCaseRow {
  id: string
  targetType: ReportTargetType
  targetId: string
  streamId: string | null
  snapshot: ReportSnapshot
  status: ReportCaseStatus
  // Child safety or self-harm: first in the list.
  urgent: boolean
  reportCount: number
  lastReportedAt: string
  createdAt: string
  resolvedAt: string | null
  resolutionNote: string | null
  reportedUser: ReportPerson | null
  resolvedBy: ReportPerson | null
  // e.g. "Chat message from @ana".
  label: string
  // Most often first.
  reasons: Array<{ reason: ReportReason; count: number }>
}

export interface ReportCaseDetail extends ReportCaseRow {
  reports: Array<{
    id: string
    reason: ReportReason
    details: string | null
    createdAt: string
    reporter: ReportPerson | null
  }>
  // False once it was removed, or the account deleted.
  targetExists: boolean
  live: { id: string; title: string; status: StreamStatus } | null
  // Other cases about the same account.
  otherCases: number
}
