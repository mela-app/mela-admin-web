import type {
  AlertSeverity,
  AppPlatform,
  AuditActorRole,
  BannedPhraseSeverity,
  ChatModerationStatus,
  ModeratorCapability,
  PlatformRole,
  ReportCaseStatus,
  ReportReason,
  ReportTargetType,
  SessionPlatform,
  StreamEndReason,
  StreamLayout,
  StreamStatus,
  UserStatus,
  VideoProviderKind,
} from './types'

// What the console calls each server value - one place, so every page agrees.

export const ROLE_LABELS: Record<PlatformRole, string> = {
  USER: 'User',
  PLATFORM_MODERATOR: 'Platform moderator',
  SUPER_ADMIN: 'Super admin',
}

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
}

export const STREAM_STATUS_LABELS: Record<StreamStatus, string> = {
  SCHEDULED: 'Scheduled',
  LIVE: 'Live',
  ENDED: 'Ended',
  LOCKED: 'Locked',
}

export const END_REASON_LABELS: Record<StreamEndReason, string> = {
  HOST_ENDED: 'Ended by the host',
  HOST_DISCONNECTED: 'Host lost connection',
  REPLACED: 'Host went live again',
  LOCKED: 'Locked by staff',
}

export const LAYOUT_LABELS: Record<StreamLayout, string> = {
  FULL: 'Full screen',
  FIT: 'Fit',
  SPLIT: 'Split',
  FLOATING: 'Floating',
  MINIMAL: 'Minimal',
}

export const PROVIDER_LABELS: Record<VideoProviderKind, string> = {
  AGORA: 'Agora',
  LIVEKIT: 'LiveKit',
}

export const MESSAGE_STATUS_LABELS: Record<ChatModerationStatus, string> = {
  VISIBLE: 'Visible',
  HIDDEN: 'Hidden by filter',
  DELETED: 'Deleted',
}

export const CAPABILITY_LABELS: Record<ModeratorCapability, string> = {
  DELETE_MESSAGES: 'Delete messages',
  PIN_MESSAGES: 'Pin messages',
  MUTE_CHAT: 'Mute in chat',
  BAN_USERS: 'Ban viewers',
  MANAGE_GUEST_REQUESTS: 'Stage requests',
  REMOVE_GUESTS: 'Remove guests',
  FORCE_MUTE_GUESTS: 'Mute guests',
  ARRANGE_GUESTS: 'Arrange guests',
}

export const PHRASE_SEVERITY_LABELS: Record<BannedPhraseSeverity, string> = {
  MASK: 'Mask',
  REJECT: 'Block message',
}

export const ALERT_SEVERITY_LABELS: Record<AlertSeverity, string> = {
  INFO: 'Info',
  WARNING: 'Warning',
  CRITICAL: 'Critical',
}

export const PLATFORM_LABELS: Record<SessionPlatform, string> = {
  ANDROID: 'Android app',
  IOS: 'iOS app',
  WEB: 'Admin console',
  UNKNOWN: 'Unknown device',
}

export const APP_PLATFORM_LABELS: Record<AppPlatform, string> = {
  ANDROID: 'Android',
  IOS: 'iOS',
}

export const ACTOR_ROLE_LABELS: Record<AuditActorRole, string> = {
  SUPER_ADMIN: 'Super admin',
  PLATFORM_MODERATOR: 'Platform moderator',
  HOST: 'Host',
  MODERATOR: 'Moderator',
  USER: 'User',
  SYSTEM: 'System',
}

// As the app words them to the person reporting.
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  SPAM: 'Spam',
  SCAM: 'Scam or fraud',
  HARASSMENT: 'Harassment or bullying',
  HATE: 'Hate speech',
  VIOLENCE: 'Violence or threats',
  SEXUAL_CONTENT: 'Nudity or sexual content',
  CHILD_SAFETY: 'Child safety',
  SELF_HARM: 'Suicide or self-harm',
  ILLEGAL: 'Illegal activity',
  IMPERSONATION: 'Impersonation',
  OTHER: 'Something else',
}

export const REPORT_TARGET_LABELS: Record<ReportTargetType, string> = {
  LIVE: 'Live',
  CHAT_MESSAGE: 'Chat message',
  USER: 'Account',
  DIRECT_MESSAGE: 'Private message',
}

export const REPORT_STATUS_LABELS: Record<ReportCaseStatus, string> = {
  OPEN: 'Open',
  ACTIONED: 'Action taken',
  DISMISSED: 'No violation',
}
