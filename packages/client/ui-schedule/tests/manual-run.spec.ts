import { describe, expect, it, vi } from 'vitest'
import type { ScheduleCatalogEntry, ScheduleId } from '@deepseek-ai/dsh-schedule/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { createManualRunController } from '../src/client/manual-run.ts'

const task = { id: 'a' as ScheduleId, sessionId: 's' as SessionId, kind: 'every', status: 'paused', title: 'Report', prompt: 'Write report', scheduledAt: '2026-11-05T00:00:00Z', everySeconds: 3600 } satisfies ScheduleCatalogEntry

describe('manual run controller', () => {
  it('prevents repeat clicks until the task finishes', async () => {
    vi.useFakeTimers()
    const dispatch = vi.fn(async () => 'message')
    const result = vi.fn().mockResolvedValueOnce({ kind: 'running' }).mockResolvedValueOnce({ kind: 'completed', text: 'done' })
    const controller = createManualRunController(dispatch, result)
    try {
      controller.run(task); controller.run(task)
      expect(controller.getSnapshot().get(task.id)).toBe('running')
      await vi.waitFor(() => { expect(result).toHaveBeenCalledOnce() })
      expect(dispatch).toHaveBeenCalledOnce()
      await vi.advanceTimersByTimeAsync(5000)
      expect(controller.getSnapshot().has(task.id)).toBe(false)
    } finally { controller.dispose(); vi.useRealTimers() }
  })
  it('reports uncertain transport results instead of declaring success', async () => {
    const controller = createManualRunController(async () => { throw new Error('network') }, vi.fn())
    try {
      controller.run(task)
      await vi.waitFor(() => { expect(controller.getSnapshot().get(task.id)).toBe('unknown') })
    } finally { controller.dispose() }
  })
})
