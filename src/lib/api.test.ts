import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, clearAccessToken, configureSession, refreshSession, signIn, toQueryString } from './api'

const admin = {
  id: 'a1',
  username: 'admin',
  email: 'admin@example.com',
  displayName: 'Admin',
  avatarUrl: null,
  platformRole: 'SUPER_ADMIN',
  permissions: [],
  passwordChangeRequired: false,
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

type Call = { url: string; init: RequestInit }

function mockFetch(responder: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return responder(url, init)
    }),
  )
  return calls
}

const header = (call: Call, name: string) => (call.init.headers as Record<string, string>)[name]

describe('api client', () => {
  const onSessionEnded = vi.fn()
  const onPasswordChangeRequired = vi.fn()
  const onPermissionMissing = vi.fn()

  beforeEach(() => {
    clearAccessToken()
    onSessionEnded.mockReset()
    onPasswordChangeRequired.mockReset()
    onPermissionMissing.mockReset()
    configureSession({ onSessionEnded, onPasswordChangeRequired, onPermissionMissing })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('sends the access token it was given at sign-in, never storing it', async () => {
    const calls = mockFetch((url) => (url.endsWith('/sign-in') ? json({ accessToken: 'token-1', admin }) : json({ ok: true })))

    await signIn('admin@example.com', 'secret')
    await api('/admin/overview')

    expect(header(calls[1], 'Authorization')).toBe('Bearer token-1')
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
  })

  it('renews once on a 401 with the console header, then retries with the new token', async () => {
    let overviewCalls = 0
    const calls = mockFetch((url) => {
      if (url.endsWith('/admin/auth/refresh')) return json({ accessToken: 'fresh', admin })
      overviewCalls += 1
      return overviewCalls === 1 ? json({ message: 'expired' }, 401) : json({ live: 1 })
    })

    await expect(api('/admin/overview')).resolves.toEqual({ live: 1 })

    const refresh = calls.find((call) => call.url.endsWith('/refresh'))!
    expect(refresh.init.method).toBe('POST')
    expect(refresh.init.credentials).toBe('same-origin')
    expect(header(refresh, 'X-Requested-With')).toBe('admin-console')
    expect(header(calls[calls.length - 1], 'Authorization')).toBe('Bearer fresh')
  })

  it('shares one renewal between requests that fail at the same time', async () => {
    const calls = mockFetch((url, init) => {
      if (url.endsWith('/refresh')) return json({ accessToken: 'fresh', admin })
      const auth = (init.headers as Record<string, string>).Authorization
      return auth === 'Bearer fresh' ? json({ ok: true }) : json({}, 401)
    })

    await Promise.all([api('/admin/users'), api('/admin/streams'), api('/admin/alerts')])

    expect(calls.filter((call) => call.url.endsWith('/refresh'))).toHaveLength(1)
  })

  it('ends the session when renewal is refused', async () => {
    mockFetch(() => json({ message: 'Sign in to continue' }, 401))

    await expect(api('/admin/overview')).rejects.toMatchObject({ status: 401 })
    expect(onSessionEnded).toHaveBeenCalledTimes(1)
    await expect(refreshSession()).resolves.toBeNull()
  })

  it('reports a pending password change to the session', async () => {
    mockFetch(() =>
      json({ statusCode: 403, message: { message: 'Set a new password to continue', code: 'PASSWORD_CHANGE_REQUIRED' } }, 403),
    )

    await expect(api('/admin/overview')).rejects.toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED', status: 403 })
    expect(onPasswordChangeRequired).toHaveBeenCalledTimes(1)
  })

  it('tells the session to re-read its access when a permission is refused', async () => {
    mockFetch(() =>
      json({ statusCode: 403, message: { message: "You don't have access to this", code: 'MISSING_PERMISSION' } }, 403),
    )

    await expect(api('/admin/users')).rejects.toMatchObject({ code: 'MISSING_PERMISSION', status: 403 })
    expect(onPermissionMissing).toHaveBeenCalledTimes(1)
    expect(onSessionEnded).not.toHaveBeenCalled()
  })

  it("reads the API's wrapped errors into plain sentences", async () => {
    const responses = [
      json({ statusCode: 400, message: { message: ['reason must be longer than 3 characters'], error: 'Bad Request' } }, 400),
      json({ statusCode: 409, message: { message: 'That phrase is already on the list', statusCode: 409 } }, 409),
      json({ statusCode: 429, message: 'ThrottlerException: Too Many Requests' }, 429),
      new Response('<html>Bad gateway</html>', { status: 502 }),
    ]
    mockFetch(() => responses.shift()!)

    const first = await api('/x').catch((error: unknown) => error)
    expect(first).toBeInstanceOf(ApiError)
    expect(first).toMatchObject({ message: 'Reason must be longer than 3 characters.', details: ['reason must be longer than 3 characters'] })
    await expect(api('/x')).rejects.toMatchObject({ message: 'That phrase is already on the list.' })
    await expect(api('/x')).rejects.toMatchObject({ message: 'Too many requests. Wait a moment and try again.' })
    await expect(api('/x')).rejects.toMatchObject({ status: 502, message: 'The server had a problem. Try again in a moment.' })
  })

  it('turns a network failure into a readable error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))

    await expect(api('/admin/overview')).rejects.toMatchObject({ status: 0, message: expect.stringContaining("Can't reach") })
  })

  it('leaves empty filters out of the query string', () => {
    expect(toQueryString({ q: 'ana', status: undefined, role: '', page: 2, flag: false, none: null })).toBe('?q=ana&page=2&flag=false')
    expect(toQueryString({})).toBe('')
  })
})
