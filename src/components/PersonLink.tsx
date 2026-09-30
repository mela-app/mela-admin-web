import { Link } from '@tanstack/react-router'
import { useAuth } from '../lib/auth-context'
import { cn } from '../lib/cn'
import type { Person } from '../lib/types'
import { Avatar } from './ui/misc'

interface PersonLinkProps {
  person: Person | null | undefined
  /** Just the name, no avatar or handle. */
  compact?: boolean
  className?: string
  subtitle?: string
}

/** Someone's name and handle, linking to their account for staff who may open it. */
export function PersonLink({ person, compact = false, className, subtitle }: PersonLinkProps) {
  const auth = useAuth()
  if (!person) return <span className="text-zinc-400">Deleted account</span>
  const linked = auth.can('VIEW_USERS')
  if (compact) {
    return linked ? (
      <Link
        to="/users/$userId"
        params={{ userId: person.id }}
        className={cn('font-medium text-zinc-900 hover:text-brand-700 hover:underline', className)}
      >
        {person.displayName}
      </Link>
    ) : (
      <span className={cn('font-medium text-zinc-900', className)}>{person.displayName}</span>
    )
  }
  const body = (
    <>
      <Avatar name={person.displayName} url={person.avatarUrl} size="sm" />
      <span className="min-w-0 leading-tight">
        <span
          className={cn(
            'block truncate font-medium text-zinc-900',
            linked && 'group-hover:text-brand-700 group-hover:underline',
          )}
        >
          {person.displayName}
        </span>
        <span className="block truncate text-xs text-zinc-500">{subtitle ?? `@${person.username}`}</span>
      </span>
    </>
  )
  return linked ? (
    <Link to="/users/$userId" params={{ userId: person.id }} className={cn('group flex min-w-0 items-center gap-2.5', className)}>
      {body}
    </Link>
  ) : (
    <span className={cn('flex min-w-0 items-center gap-2.5', className)}>{body}</span>
  )
}
