import { Link, type ErrorComponentProps } from '@tanstack/react-router'
import { CircleAlert, Compass, Lock } from 'lucide-react'
import { buttonClasses } from '../components/ui/button-styles'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/feedback'

export function RoutePending() {
  return (
    <div className="flex min-h-[40dvh] items-center justify-center">
      <Spinner />
    </div>
  )
}

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
        <Compass className="size-5" />
      </div>
      <h1 className="text-lg font-semibold text-zinc-900">Page not found</h1>
      <p className="mt-1 max-w-sm text-sm text-zinc-500">
        The link may be out of date, or the page was moved.
      </p>
      <Link to="/" className={buttonClasses('secondary', 'md', 'mt-5')}>
        Go to the overview
      </Link>
    </div>
  )
}

export function RouteErrorPage({ error, reset }: ErrorComponentProps) {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-red-50 text-red-600">
        <CircleAlert className="size-5" />
      </div>
      <h1 className="text-lg font-semibold text-zinc-900">This page ran into a problem</h1>
      <p className="mt-1 max-w-md text-sm text-zinc-500">
        {error instanceof Error ? error.message : 'Something went wrong.'}
      </p>
      <Button className="mt-5" onClick={reset}>
        Try again
      </Button>
    </div>
  )
}

export function NoAccessPage() {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
        <Lock className="size-5" />
      </div>
      <h1 className="text-lg font-semibold text-zinc-900">You don't have access to this page</h1>
      <p className="mt-1 max-w-sm text-sm text-zinc-500">
        Your role doesn't include it. A super admin can change what you can see and do.
      </p>
      <Link to="/" className={buttonClasses('secondary', 'md', 'mt-5')}>
        Go to the overview
      </Link>
    </div>
  )
}
