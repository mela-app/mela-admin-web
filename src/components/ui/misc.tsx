import { Check, Copy } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { formatPrecise, formatRelative, initials } from '../../lib/format'

const AVATAR_SIZES = { xs: 'size-5 text-[9px]', sm: 'size-7 text-[11px]', md: 'size-8 text-xs', lg: 'size-12 text-base', xl: 'size-16 text-lg' }

export function Avatar({ name, url, size = 'md' }: { name: string; url?: string | null; size?: keyof typeof AVATAR_SIZES }) {
  const [failed, setFailed] = useState(false)
  const classes = cn('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-200 font-medium text-zinc-600', AVATAR_SIZES[size])
  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        referrerPolicy="no-referrer"
        className={cn(classes, 'object-cover')}
        onError={() => setFailed(true)}
      />
    )
  }
  return (
    <span className={classes} aria-hidden>
      {initials(name)}
    </span>
  )
}

export function RelativeTime({ value, className }: { value: string | null | undefined; className?: string }) {
  if (!value) return <span className={cn('text-zinc-400', className)}>Never</span>
  return (
    <time dateTime={value} title={formatPrecise(value)} className={className}>
      {formatRelative(value)}
    </time>
  )
}

/** Copies [value]; shows a check for a moment after. */
export function CopyButton({ value, label = 'Copy', className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(timer)
  }, [copied])
  return (
    <button
      type="button"
      title={copied ? 'Copied' : label}
      aria-label={copied ? 'Copied' : label}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => setCopied(true))
      }}
      className={cn('inline-flex size-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700', className)}
    >
      {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
    </button>
  )
}

/** A long identifier, shortened, with a copy button. */
export function Identifier({ value, className }: { value: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 font-mono text-xs text-zinc-600', className)}>
      <span title={value}>{value.length > 13 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value}</span>
      <CopyButton value={value} label="Copy ID" />
    </span>
  )
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  meta,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  breadcrumbs?: ReactNode
  meta?: ReactNode
}) {
  return (
    <div className="mb-6">
      {breadcrumbs && <nav aria-label="Breadcrumb" className="mb-2 text-[13px] text-zinc-500">{breadcrumbs}</nav>}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">{title}</h1>
          {description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}
          {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}

interface TabsProps<T extends string> {
  label: string
  value: T
  onChange: (value: T) => void
  tabs: Array<{ value: T; label: string; count?: number }>
}

export function Tabs<T extends string>({ label, value, onChange, tabs }: TabsProps<T>) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-5 overflow-x-auto border-b border-zinc-200">
      {tabs.map((tab) => {
        const selected = tab.value === value
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.value)}
            className={cn(
              '-mb-px flex items-center gap-1.5 border-b-2 pt-1 pb-2.5 text-sm font-medium whitespace-nowrap transition-colors',
              selected ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-800',
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-px text-[11px] font-medium tabular-nums',
                  selected ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600',
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
