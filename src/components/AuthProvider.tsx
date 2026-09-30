import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  api,
  clearAccessToken,
  configureSession,
  refreshSession,
  signIn as apiSignIn,
  signOut as apiSignOut,
} from '../lib/api'
import { AuthContext, type Auth, type AuthStatus } from '../lib/auth-context'
import type { AdminPermission, AdminView } from '../lib/types'

const CHANNEL = 'gl-admin-session'

/**
 * The signed-in staff member. On load it asks the API to renew the session
 * from the refresh cookie; signing out in one tab signs out every tab.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<{ status: AuthStatus; admin: AdminView | null }>({
    status: 'loading',
    admin: null,
  })
  const channel = useRef<BroadcastChannel | null>(null)
  const reloading = useRef(false)

  const end = useCallback(() => {
    clearAccessToken()
    queryClient.clear()
    setState({ status: 'anonymous', admin: null })
  }, [queryClient])

  // A super admin can change what this account may do at any time: re-read it, and keep it only if it changed.
  const reload = useCallback(() => {
    if (reloading.current) return
    reloading.current = true
    api<AdminView>('/admin/me')
      .then((admin) =>
        setState((current) =>
          current.status === 'authenticated' && JSON.stringify(current.admin) !== JSON.stringify(admin)
            ? { status: 'authenticated', admin }
            : current,
        ),
      )
      .catch(() => undefined)
      .finally(() => {
        reloading.current = false
      })
  }, [])

  useEffect(() => {
    configureSession({
      onSessionEnded: end,
      onPasswordChangeRequired: () =>
        setState((current) =>
          current.admin ? { ...current, admin: { ...current.admin, passwordChangeRequired: true } } : current,
        ),
      onPermissionMissing: reload,
    })
  }, [end, reload])

  useEffect(() => {
    if (state.status !== 'authenticated') return
    window.addEventListener('focus', reload)
    return () => window.removeEventListener('focus', reload)
  }, [state.status, reload])

  useEffect(() => {
    let active = true
    void refreshSession().then((admin) => {
      if (active) setState(admin ? { status: 'authenticated', admin } : { status: 'anonymous', admin: null })
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const opened = new BroadcastChannel(CHANNEL)
    opened.onmessage = (event: MessageEvent) => {
      if (event.data === 'signed-out') end()
    }
    channel.current = opened
    return () => {
      opened.close()
      channel.current = null
    }
  }, [end])

  const signIn = useCallback(
    async (email: string, password: string) => {
      const admin = await apiSignIn(email, password)
      queryClient.clear()
      setState({ status: 'authenticated', admin })
      return admin
    },
    [queryClient],
  )

  const signOut = useCallback(async () => {
    try {
      await apiSignOut()
    } finally {
      channel.current?.postMessage('signed-out')
      end()
    }
  }, [end])

  const update = useCallback((admin: AdminView) => setState({ status: 'authenticated', admin }), [])

  const value = useMemo<Auth>(
    () => ({
      status: state.status,
      admin: state.admin,
      isSuperAdmin: state.admin?.platformRole === 'SUPER_ADMIN',
      can: (permission: AdminPermission) => state.admin?.permissions.includes(permission) ?? false,
      signIn,
      signOut,
      update,
    }),
    [state, signIn, signOut, update],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
