import { useEffect } from 'react'

const MUTE_KEY = 'fit-friend-focus-muted'

export function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

export function writeMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
  } catch {
    /* private mode */
  }
}

export function speak(text: string, muted: boolean): void {
  if (muted || !text || typeof window === 'undefined') return
  const synth = window.speechSynthesis
  if (!synth) return
  synth.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'en-AU'
  utterance.rate = 0.95
  synth.speak(utterance)
}

export function buzz(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* unsupported */
  }
}

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !navigator.wakeLock) return
    let released = false
    let sentinel: WakeLockSentinel | null = null
    const request = () => {
      if (released) return
      void navigator.wakeLock
        .request('screen')
        .then((lock) => {
          if (released) void lock.release()
          else sentinel = lock
        })
        .catch(() => {})
    }
    request()
    const onVisible = () => {
      if (document.visibilityState === 'visible') request()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      released = true
      document.removeEventListener('visibilitychange', onVisible)
      void sentinel?.release()
    }
  }, [active])
}
