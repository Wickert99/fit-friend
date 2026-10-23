import { useEffect, useState } from 'react'
import { consumeWhoopNotice, WHOOP_NOTICE_EVENT } from './model.ts'
import { disconnectWhoop, loadWhoopConnection, startWhoopOAuth } from './api.ts'
import { Badge, Card, SectionLabel } from '../../ui/Card.tsx'
import { Button } from '../../ui/Button.tsx'

export function WhoopConnect() {
  const [connection, setConnection] = useState<'connected' | 'disconnected' | 'unavailable' | 'signed_out' | 'loading'>('loading')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function refresh() {
    const next = await loadWhoopConnection()
    setConnection(next)
  }

  useEffect(() => {
    const applyNotice = () => {
      const note = consumeWhoopNotice(window.sessionStorage)
      if (note) setMessage(note)
      void refresh()
    }
    applyNotice()
    window.addEventListener(WHOOP_NOTICE_EVENT, applyNotice)
    return () => window.removeEventListener(WHOOP_NOTICE_EVENT, applyNotice)
  }, [])

  async function connect() {
    setBusy(true)
    setMessage(null)
    try {
      const result = await startWhoopOAuth()
      if (result.url) {
        window.location.assign(result.url)
        return
      }
      setMessage(result.message ?? "Whoop didn't open. The rest of Fit Friend still works.")
      setBusy(false)
    } catch {
      setMessage("Whoop didn't open. The rest of Fit Friend still works.")
      setBusy(false)
    }
  }

  async function disconnect() {
    setBusy(true)
    setMessage(null)
    try {
      const result = await disconnectWhoop()
      setMessage(result.message ?? null)
      setConnection(result.connected ? 'connected' : 'disconnected')
    } catch {
      setMessage("Whoop didn't disconnect. Try again in a moment.")
    } finally {
      setBusy(false)
    }
  }

  const connected = connection === 'connected'

  return (
    <section className="space-y-3" data-whoop-connect>
      <SectionLabel>Whoop</SectionLabel>
      <Card>
        <p className="text-sm text-muted">Heart rate from Whoop on completed workouts: average, max, zones, and strain.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {connected ? <Badge tone="success">Connected</Badge> : null}
          {connection === 'loading' ? <p className="text-xs text-muted">Checking Whoop…</p> : null}
          {connected ? (
            <Button size="sm" variant="danger" disabled={busy} onClick={() => void disconnect()}>
              Disconnect Whoop
            </Button>
          ) : (
            <Button size="sm" disabled={busy || connection === 'loading'} onClick={() => void connect()}>
              Connect Whoop
            </Button>
          )}
        </div>
        {message ? (
          <p className="mt-2 text-xs text-muted" role="status">
            {message}
          </p>
        ) : null}
      </Card>
    </section>
  )
}
