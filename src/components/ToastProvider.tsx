import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { cn } from '../lib/cn'
import { ToastContext, type Toaster, type ToastTone } from '../lib/toast-context'

interface Toast {
  id: number
  message: string
  tone: ToastTone
}

const LIFETIME_MS = 5000

/** Short confirmations and failures, bottom right, announced to screen readers. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, number>())

  const dismiss = useCallback((id: number) => {
    window.clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const show = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = nextId.current++
      setToasts((current) => [...current.slice(-3), { id, message, tone }])
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), LIFETIME_MS),
      )
    },
    [dismiss],
  )

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach((timer) => window.clearTimeout(timer))
  }, [])

  const toaster = useMemo<Toaster>(
    () => ({
      show,
      success: (message) => show(message, 'success'),
      error: (error) => show(error instanceof Error ? error.message : 'Something went wrong. Try again.', 'error'),
    }),
    [show],
  )

  return (
    <ToastContext.Provider value={toaster}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-end gap-2 p-4 sm:p-6"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-zinc-200 bg-white p-3.5 shadow-lg shadow-zinc-900/5"
          >
            <ToastIcon tone={toast.tone} />
            <p className="flex-1 pt-px text-sm text-zinc-800">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="-m-1 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
              aria-label="Dismiss"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastIcon({ tone }: { tone: ToastTone }) {
  const className = cn(
    'mt-px size-4.5 shrink-0',
    tone === 'success' && 'text-emerald-600',
    tone === 'error' && 'text-red-600',
    tone === 'info' && 'text-zinc-500',
  )
  if (tone === 'success') return <CircleCheck className={className} />
  if (tone === 'error') return <CircleAlert className={className} />
  return <Info className={className} />
}
