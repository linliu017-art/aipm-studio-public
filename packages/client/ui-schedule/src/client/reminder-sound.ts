/** Prepare audio only after a real user gesture, as required by browser autoplay policies. */
export function createReminderSound(): { play: () => void; dispose: () => void } {
  let context: AudioContext | undefined
  let disposed = false
  const unlock = () => {
    if (disposed) return
    try {
      context ??= new AudioContext()
      if (context.state === 'suspended') void context.resume().catch(() => {})
    } catch { /* Sound is optional when audio is unavailable or blocked. */ }
  }
  document.addEventListener('pointerdown', unlock, true)
  document.addEventListener('keydown', unlock, true)
  return {
    play: () => {
      if (context === undefined || context.state !== 'running') return
      try {
        const now = context.currentTime
        for (const [offset, frequency] of [[0, 660], [0.18, 880]] as const) {
          const oscillator = context.createOscillator()
          const gain = context.createGain()
          oscillator.type = 'sine'
          oscillator.frequency.value = frequency
          gain.gain.setValueAtTime(0.0001, now + offset)
          gain.gain.exponentialRampToValueAtTime(0.09, now + offset + 0.02)
          gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.16)
          oscillator.connect(gain)
          gain.connect(context.destination)
          oscillator.start(now + offset)
          oscillator.stop(now + offset + 0.17)
        }
      } catch { /* The visible reminder remains available. */ }
    },
    dispose: () => {
      disposed = true
      document.removeEventListener('pointerdown', unlock, true)
      document.removeEventListener('keydown', unlock, true)
      if (context !== undefined) void context.close().catch(() => {})
    },
  }
}
