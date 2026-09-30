import { Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/cn'

interface SearchInputProps {
  value: string | undefined
  onChange: (value: string | undefined) => void
  placeholder: string
  label?: string
  className?: string
}

/** A search box that reports what was typed once typing pauses. */
export function SearchInput({ value, onChange, placeholder, label, className }: SearchInputProps) {
  const [draft, setDraft] = useState(value ?? '')
  const [shown, setShown] = useState(value)
  const timer = useRef<number | undefined>(undefined)

  // The URL changed from elsewhere (back button, a cleared filter) - unless
  // it's just catching up with what is being typed.
  if (value !== shown) {
    setShown(value)
    if ((value ?? '') !== draft.trim()) setDraft(value ?? '')
  }

  useEffect(() => () => window.clearTimeout(timer.current), [])

  function type(next: string) {
    setDraft(next)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const trimmed = next.trim()
      if (trimmed !== (value ?? '')) onChange(trimmed || undefined)
    }, 300)
  }

  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" aria-hidden />
      <input
        type="search"
        value={draft}
        onChange={(event) => type(event.target.value)}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        className={cn(
          'h-9 w-full rounded-md border border-zinc-300 bg-white pr-8 pl-9 text-sm shadow-xs placeholder:text-zinc-400',
          'focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 focus:outline-none [&::-webkit-search-cancel-button]:hidden',
        )}
      />
      {draft && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            window.clearTimeout(timer.current)
            setDraft('')
            onChange(undefined)
          }}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-zinc-400 hover:text-zinc-700"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}
