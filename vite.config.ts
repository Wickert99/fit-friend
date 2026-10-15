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

/** Injects the precache list into dist/sw.js. Dev keeps VERSION 'dev' and an empty list. */
function ffSwPrecache(): Plugin {
  return {
    name: 'ff-sw-precache',
    apply: 'build',
    closeBundle() {
      const dist = path.resolve(root, 'dist')
      const swPath = path.join(dist, 'sw.js')
      const files = new Set<string>([
        '/manifest.webmanifest',
        '/favicon.svg',
        '/apple-touch-icon.png',
        '/pwa-192.png',
        '/pwa-512.png',
        '/fonts/caveat-latin-wght.woff2',
        '/fonts/inter-latin-wght.woff2',
      ])
      try {
        for (const rel of walk(path.join(dist, 'assets'))) {
          if (/\.(js|css)$/.test(rel)) files.add(`/assets/${rel}`)
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
        throw new Error('ff-sw-precache failed to inject the service worker precache list')
      }
      writeFileSync(swPath, src)
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), ffSwPrecache()],
  server: {
    host: '0.0.0.0',
    port: 41731,
    strictPort: true,
  },
})
