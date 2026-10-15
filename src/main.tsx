import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App.tsx'
import { captureAuthLinkError } from './lib/supabase/authLink.ts'
import { ensureSyncEngine } from './lib/sync/engine.ts'
import './index.css'

if (typeof window !== 'undefined') {
  captureAuthLinkError()
  ensureSyncEngine()
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
