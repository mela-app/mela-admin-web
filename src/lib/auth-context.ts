import { createContext, useContext } from 'react'
import type { AdminPermission, AdminView } from './types'

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

export interface Auth {
  status: AuthStatus
  admin: AdminView | null
  isSuperAdmin: boolean
  /** Whether the console may show and do this for the signed-in staff member. */
  can: (permission: AdminPermission) => boolean
  signIn: (email: string, password: string) => Promise<AdminView>
  signOut: () => Promise<void>
  /** After the signed-in account changed its own details. */
  update: (admin: AdminView) => void
}

export const AuthContext = createContext<Auth | null>(null)

export function useAuth(): Auth {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth() needs an <AuthProvider> above it')
  return auth
}
