import { CircleAlert, Info, LoaderCircle, RefreshCw, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Button } from './Button'

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center text-zinc-400', className)}>
      <LoaderCircle className="size-5 animate-spin" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <span className={cn('block animate-pulse rounded bg-zinc-200/70', className)} aria-hidden />
}

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      {icon && (
        <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 [&_svg]:size-5">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-zinc-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-zinc-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const message = error instanceof Error ? error.message : 'Something went wrong.'
  return (
    <EmptyState
      className={className}
      icon={<CircleAlert className="text-red-600" />}
      title="Couldn't load this"
      description={message}
      action={
        onRetry && (
          <Button size="sm" icon={<RefreshCw />} onClick={onRetry}>
            Try again
          </Button>
        )
      }
    />
  )
}

type CalloutTone = 'info' | 'warning' | 'danger'

interface CalloutProps {
  tone?: CalloutTone
  title?: ReactNode
  children?: ReactNode
  action?: ReactNode
  className?: string
}

/** A standing message inside a page - not a toast, it stays. */
export function Callout({ tone = 'info', title, children, action, className }: CalloutProps) {
  const styles: Record<CalloutTone, string> = {
    info: 'border-zinc-200 bg-zinc-50 text-zinc-700 [&_svg]:text-zinc-500',
    warning: 'border-amber-200 bg-amber-50 text-amber-900 [&_svg]:text-amber-600',
    danger: 'border-red-200 bg-red-50 text-red-900 [&_svg]:text-red-600',
  }
  const Icon = tone === 'info' ? Info : tone === 'warning' ? TriangleAlert : CircleAlert
  return (
    <div role={tone === 'danger' ? 'alert' : undefined} className={cn('flex gap-3 rounded-lg border px-4 py-3', styles[tone], className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 text-[13px] leading-5">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={title ? 'mt-0.5 opacity-90' : undefined}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
