/* Fit Friend service worker.
 * Precaches the app shell at install. The list and version are injected at build time by the
 * `ff-pages-base` plugin in vite.config.ts. In dev the placeholders stay and nothing is precached.
 * BASE is the directory of this script (`/` locally, `/fit-friend/` on GitHub Pages), so precache
 * URLs, navigations, fonts, assets, and exercise images stay under the deployment subpath.
 * Navigations: network first, cached index.html offline.
 * assets, fonts, icons: cache-first runtime cache.
 * exercise-images: cache-first in 'ff-exercise-images-v1', capped, never precached.
 * Activate deletes every cache except the current shell/runtime pair, including the retired
 * 'ff-models-v1' cache from the removed 3D model.
 * Updates: a new worker takes over immediately. Open screens are reloaded so an installed
 * home-screen app does not keep running the previous bundle. Navigations revalidate
 * index.html instead of trusting a ten-minute cached copy.
 */
const VERSION = 'dev'
const PRECACHE = []
const BASE = new URL('./', self.location.href).pathname
const SHELL = `ff-shell-${VERSION}`
const RUNTIME = `ff-runtime-${VERSION}`
const IMAGES = 'ff-exercise-images-v1'
const IMAGES_MAX = 200

function isAppShellPath(pathname) {
  if (pathname === INDEX_URL || pathname === ROOT_URL) return true
  if (BASE !== '/' && pathname === BASE.slice(0, -1)) return true
  return false
}

function rooted(path) {
  if (path === '/') return BASE
  if (BASE !== '/' && (path === BASE || path.startsWith(BASE))) return path
  if (path.startsWith('/')) return `${BASE}${path.slice(1)}`
  return `${BASE}${path}`
}

const INDEX_URL = rooted('/index.html')
const ROOT_URL = rooted('/')

async function trimImages() {
  const c = await caches.open(IMAGES)
  const keys = await c.keys()
  for (let i = 0; i < keys.length - IMAGES_MAX; i++) await c.delete(keys[i])
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      if (VERSION !== 'dev' && PRECACHE.length > 0) {
        const cache = await caches.open(SHELL)
        await cache.addAll([ROOT_URL, INDEX_URL, ...PRECACHE.map(rooted)])
      }
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  const keep = new Set([SHELL, RUNTIME, IMAGES])
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      const updating = keys.some((key) => key.startsWith('ff-shell-') && key !== SHELL)
      await Promise.all(keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key)))
      await self.clients.claim()
      if (!updating) return
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      await Promise.all(
        windows.map(async (client) => {
          if (!client.url || typeof client.navigate !== 'function') return
          try {
            await client.navigate(client.url)
          } catch {
            /* The page also reloads when the controller changes. */
          }
        }),
      )
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (BASE !== '/' && !url.pathname.startsWith(BASE)) return

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          // Only the app shell may replace the offline index. whoop-callback.html is a
          // separate navigation and must not be stored as index.html.
          if (res.ok && isAppShellPath(url.pathname)) {
            const copy = res.clone()
            caches.open(SHELL).then((c) => c.put(INDEX_URL, copy))
          }
          return res
        })
        .catch(() => caches.match(INDEX_URL, { ignoreSearch: true }).then((r) => r || caches.match(ROOT_URL))),
    )
    return
  }

  const p = url.pathname
  if (p.startsWith(`${BASE}exercise-images/`)) {
    event.respondWith(
      caches.open(IMAGES).then((c) =>
        c.match(req, { ignoreSearch: true }).then(
          (hit) =>
            hit ||
            fetch(req).then((res) => {
              if (res.ok || res.type === 'opaque') event.waitUntil(c.put(req, res.clone()).then(trimImages))
              return res
            }),
        ),
      ),
    )
    return
  }

  const bucket =
    p.startsWith(`${BASE}assets/`) || p.startsWith(`${BASE}fonts/`) || /\.(png|svg|ico|webmanifest)$/.test(p)
      ? RUNTIME
      : null
  if (!bucket) return
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(bucket).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})
