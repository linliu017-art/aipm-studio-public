import type { ScheduleCatalogEntry, ScheduleId } from '@deepseek-ai/dsh-schedule/client'
import type { LoadTaskResult } from './TaskResultPreview.tsx'

export type ManualRunState = 'running' | 'unknown'
export interface ManualRunController {
  subscribe(listener: () => void): () => void
  getSnapshot(): ReadonlyMap<ScheduleId, ManualRunState>
  run(task: ScheduleCatalogEntry): void
  dispose(): void
}

/** One page-wide controller keeps list and detail actions synchronized. */
export function createManualRunController(
  dispatch: (task: ScheduleCatalogEntry) => Promise<string>, loadResult: LoadTaskResult,
): ManualRunController {
  let states: ReadonlyMap<ScheduleId, ManualRunState> = new Map()
  const listeners = new Set<() => void>()
  const pending = new Set<ScheduleId>()
  const abort = new AbortController()
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const publish = (id: ScheduleId, state?: ManualRunState) => {
    if (abort.signal.aborted) return
    const next = new Map(states)
    if (state === undefined) next.delete(id); else next.set(id, state)
    states = next
    for (const listener of listeners) listener()
  }
  const monitor = async (task: ScheduleCatalogEntry, messageId: string) => {
    try {
      const result = await loadResult(task.sessionId, messageId, abort.signal)
      if (abort.signal.aborted) return
      if (result.kind === 'waiting' || result.kind === 'running') {
        const timer = setTimeout(() => { timers.delete(timer); void monitor(task, messageId) }, 5000)
        timers.add(timer)
      } else if (result.kind === 'completed' || result.kind === 'failed' || result.kind === 'ambiguous') {
        pending.delete(task.id); publish(task.id)
      } else { pending.delete(task.id); publish(task.id, 'unknown') }
    } catch { if (!abort.signal.aborted) { pending.delete(task.id); publish(task.id, 'unknown') } }
  }
  return {
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    getSnapshot: () => states,
    run(task) {
      if (pending.has(task.id)) return
      pending.add(task.id); publish(task.id, 'running')
      void dispatch(task).then((id) => { void monitor(task, id) }).catch(() => { pending.delete(task.id); publish(task.id, 'unknown') })
    },
    dispose() { abort.abort(); for (const timer of timers) clearTimeout(timer); timers.clear(); listeners.clear() },
  }
}
