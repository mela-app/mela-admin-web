import { RouterProvider } from '@tanstack/react-router'
import { useEffect } from 'react'
import { Spinner } from '../components/ui/feedback'
import { useAuth } from '../lib/auth-context'
import { router } from './client'

export function App() {
  const auth = useAuth()

  // Signing in or out (or the session ending) re-runs every route guard.
  useEffect(() => {
    if (auth.status !== 'loading') void router.invalidate()
  }, [auth])

  if (auth.status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner label="Loading the console" />
      </div>
    )
  }
  return <RouterProvider router={router} context={{ auth }} />
}
