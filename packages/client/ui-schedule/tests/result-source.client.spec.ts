import { describe, expect, it, vi } from 'vitest'
import type { SessionRemote } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { loadTaskResult } from '../src/client/result-source.ts'

const event = (seq: number, type: string, data: unknown) => ({ type: 'event', event: { seq, type, data } })
const older = [event(0, 'turn/start', { turn: 1 }), event(1, 'user/message', { id: 'receipt' })]
const newer = [event(2, 'assistant/message', { turn: 1, message: { content: [{ type: 'text', text: 'result' }] } }), event(3, 'turn/end', { turn: 1, reason: { kind: 'completed' } })]
describe('task result source', () => {
  it('loads older pages before matching a delivered message to its answer', async () => {
    const page = vi.fn(async () => ({ ok: true, value: { records: older, hasMore: false } }))
    const follow = vi.fn(async function* () { yield { type: 'snapshot', cursor: 3, records: newer, hasMore: true } })
    const remote = { follow, page } as unknown as SessionRemote
    const result = await loadTaskResult(remote, 'session' as SessionId, 'receipt', new AbortController().signal)
    expect(result).toEqual({ kind: 'completed', text: 'result' })
    expect(page).toHaveBeenCalledWith(expect.objectContaining({ throughSeq: 3, beforeSeq: 2 }), expect.any(AbortSignal))
  })
  it('does not mistake an unrelated completed answer for a pending delivery', async () => {
    const follow = vi.fn(async function* () { yield { type: 'snapshot', cursor: 3, records: [...older, ...newer], hasMore: false } })
    const remote = { follow } as unknown as SessionRemote
    expect(await loadTaskResult(remote, 'session' as SessionId, 'missing', new AbortController().signal)).toEqual({ kind: 'waiting' })
  })
})
