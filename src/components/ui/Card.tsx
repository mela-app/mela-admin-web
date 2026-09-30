import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface CardProps {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  footer?: ReactNode
  /** No padding around the body - for a table that runs edge to edge. */
  flush?: boolean
  className?: string
  children?: ReactNode
}

export function Card({ title, description, actions, footer, flush = false, className, children }: CardProps) {
  const hasHeader = title || description || actions
  return (
    <section className={cn('rounded-lg border border-zinc-200 bg-white', className)}>
      {hasHeader && (
        <header className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-3.5">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-zinc-500">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      {children !== undefined && children !== null && children !== false && (
        <div className={flush ? undefined : 'p-5'}>{children}</div>
      )}
      {footer && <footer className="border-t border-zinc-200 bg-zinc-50/60 px-5 py-3">{footer}</footer>}
    </section>
  )
}

interface StatProps {
  label: string
  value: ReactNode
  hint?: ReactNode
}

export function Stat({ label, value, hint }: StatProps) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[13px] text-zinc-500">{label}</p>
      <div className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 tabular-nums">{value}</div>
      {hint && <p className="mt-0.5 truncate text-xs text-zinc-500">{hint}</p>}
    </div>
  )
}

interface DescriptionListProps {
  items: Array<{ label: string; value: ReactNode; hidden?: boolean }>
  columns?: 1 | 2
}

export function DescriptionList({ items, columns = 1 }: DescriptionListProps) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-3.5', columns === 2 && 'sm:grid-cols-2')}>
      {items
        .filter((item) => !item.hidden)
        .map((item) => (
          <div key={item.label} className="min-w-0">
            <dt className="text-xs font-medium text-zinc-500">{item.label}</dt>
            <dd className="mt-0.5 text-sm break-words text-zinc-900">{item.value}</dd>
          </div>
        ))}
    </dl>
  )
}
