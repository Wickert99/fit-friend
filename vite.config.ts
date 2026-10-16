import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

const root = path.dirname(fileURLToPath(import.meta.url))

function walk(dir: string, base = ''): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const abs = path.join(dir, name)
    const rel = base ? `${base}/${name}` : name
    if (statSync(abs).isDirectory()) out.push(...walk(abs, rel))
    else out.push(rel)
  }
  return out
}

/** `/` for local dev. GitHub Pages sets VITE_BASE=/fit-friend/ for the production build. */
function pagesBase(): string {
  const raw = process.env.VITE_BASE?.trim()
  if (!raw || raw === '/') return '/'
  const withLeading = raw.startsWith('/') ? raw : `/${raw}`
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`
}

function publicUrl(assetPath: string, base: string): string {
  const rel = assetPath.replace(/^\//, '')
  return `${base}${rel}`
}

/** Prefixes built font URLs, the manifest, and the service-worker precache with the Pages base. */
function ffPagesBase(): Plugin {
  const base = pagesBase()
  return {
    name: 'ff-pages-base',
    apply: 'build',
    closeBundle() {
      const dist = path.resolve(root, 'dist')
      rewriteBuiltCss(dist, base)
      rewriteManifest(dist, base)
      injectPrecache(dist, base)
    },
  }
}

function rewriteBuiltCss(dist: string, base: string) {
  if (base === '/') return
  const prefixed = `${base}fonts/`
  let ok = false
  for (const rel of walk(path.join(dist, 'assets'))) {
    if (!rel.endsWith('.css')) continue
    const file = path.join(dist, 'assets', rel)
    const css = readFileSync(file, 'utf8')
    // Vite's base already rewrites these; keep a fallback if a root-absolute url survives.
    const next = css.replace(/url\((['"]?)\/fonts\//g, `url($1${prefixed}`)
    if (next !== css) writeFileSync(file, next)
    if (next.includes(prefixed)) ok = true
  }
  if (!ok) throw new Error('ff-pages-base failed to prefix font URLs in built CSS')
}

function rewriteManifest(dist: string, base: string) {
  if (base === '/') return
  const manifestPath = path.join(dist, 'manifest.webmanifest')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    start_url?: string
    scope?: string
    id?: string
    icons?: { src?: string }[]
  }
  if (typeof manifest.start_url === 'string') manifest.start_url = publicUrl(manifest.start_url, base)
  if (typeof manifest.scope === 'string') manifest.scope = publicUrl(manifest.scope, base)
  if (typeof manifest.id === 'string') manifest.id = publicUrl(manifest.id, base)
  for (const icon of manifest.icons ?? []) {
    if (typeof icon.src === 'string') icon.src = publicUrl(icon.src, base)
  }
  if (manifest.start_url !== base || manifest.scope !== base) {
    throw new Error('ff-pages-base failed to prefix the manifest start_url and scope')
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

/** Injects the precache list into dist/sw.js. Dev keeps VERSION 'dev' and an empty list. */
function injectPrecache(dist: string, base: string) {
  const swPath = path.join(dist, 'sw.js')
  const files = new Set<string>([
    publicUrl('/manifest.webmanifest', base),
    publicUrl('/favicon.svg', base),
    publicUrl('/apple-touch-icon.png', base),
    publicUrl('/pwa-192.png', base),
    publicUrl('/pwa-512.png', base),
    publicUrl('/fonts/caveat-latin-wght.woff2', base),
    publicUrl('/fonts/inter-latin-wght.woff2', base),
  ])
  try {
    for (const rel of walk(path.join(dist, 'assets'))) {
      if (/\.(js|css)$/.test(rel)) files.add(publicUrl(`/assets/${rel}`, base))
    }
  } catch {
    /* assets folder missing */
  }
  const list = [...files].sort()
  const version = createHash('sha1').update(list.join('\n')).digest('hex').slice(0, 12)
  const src = readFileSync(swPath, 'utf8')
    .replace("const VERSION = 'dev'", `const VERSION = '${version}'`)
    .replace('const PRECACHE = []', `const PRECACHE = ${JSON.stringify(list)}`)
  if (!src.includes(`const VERSION = '${version}'`) || src.includes('const PRECACHE = []')) {
    throw new Error('ff-pages-base failed to inject the service worker precache list')
  }
  writeFileSync(swPath, src)
}

export default defineConfig({
  base: pagesBase(),
  plugins: [react(), tailwindcss(), ffPagesBase()],
  server: {
    host: '0.0.0.0',
    port: 41731,
    strictPort: true,
  },
})
