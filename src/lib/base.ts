/** Public path of this deployment. `/` locally; `/fit-friend/` on GitHub Pages. */
export function appBase(): string {
  return normalizeBase(readBaseUrl())
}

/**
 * Prefix a root-absolute path (`/exercise-images/a.webp`) with the app base.
 * Absolute http(s) URLs and already-prefixed paths are unchanged.
 */
export function withBase(path: string, base = appBase()): string {
  if (!path.startsWith('/')) return path
  const normalized = normalizeBase(base)
  if (normalized === '/') return path
  if (path === normalized || path.startsWith(normalized)) return path
  if (path === '/') return normalized
  return `${normalized}${path.slice(1)}`
}

function normalizeBase(base: string | undefined): string {
  if (typeof base !== 'string' || base.length === 0 || base === '/') return '/'
  const withLeading = base.startsWith('/') ? base : `/${base}`
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`
}

function readBaseUrl(): string | undefined {
  // Node tests import this module directly, where `import.meta.env` is unset.
  // Vite replaces `import.meta.env.BASE_URL` in the app bundle.
  try {
    return import.meta.env.BASE_URL
  } catch {
    return undefined
  }
}
