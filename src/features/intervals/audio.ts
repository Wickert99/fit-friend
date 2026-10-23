let audio: AudioContext | null = null

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return null
  if (!audio) audio = new Ctx()
  return audio
}

/** Call from a tap so iOS will allow later beeps. */
export function unlockAudio(): void {
  const ctx = context()
  if (ctx && ctx.state === 'suspended') void ctx.resume()
}

export function beep(kind: 'warn' | 'change'): void {
  const ctx = context()
  if (!ctx) return
  const now = ctx.currentTime
  const tones = kind === 'change' ? [880, 660] : [990]
  tones.forEach((freq, index) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    const start = now + index * 0.16
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(start)
    osc.stop(start + 0.16)
  })
}
