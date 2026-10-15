import { useEffect, useState } from 'react'

export function UpdateToast() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null)

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
    let reloaded = false
    const reload = () => {
      if (reloaded) return
      reloaded = true
      window.location.reload()
    }
    const register = () => {
      void navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          if (registration.waiting && navigator.serviceWorker.controller) setWaiting(registration.waiting)
          registration.addEventListener('updatefound', () => {
            const installing = registration.installing
            installing?.addEventListener('statechange', () => {
              if (installing.state === 'installed' && navigator.serviceWorker.controller) setWaiting(installing)
            })
          })
        })
        .catch(() => undefined)
    }
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (sessionStorage.getItem('ff-sw-reload')) {
        sessionStorage.removeItem('ff-sw-reload')
        reload()
      }
    })
  }, [])

  if (!waiting) return null
  return (
    <div
      role="status"
      data-sw-update="true"
      className="bottom-above-nav fixed inset-x-3 z-[70] mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-charcoal-4 bg-charcoal p-3 text-sm text-ink shadow-raised"
    >
      <span>Update ready</span>
      <div className="flex gap-1">
        <button type="button" onClick={() => setWaiting(null)} className="min-h-11 rounded-full px-3 text-muted">
          Later
        </button>
        <button
          type="button"
          onClick={() => {
            sessionStorage.setItem('ff-sw-reload', '1')
            waiting.postMessage('SKIP_WAITING')
          }}
          className="min-h-11 rounded-full bg-[#8f5a40] px-4 font-semibold text-white"
        >
          Reload
        </button>
      </div>
    </div>
  )
}
