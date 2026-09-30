import { ChevronDown } from 'lucide-react'
import { cloneElement, isValidElement, useId, type ComponentProps, type ReactElement, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

const CONTROL =
  'w-full rounded-md border border-zinc-300 bg-white text-sm text-zinc-900 shadow-xs placeholder:text-zinc-400 ' +
  'transition-[border-color,box-shadow] focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 focus:outline-none ' +
  'disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-500 aria-invalid:border-red-400 aria-invalid:focus:ring-red-500/10'

interface FieldProps {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  required?: boolean
  className?: string
  /** One control; the field wires its id, hint and error to it. */
  children: ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>
}

export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  const control = isValidElement(children)
    ? cloneElement(children, { id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })
    : children
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-[13px] font-medium text-zinc-800">
        {label}
        {required && (
          <span className="ml-0.5 text-zinc-400" aria-hidden>
            *
          </span>
        )}
      </label>
      {control}
      {hint && !error && (
        <p id={hintId} className="text-xs text-zinc-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(CONTROL, 'h-9 px-3', className)} {...props} />
}

export function Textarea({ className, rows = 3, ...props }: ComponentProps<'textarea'>) {
  return <textarea rows={rows} className={cn(CONTROL, 'resize-y px-3 py-2 leading-relaxed', className)} {...props} />
}

export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className={cn('relative', className)}>
      <select className={cn(CONTROL, 'h-9 appearance-none pr-8 pl-3')} {...props}>
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-zinc-500"
        aria-hidden
      />
    </div>
  )
}

interface CheckboxProps extends Omit<ComponentProps<'input'>, 'type'> {
  label: ReactNode
  description?: ReactNode
}

export function Checkbox({ label, description, className, ...props }: CheckboxProps) {
  const id = useId()
  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-4 rounded border-zinc-300 accent-zinc-900"
        {...props}
      />
      <label htmlFor={id} className="text-sm leading-5 text-zinc-800">
        {label}
        {description && <span className="block text-xs text-zinc-500">{description}</span>}
      </label>
    </div>
  )
}

interface SegmentedProps<T extends string> {
  label: string
  value: T
  options: Array<{ value: T; label: string; disabled?: boolean }>
  onChange: (value: T) => void
}

/** A small set of mutually exclusive choices, as a radio group. */
export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  const name = useId()
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-zinc-300 bg-zinc-50 p-0.5">
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            'relative cursor-pointer rounded-[5px] px-3 py-1.5 text-[13px] font-medium text-zinc-600 select-none',
            'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-500',
            option.value === value && 'bg-white text-zinc-900 shadow-xs ring-1 ring-zinc-200',
            option.disabled && 'cursor-not-allowed opacity-50',
          )}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={option.value === value}
            disabled={option.disabled}
            onChange={() => onChange(option.value)}
            className="sr-only"
          />
          {option.label}
        </label>
      ))}
    </div>
  )
}
