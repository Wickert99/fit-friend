import { Component, type ErrorInfo, type ReactNode } from 'react'
import { WifiOff } from 'lucide-react'

function isChunkError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error)
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported|Failed to fetch|NetworkError|Load failed|Unable to preload CSS/i.test(
    text,
  )
}

interface Props {
  children: ReactNode
  inline?: boolean
  resetKey?: string
  onBack?: () => void
}

interface State {
  error: Error | null
  key: string | undefined
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey === state.key) return null
    return { error: null, key: props.resetKey }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[Fit Friend] Unhandled UI error', error, info.componentStack)
  }

  private onHash = () => {
    if (this.state.error) this.setState({ error: null })
  }

  componentDidMount(): void {
    if (!this.props.inline) window.addEventListener('hashchange', this.onHash)
  }

  componentWillUnmount(): void {
    window.removeEventListener('hashchange', this.onHash)
  }

  render() {
    if (!this.state.error) return this.props.children
    if (isChunkError(this.state.error)) {
      return <OfflineNotice onRetry={() => this.setState({ error: null })} onBack={this.props.onBack} />
    }
    const inline = this.props.inline
    return (
      <div
        role="alert"
        data-app-error="true"
        className={
          inline
            ? 'mx-auto flex w-full max-w-lg items-center justify-center px-6 pt-16 pb-nav text-center'
            : 'safe-screen flex min-h-dvh items-center justify-center bg-[#f5efe6] text-center'
        }
      >
        <div className="max-w-sm">
          <h1 className="text-xl font-semibold text-[#3b2f26]">Something went wrong</h1>
          <p className="mt-2 text-sm text-[#6b5a4c]">
            {inline
              ? 'This screen hit an unexpected error. Your saved data is still on this device. Other tabs still work, or reload to try again.'
              : 'Fit Friend hit an unexpected error. Your saved data is still on this device. Reloading usually fixes it.'}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {this.props.onBack ? (
              <button
                type="button"
                onClick={this.props.onBack}
                className="inline-flex min-h-11 items-center rounded-full border border-[#d6caba] px-6 text-sm font-semibold text-ink"
              >
                Back
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex min-h-11 items-center rounded-full bg-[#8f5a40] px-6 text-sm font-semibold text-white"
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    )
  }
}

export function OfflineNotice({
  onRetry,
  onBack,
  what = 'This screen',
  compact = false,
}: {
  onRetry: () => void
  onBack?: () => void
  what?: string
  compact?: boolean
}) {
  const online = typeof navigator === 'undefined' ? true : navigator.onLine
  return (
    <div
      role="status"
      aria-live="polite"
      data-offline-chunk="true"
      data-online={online ? 'true' : 'false'}
      className={
        compact
          ? 'rounded-2xl bg-charcoal-3 p-4 text-center'
          : 'mx-auto flex w-full max-w-lg flex-col items-center px-6 pt-16 pb-nav text-center'
      }
    >
      <WifiOff aria-hidden className="mx-auto h-7 w-7 text-muted" />
      <h2 className="mt-3 text-base font-semibold text-ink">{online ? `${what} couldn't load` : "You're offline"}</h2>
      <p className="mt-1 text-sm text-muted">
        {online
          ? `Check your connection, then tap Retry. ${onBack ? 'Go back to keep using the app.' : 'Your other tabs and saved workouts still work.'}`
          : `${what} hasn't been saved for offline use yet. It will load once you're connected.`}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            data-offline-back="true"
            className="inline-flex min-h-11 items-center rounded-full border border-[#d6caba] px-6 text-sm font-semibold text-ink"
          >
            Back
          </button>
        ) : null}
        <button
          type="button"
          onClick={onRetry}
          data-offline-retry="true"
          className="inline-flex min-h-11 items-center rounded-full bg-[#8f5a40] px-6 text-sm font-semibold text-white"
        >
          {online ? 'Retry' : 'Try again'}
        </button>
      </div>
    </div>
  )
}
