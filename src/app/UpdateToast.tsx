import { useEffect } from 'react'

const RELOAD_STAMP = 'ff-sw-reloaded-at'

/** Install updates without asking. A home-screen app otherwise keeps the previous bundle. */
export function UpdateToast() {
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
    const hadController = !!navigator.serviceWorker.controller
    const reload = () => {
      const last = Number(sessionStorage.getItem(RELOAD_STAMP) || 0)
      if (Date.now() - last < 8000) return
      sessionStorage.setItem(RELOAD_STAMP, String(Date.now()))
      window.location.reload()
    }
    const register = () => {
      const base = import.meta.env.BASE_URL || '/'
      void navigator.serviceWorker
        .register(`${base}sw.js`, { scope: base, updateViaCache: 'none' })
        .then((registration) => {
          const check = () => {
            void registration.update().catch(() => undefined)
          }
          const claim = (worker: ServiceWorker | null) => {
            worker?.postMessage('SKIP_WAITING')
          }
          if (registration.waiting && navigator.serviceWorker.controller) claim(registration.waiting)
          registration.addEventListener('updatefound', () => {
            const installing = registration.installing
            installing?.addEventListener('statechange', () => {
              if (installing.state === 'installed' && navigator.serviceWorker.controller) claim(installing)
            })
          })
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') check()
          })
          window.addEventListener('pageshow', check)
          window.addEventListener('focus', check)
        })
        .catch(() => undefined)
    }
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) reload()
    })
  }, [])

  return null
}
