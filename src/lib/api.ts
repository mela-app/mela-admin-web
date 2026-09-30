import type { AdminView, SignInResponse } from './types'

/** A request the API refused, worded for the person using the console. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string | undefined
  readonly details: string[]

  constructor(status: number, message: string, code?: string, details: string[] = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

type Query = Record<string, string | number | boolean | null | undefined>

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  query?: Query
  signal?: AbortSignal
}

interface SessionEvents {
  // The refresh cookie is gone or expired: back to the sign-in page.
  onSessionEnded?: () => void
  // A seeded or staff-created account still has its temporary password.
  onPasswordChangeRequired?: () => void
  // Refused for a missing permission: what this account may do has probably changed.
  onPermissionMissing?: () => void
}

const BASE = '/v1'
// The API refuses the cookie routes without it: a cross-site form can't set a custom header.
const CONSOLE_HEADER = { 'X-Requested-With': 'admin-console' }
const REFRESH_LOCK = 'gl-admin-refresh'

// Only ever in memory: page script never persists it, and the refresh token
// is an httpOnly cookie the page can't read at all.
let accessToken: string | null = null
let refreshing: Promise<AdminView | null> | null = null
let events: SessionEvents = {}

export function configureSession(next: SessionEvents): void {
  events = next
}

export function hasAccessToken(): boolean {
  return accessToken !== null
}

export function clearAccessToken(): void {
  accessToken = null
}

export async function signIn(email: string, password: string): Promise<AdminView> {
  const response = await send('/admin/auth/sign-in', { method: 'POST', body: { email, password } })
  if (!response.ok) throw await toApiError(response)
  const session = (await response.json()) as SignInResponse
  accessToken = session.accessToken
  return session.admin
}

export async function signOut(): Promise<void> {
  try {
    await send('/admin/auth/sign-out', { method: 'POST' }, CONSOLE_HEADER)
  } finally {
    accessToken = null
  }
}

/**
 * Trades the refresh cookie for a new access token, once at a time: in this
 * tab (one shared promise) and across tabs (a Web Lock), so two tabs never
 * rotate the same cookie at once. Resolves to null when signed out.
 */
export function refreshSession(): Promise<AdminView | null> {
  refreshing ??= withRefreshLock(async () => {
    const response = await send('/admin/auth/refresh', { method: 'POST' }, CONSOLE_HEADER).catch(() => null)
    if (!response?.ok) {
      accessToken = null
      return null
    }
    const session = (await response.json()) as SignInResponse
    accessToken = session.accessToken
    return session.admin
  }).finally(() => {
    refreshing = null
  })
  return refreshing
}

/** An authenticated JSON request; renews the access token once on a 401. */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await authorized(path, options)
  if (response.status === 204) return undefined as T
  const text = await response.text()
  return (text ? JSON.parse(text) : undefined) as T
}

/** An authenticated download, saved under [filename]. */
export async function download(path: string, filename: string, query?: Query): Promise<void> {
  const response = await authorized(path, { query })
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

async function authorized(path: string, options: RequestOptions, retried = false): Promise<Response> {
  const response = await send(path, options, accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
  if (response.status === 401 && !retried) {
    if (await refreshSession()) return authorized(path, options, true)
    events.onSessionEnded?.()
  }
  if (!response.ok) {
    const error = await toApiError(response)
    if (error.code === 'PASSWORD_CHANGE_REQUIRED') events.onPasswordChangeRequired?.()
    if (error.code === 'MISSING_PERMISSION') events.onPermissionMissing?.()
    throw error
  }
  return response
}

async function send(path: string, options: RequestOptions, headers: Record<string, string> = {}): Promise<Response> {
  const { method = 'GET', body, query, signal } = options
  try {
    return await fetch(`${BASE}${path}${toQueryString(query)}`, {
      method,
      signal,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.")
  }
}

export function toQueryString(query: Query | undefined): string {
  if (!query) return ''
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

// The API wraps the framework's error body: `{statusCode, message: <body>}`,
// where <body> is a string or `{message: string | string[], code?}`.
export async function toApiError(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => null)
  let message: unknown = isRecord(body) ? body.message : null
  let code: string | undefined
  if (isRecord(message)) {
    code = typeof message.code === 'string' ? message.code : undefined
    message = message.message
  }
  const details = Array.isArray(message) ? message.map(String) : []
  const text = details[0] ?? (typeof message === 'string' ? message : '')
  return new ApiError(response.status, friendly(response.status, text), code, details)
}

function friendly(status: number, message: string): string {
  if (status === 429 && (!message || message.startsWith('ThrottlerException'))) {
    return 'Too many requests. Wait a moment and try again.'
  }
  if (message) return sentence(message)
  if (status === 401) return 'Your session has ended. Sign in again.'
  if (status === 403) return "You don't have permission to do that."
  if (status === 404) return 'That no longer exists.'
  if (status >= 500) return 'The server had a problem. Try again in a moment.'
  return 'Something went wrong. Try again.'
}

function sentence(text: string): string {
  const trimmed = text.trim()
  const capitalised = trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
  return /[.!?]$/.test(capitalised) ? capitalised : `${capitalised}.`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  return locks ? locks.request(REFRESH_LOCK, task) : task()
}
