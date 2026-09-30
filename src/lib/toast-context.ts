import { createContext, useContext } from 'react'

export type ToastTone = 'success' | 'error' | 'info'

export interface Toaster {
  show: (message: string, tone?: ToastTone) => void
  success: (message: string) => void
  error: (error: unknown) => void
}

export const ToastContext = createContext<Toaster | null>(null)

export function useToast(): Toaster {
  const toaster = useContext(ToastContext)
  if (!toaster) throw new Error('useToast() needs a <ToastProvider> above it')
  return toaster
}
