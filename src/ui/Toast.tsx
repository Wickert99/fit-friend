import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { cn } from './cn.ts'

export interface ToastInput {
  text: string
  tone?: 'info' | 'ok' | 'error'
}

interface ToastItem extends ToastInput {
  id: number
  tone: 'info' | 'ok' | 'error'
}

const ToastContext = createContext<(toast: ToastInput) => void>(() => {})

export function useToast(): (toast: ToastInput) => void {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const push = useCallback((toast: ToastInput) => {
    const id = Date.now() + Math.random()
    const item: ToastItem = { id, text: toast.text, tone: toast.tone ?? 'info' }
    setItems((current) => [...current, item].slice(-3))
    window.setTimeout(() => {
      setItems((current) => current.filter((entry) => entry.id !== id))
    }, 4200)
  }, [])
  const value = useMemo(() => push, [push])
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-3 bottom-above-nav z-[80] mx-auto flex max-w-md flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            role="status"
            className={cn(
              'pointer-events-auto rounded-2xl border border-charcoal-4 bg-charcoal px-3 py-3 text-sm text-ink shadow-raised',
              item.tone === 'ok' && 'text-success-ink',
              item.tone === 'error' && 'text-danger',
            )}
          >
            {item.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
