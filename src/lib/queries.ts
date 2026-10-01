import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import { dayBoundary } from './format'
import { useToast } from './toast-context'
import type {
  AdminAlert,
  AdminPermission,
  AdminView,
  AlertScope,
  AlertSeverity,
  AlertTarget,
  AuditCatalog,
  AuditEntry,
  BannedPhrase,
  BannedPhraseSeverity,
  ChatLogPage,
  ChatModerationStatus,
  DeviceSession,
  Overview,
  Page,
  PhraseTestResult,
  PlatformRole,
  PrivateConversationPage,
  PrivateTranscript,
  StaffMember,
  StaffRole,
  StreamDetail,
  StreamRow,
  UserDetail,
  UserRow,
} from './types'
import type {
  AuditSearch,
  MessagesSearch,
  StreamsSearch,
  UsersSearch,
} from '../app/search'
import { DEFAULT_PAGE_SIZE } from './search'

const id = (value: string) => encodeURIComponent(value)
const paging = (search: { page?: number; pageSize?: number }) => ({
  page: search.page ?? 1,
  pageSize: search.pageSize ?? DEFAULT_PAGE_SIZE,
})

// ---- Reads ----------------------------------------------------------------

export function useOverview() {
  return useQuery({
    queryKey: ['overview'],
    queryFn: ({ signal }) => api<Overview>('/admin/overview', { signal }),
    refetchInterval: 30_000,
  })
}

export function useStreams(search: StreamsSearch) {
  return useQuery({
    queryKey: ['streams', search],
    queryFn: ({ signal }) =>
      api<Page<StreamRow>>('/admin/streams', {
        signal,
        query: {
          q: search.q,
          status: search.status,
          hostId: search.hostId,
          from: dayBoundary(search.from, 'start'),
          to: dayBoundary(search.to, 'end'),
          sort: search.sort,
          order: search.order,
          ...paging(search),
        },
      }),
    placeholderData: keepPreviousData,
    refetchInterval: search.status === 'LIVE' ? 15_000 : false,
  })
}

export function useAlertTargets(enabled = true) {
  return useQuery({
    queryKey: ['alerts', 'targets'],
    queryFn: ({ signal }) => api<{ items: AlertTarget[] }>('/admin/alerts/targets', { signal }),
    enabled,
    refetchInterval: 20_000,
  })
}

export function useStream(streamId: string) {
  return useQuery({
    queryKey: ['stream', streamId],
    queryFn: ({ signal }) => api<StreamDetail>(`/admin/streams/${id(streamId)}`, { signal }),
    refetchInterval: (query) => (query.state.data?.status === 'LIVE' ? 10_000 : false),
  })
}

export interface ChatLogFilter {
  status?: ChatModerationStatus
  q?: string
}

/** Newest first, 50 at a time; while the live runs the loaded pages refresh. */
export function useChatLog(streamId: string, filter: ChatLogFilter, live: boolean) {
  return useInfiniteQuery({
    queryKey: ['stream', streamId, 'chat', filter],
    queryFn: ({ signal, pageParam }) =>
      api<ChatLogPage>(`/admin/streams/${id(streamId)}/chat`, {
        signal,
        query: { ...filter, cursor: pageParam, limit: 50 },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: live ? 5_000 : false,
  })
}

export function useUsers(search: UsersSearch) {
  return useQuery({
    queryKey: ['users', search],
    queryFn: ({ signal }) =>
      api<Page<UserRow>>('/admin/users', {
        signal,
        query: {
          q: search.q,
          status: search.status,
          role: search.role,
          sort: search.sort,
          order: search.order,
          ...paging(search),
        },
      }),
    placeholderData: keepPreviousData,
  })
}

export function useUser(userId: string) {
  return useQuery({
    queryKey: ['user', userId],
    queryFn: ({ signal }) => api<UserDetail>(`/admin/users/${id(userId)}`, { signal }),
  })
}

export function useUserSessions(userId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['user', userId, 'sessions'],
    queryFn: ({ signal }) => api<{ items: DeviceSession[] }>(`/admin/users/${id(userId)}/sessions`, { signal }),
    enabled,
  })
}

export function useStaff() {
  return useQuery({
    queryKey: ['staff'],
    queryFn: ({ signal }) => api<{ items: StaffMember[] }>('/admin/staff', { signal }),
  })
}

export function useAlerts(page: number) {
  return useQuery({
    queryKey: ['alerts', page],
    queryFn: ({ signal }) =>
      api<Page<AdminAlert>>('/admin/alerts', { signal, query: { page, pageSize: DEFAULT_PAGE_SIZE } }),
    placeholderData: keepPreviousData,
  })
}

export function usePhrases(filter: { q?: string; severity?: BannedPhraseSeverity }) {
  return useQuery({
    queryKey: ['phrases', filter],
    queryFn: ({ signal }) => api<{ items: BannedPhrase[] }>('/admin/banned-phrases', { signal, query: filter }),
    placeholderData: keepPreviousData,
  })
}

export function auditQuery(search: AuditSearch) {
  return {
    q: search.q,
    category: search.category,
    action: search.action,
    actorRole: search.actorRole,
    actorId: search.actorId,
    userId: search.userId,
    targetType: search.targetType,
    targetId: search.targetId,
    streamId: search.streamId,
    from: dayBoundary(search.from, 'start'),
    to: dayBoundary(search.to, 'end'),
  }
}

export function useAuditLog(search: AuditSearch) {
  return useQuery({
    queryKey: ['audit', search],
    queryFn: ({ signal }) =>
      api<Page<AuditEntry>>('/admin/audit-logs', { signal, query: { ...auditQuery(search), ...paging(search) } }),
    placeholderData: keepPreviousData,
  })
}

export function useAuditCatalog() {
  return useQuery({
    queryKey: ['audit-catalog'],
    queryFn: ({ signal }) => api<AuditCatalog>('/admin/audit-logs/catalog', { signal }),
    staleTime: Infinity,
  })
}

export function useMySessions() {
  return useQuery({
    queryKey: ['me', 'sessions'],
    queryFn: ({ signal }) => api<{ items: DeviceSession[] }>('/admin/me/sessions', { signal }),
  })
}

interface DayRange {
  from: string
  to: string
}

/** Who wrote to whom in [range] - no text; today's list keeps itself current. */
export function usePrivateConversations(search: MessagesSearch, range: DayRange, isToday: boolean) {
  return useQuery({
    queryKey: ['private-messages', 'conversations', search.q, search.userId, paging(search), range],
    queryFn: ({ signal }) =>
      api<PrivateConversationPage>('/admin/messages/conversations', {
        signal,
        query: { ...range, q: search.q, userId: search.userId, ...paging(search) },
      }),
    placeholderData: keepPreviousData,
    refetchInterval: isToday ? 30_000 : false,
  })
}

/**
 * One conversation's messages in [range]. The server records every first
 * page it hands out, so this never refetches by itself: one look, one entry.
 */
export function usePrivateTranscript(conversationId: string, range: DayRange) {
  return useInfiniteQuery({
    queryKey: ['private-messages', 'transcript', conversationId, range],
    queryFn: ({ signal, pageParam }) =>
      api<PrivateTranscript>(`/admin/messages/conversations/${id(conversationId)}`, {
        signal,
        query: { ...range, cursor: pageParam, limit: 100 },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

// ---- Writes ---------------------------------------------------------------

export const actions = {
  lockStream: (streamId: string, reason: string) =>
    api<StreamDetail>(`/admin/streams/${id(streamId)}/lock`, { method: 'POST', body: { reason } }),
  unlockStream: (streamId: string) => api<StreamDetail>(`/admin/streams/${id(streamId)}/unlock`, { method: 'POST' }),
  deleteMessage: (streamId: string, messageId: string) =>
    api<{ ok: true }>(`/admin/streams/${id(streamId)}/chat/${id(messageId)}`, { method: 'DELETE' }),

  suspendUser: (userId: string, reason: string) =>
    api<{ ok: true; lockedLives: number }>(`/admin/users/${id(userId)}/suspend`, { method: 'POST', body: { reason } }),
  reinstateUser: (userId: string) => api<{ ok: true }>(`/admin/users/${id(userId)}/reinstate`, { method: 'POST' }),
  revokeUserSessions: (userId: string) =>
    api<{ ok: true; revoked: number }>(`/admin/users/${id(userId)}/sessions/revoke`, { method: 'POST' }),
  changeRole: (userId: string, platformRole: PlatformRole, permissions?: AdminPermission[]) =>
    api<{ ok: true }>(`/admin/users/${id(userId)}/role`, { method: 'PATCH', body: { platformRole, permissions } }),
  changePermissions: (userId: string, permissions: AdminPermission[]) =>
    api<{ ok: true; permissions: AdminPermission[] }>(`/admin/users/${id(userId)}/permissions`, {
      method: 'PATCH',
      body: { permissions },
    }),
  editProfile: (
    userId: string,
    body: { username?: string; displayName?: string; bio?: string; removeAvatar?: boolean; reason: string },
  ) => api<UserDetail>(`/admin/users/${id(userId)}/profile`, { method: 'PATCH', body }),
  createStaff: (body: { email: string; displayName: string; platformRole: StaffRole; permissions?: AdminPermission[] }) =>
    api<{
      user: { id: string; username: string; displayName: string; email: string; permissions: AdminPermission[] }
      temporaryPassword: string
    }>('/admin/staff', { method: 'POST', body }),

  sendAlert: (body: { scope: AlertScope; streamId?: string; message: string; severity: AlertSeverity }) =>
    api<AdminAlert>('/admin/alerts', { method: 'POST', body }),

  addPhrase: (phrase: string, severity: BannedPhraseSeverity) =>
    api<BannedPhrase>('/admin/banned-phrases', { method: 'POST', body: { phrase, severity } }),
  updatePhrase: (phraseId: string, body: { phrase?: string; severity?: BannedPhraseSeverity }) =>
    api<BannedPhrase>(`/admin/banned-phrases/${id(phraseId)}`, { method: 'PATCH', body }),
  removePhrase: (phraseId: string) => api<{ ok: true }>(`/admin/banned-phrases/${id(phraseId)}`, { method: 'DELETE' }),
  testPhrase: (text: string) => api<PhraseTestResult>('/admin/banned-phrases/test', { method: 'POST', body: { text } }),

  updateMe: (displayName: string) => api<AdminView>('/admin/me', { method: 'PATCH', body: { displayName } }),
  changePassword: (currentPassword: string, newPassword: string) =>
    api<AdminView>('/admin/me/password', { method: 'POST', body: { currentPassword, newPassword } }),
  changeEmail: (email: string, currentPassword: string) =>
    api<AdminView>('/admin/me/email', { method: 'POST', body: { email, currentPassword } }),
  revokeMySession: (sessionId: string) => api<{ ok: true }>(`/admin/me/sessions/${id(sessionId)}`, { method: 'DELETE' }),
}

interface AdminMutationOptions<TResult, TVariables> {
  /** A confirmation toast on success. */
  success?: string | ((result: TResult, variables: TVariables) => string)
  /** Off when the caller shows the error itself, e.g. inside a dialog. */
  toastErrors?: boolean
}

/**
 * A console action: on success every visible query refetches, so whatever
 * the action changed - lists, counts, the audit log - is current at once.
 */
export function useAdminMutation<TVariables, TResult>(
  mutate: (variables: TVariables) => Promise<TResult>,
  { success, toastErrors = true }: AdminMutationOptions<TResult, TVariables> = {},
) {
  const queryClient = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: mutate,
    onSuccess: (result, variables) => {
      if (success) toast.success(typeof success === 'function' ? success(result, variables) : success)
      void queryClient.invalidateQueries()
    },
    onError: (error) => {
      if (toastErrors) toast.error(error)
    },
  })
}
