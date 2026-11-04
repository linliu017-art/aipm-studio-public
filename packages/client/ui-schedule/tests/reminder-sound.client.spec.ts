// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { createReminderSound } from '../src/client/reminder-sound.ts'

afterEach(() => { vi.unstubAllGlobals() })

it('plays only after a user gesture and stops listening when disposed', () => {
  const start = vi.fn()
  const close = vi.fn(async () => {})
  const oscillator = { type: '', frequency: { value: 0 }, connect: vi.fn(), start, stop: vi.fn() }
  const gain = { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() }
  const Audio = vi.fn(function () { return { state: 'running', currentTime: 0, destination: {},
    createOscillator: () => oscillator, createGain: () => gain, close } })
  vi.stubGlobal('AudioContext', Audio)
  const player = createReminderSound()
  player.play()
  expect(Audio).not.toHaveBeenCalled()
  document.dispatchEvent(new Event('pointerdown'))
  player.play()
  expect(start).toHaveBeenCalledTimes(2)
  player.dispose()
  expect(close).toHaveBeenCalledOnce()
  document.dispatchEvent(new Event('pointerdown'))
  expect(Audio).toHaveBeenCalledOnce()
})
