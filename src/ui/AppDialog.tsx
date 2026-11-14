import { useLayoutEffect, useRef, type DialogHTMLAttributes, type ReactNode } from 'react'
import { cn } from './cn.ts'
import { dialogClosedBySupported, pointerOutside } from './dialog.ts'

type Variant = 'sheet' | 'card' | 'full'

export function AppDialog({
  onClose,
  children,
  labelledBy,
  label,
  describedBy,
  lightDismiss = true,
  variant = 'sheet',
  className,
  ...rest
}: {
  onClose: () => void
  children: ReactNode
  labelledBy?: string
  label?: string
  describedBy?: string
  lightDismiss?: boolean
  variant?: Variant
} & Omit<DialogHTMLAttributes<HTMLDialogElement>, 'onClose' | 'children' | 'open'>) {
  const ref = useRef<HTMLDialogElement>(null)
  const onCloseRef = useRef(onClose)
  const lightRef = useRef(lightDismiss)
  onCloseRef.current = onClose
  lightRef.current = lightDismiss

  useLayoutEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    let pressedOutside = false
    const onDown = (event: PointerEvent) => {
      if (dialogClosedBySupported() || !lightRef.current) {
        pressedOutside = false
        return
      }
      pressedOutside = pointerOutside(dialog.getBoundingClientRect(), event.clientX, event.clientY)
    }
    const onUp = (event: PointerEvent) => {
      const releaseOutside = pointerOutside(dialog.getBoundingClientRect(), event.clientX, event.clientY)
      if (pressedOutside && lightRef.current && releaseOutside) dialog.close()
      pressedOutside = false
    }
    dialog.addEventListener('pointerdown', onDown)
    dialog.addEventListener('pointerup', onUp)
    return () => {
      dialog.removeEventListener('pointerdown', onDown)
      dialog.removeEventListener('pointerup', onUp)
      if (dialog.open) {
        dialog.addEventListener('close', (event) => event.stopImmediatePropagation(), { capture: true, once: true })
        dialog.close()
      }
    }
  }, [])

  return (
    <dialog
      {...rest}
      ref={ref}
      className={cn('app-dialog', variant === 'sheet' && 'app-dialog-sheet', variant === 'card' && 'app-dialog-card', variant === 'full' && 'app-dialog-full', className)}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      aria-describedby={describedBy}
      closedby={lightDismiss ? 'any' : 'closerequest'}
      onClose={() => onCloseRef.current()}
    >
      {children}
    </dialog>
  )
}
