import type { SessionRemote } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { resolveTaskResult, type TaskResult } from './result-resolver.ts'

/** Read a bounded, non-activating history window and correlate the delivery ID. */
export async function loadTaskResult(
  remote: SessionRemote, sessionId: SessionId, messageId: string, signal: AbortSignal,
): Promise<TaskResult> {
  const address = { kind: 'session' as const, sessionId }
  let cursor = -1
  let records: Array<{ event: { type: string; seq: number; data: unknown } }> = []
  let hasMore = false
  for await (const frame of remote.follow({ address, maxMessages: 100 }, signal)) {
    if (frame.type !== 'snapshot') continue
    cursor = frame.cursor
    records = [...frame.records]
    hasMore = frame.hasMore
    break
  }
  signal.throwIfAborted()
  for (let pages = 0; hasMore && pages < 10; pages++) {
    const matched = records.findIndex(item => item.event.type === 'user/message'
      && typeof item.event.data === 'object' && item.event.data !== null
      && 'id' in item.event.data && item.event.data.id === messageId)
    if (matched >= 0 && records.slice(0, matched).some(item => item.event.type === 'turn/start')) break
    const beforeSeq = records[0]?.event.seq
    if (beforeSeq === undefined) break
    const result = await remote.page({ address, throughSeq: cursor, beforeSeq, maxMessages: 100 }, signal)
    if (!result.ok) throw result.error
    if (result.value.records.length === 0) break
    records = [...result.value.records, ...records]
    hasMore = result.value.hasMore
  }
  return resolveTaskResult(records.map(record => record.event), messageId, !hasMore)
}
