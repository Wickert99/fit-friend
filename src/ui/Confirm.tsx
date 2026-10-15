import { createContext, useCallback, useContext, useId, useState, type ReactNode } from 'react'
import { Button } from './Button.tsx'
import { useBodyScrollLock } from './useBodyScrollLock.ts'

export interface ConfirmOptions {
  title: string
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'neutral' | 'danger'
}

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn>(async () => false)

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext)
}

/** Original confirm copy uses a blank line between the question and the detail. */
export function confirmText(message: string): ConfirmOptions {
  const [title, ...rest] = message.split('\n\n')
  return { title: title ?? message, body: rest.join('\n\n') || undefined, tone: 'danger' }
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const titleId = useId()
  const bodyId = useId()
  const [request, setRequest] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null)
  useBodyScrollLock(request != null)

  const confirm = useCallback<ConfirmFn>((options) => {
    const normalized = typeof options === 'string' ? confirmText(options) : options
    return new Promise((resolve) => {
      setRequest({ ...normalized, resolve })
    })
  }, [])

  const finish = (ok: boolean) => {
    request?.resolve(ok)
    setRequest(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request ? (
        <div
          className="sheet-overlay fixed inset-0 z-[60] flex items-end justify-center bg-ink/40 sm:items-center sm:p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) finish(false)
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={request.body ? bodyId : undefined}
            data-confirm-sheet="true"
            className="w-full max-w-lg rounded-t-2xl border border-charcoal-4 bg-charcoal px-4 pt-5 shadow-card sm:rounded-2xl"
            style={{ paddingBottom: 'max(1rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem))' }}
          >
            <h2 id={titleId} className={request.tone === 'danger' ? 'text-lg font-semibold text-danger' : 'text-lg font-semibold text-ink'}>
              {request.title}
            </h2>
            {request.body ? (
              <p id={bodyId} className="mt-2 text-sm leading-relaxed text-muted">
                {request.body}
              </p>
            ) : null}
            <div className="mt-5 flex flex-col gap-2">
              <Button size="lg" variant="secondary" className="w-full" autoFocus onClick={() => finish(false)}>
                {request.cancelLabel ?? 'Cancel'}
              </Button>
              <Button size="lg" variant={request.tone === 'danger' ? 'danger' : 'primary'} className="w-full" onClick={() => finish(true)}>
                {request.confirmLabel ?? 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  )
}
