import { cn } from '../../lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost'
export type ButtonSize = 'sm' | 'md'

const BASE =
  'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors ' +
  'disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-zinc-900 text-white shadow-xs hover:bg-zinc-800 active:bg-zinc-950',
  secondary: 'border border-zinc-300 bg-white text-zinc-800 shadow-xs hover:bg-zinc-50 active:bg-zinc-100',
  ghost: 'text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900',
  danger: 'bg-red-600 text-white shadow-xs hover:bg-red-700 active:bg-red-800',
  'danger-ghost': 'text-red-700 hover:bg-red-50',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-2.5 text-[13px]',
  md: 'h-9 px-3.5 text-sm',
}

/** Button looks, for elements that aren't <Button> - a router link, say. */
export function buttonClasses(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', extra?: string): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], extra)
}
