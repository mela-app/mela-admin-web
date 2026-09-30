import { X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Button, IconButton } from './Button'
import { Callout } from './feedback'
import { Field, Textarea } from './forms'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  /** Slides in from the right - for reading a record rather than confirming something. */
  variant?: 'modal' | 'panel'
  children?: ReactNode
}

/**
 * A native <dialog>: focus is trapped and Escape closes it for free. The
 * content only mounts while open, so a form inside starts fresh every time.
 */
export function Dialog({ open, onClose, title, description, footer, size = 'md', variant = 'modal', children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // A field marked data-autofocus, else the dialog itself - never the close button.
      const target =
        dialog.querySelector<HTMLElement>('[data-autofocus]') ?? dialog.querySelector<HTMLElement>('[data-dialog-content]')
      target?.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
      className={cn(
        'bg-transparent p-0 text-zinc-900 open:flex',
        variant === 'modal'
          ? cn('m-auto w-[calc(100%-2rem)]', widths[size])
          : 'my-0 mr-0 ml-auto h-dvh max-h-none w-full max-w-xl',
      )}
    >
      {open && (
        <div
          data-dialog-content
          tabIndex={-1}
          className={cn(
            'flex w-full flex-col bg-white shadow-xl shadow-zinc-900/10 outline-none',
            variant === 'modal' ? 'max-h-[calc(100dvh-4rem)] rounded-xl border border-zinc-200' : 'h-full border-l border-zinc-200',
          )}
        >
          <header className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-semibold text-zinc-900">
                {title}
              </h2>
              {description && <div className="mt-1 text-[13px] text-zinc-500">{description}</div>}
            </div>
            <IconButton label="Close" onClick={onClose} className="-mt-1 -mr-2">
              <X />
            </IconButton>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <footer className="flex items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50/60 px-5 py-3">
              {footer}
            </footer>
          )}
        </div>
      )}
    </dialog>
  )
}

interface ReasonField {
  label: string
  placeholder?: string
  hint?: string
  required?: boolean
  minLength?: number
  maxLength?: number
}

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  confirmLabel: string
  tone?: 'default' | 'danger'
  /** Asks for a reason (sent to the API and kept in the audit log). */
  reason?: ReasonField
  onConfirm: (reason: string) => Promise<unknown>
  children?: ReactNode
}

export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  tone = 'default',
  reason,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={title} description={description} size="md">
      <ConfirmForm
        confirmLabel={confirmLabel}
        tone={tone}
        reason={reason}
        onConfirm={onConfirm}
        onClose={onClose}
      >
        {children}
      </ConfirmForm>
    </Dialog>
  )
}

function ConfirmForm({
  confirmLabel,
  tone,
  reason,
  onConfirm,
  onClose,
  children,
}: Pick<ConfirmDialogProps, 'confirmLabel' | 'tone' | 'reason' | 'onConfirm' | 'onClose' | 'children'>) {
  const [text, setText] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const minLength = reason?.minLength ?? (reason?.required ? 3 : 0)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = text.trim()
    if (reason && trimmed.length < minLength) {
      setError(`Write at least ${minLength} characters.`)
      return
    }
    setPending(true)
    setError(null)
    try {
      await onConfirm(trimmed)
      onClose()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Something went wrong. Try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {children}
      {reason && (
        <Field label={reason.label} hint={reason.hint} required={reason.required}>
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={reason.placeholder}
            maxLength={reason.maxLength ?? 500}
            data-autofocus
          />
        </Field>
      )}
      {error && <Callout tone="danger">{error}</Callout>}
      <div
        className={cn(
          '-mx-5 -mb-4 flex justify-end gap-2 border-t border-zinc-200 bg-zinc-50/60 px-5 py-3',
          // Nothing above the buttons: sit straight under the header.
          !children && !reason && !error && '-mt-4 border-t-0',
        )}
      >
        <Button onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant={tone === 'danger' ? 'danger' : 'primary'} loading={pending}>
          {confirmLabel}
        </Button>
      </div>
    </form>
  )
}
