import { describe, expect, it } from 'vitest'
import { resolveTaskResult } from '../src/client/result-resolver.ts'

const start = { type: 'turn/start', data: { turn: 1 } }
const prompt = { type: 'user/message', data: { id: 'task' } }
const answer = { type: 'assistant/message', data: { turn: 1, message: { content: [{ type: 'text', text: 'report' }] } } }
const end = { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } }
describe('task result correlation', () => {
  it('only shows the answer from the matching completed turn', () => {
    expect(resolveTaskResult([start, prompt, answer, end], 'task', true)).toEqual({ kind: 'completed', text: 'report' })
  })
  it('does not attribute a combined batch or prior input to one task', () => {
    const batch = { type: 'user/message', data: { id: 'task', content: [{ type: 'text', text: '[SCHEDULE REMINDER BATCH]\nreminders_json: [{"schedule_id":"a"},{"schedule_id":"b"}]' }] } }
    expect(resolveTaskResult([start, batch, answer, end], 'task', true)).toEqual({ kind: 'ambiguous' })
    expect(resolveTaskResult([start, { type: 'user/message', data: { id: 'human' } }, prompt, answer, end], 'task', true)).toEqual({ kind: 'ambiguous' })
  })
  it('allows routine runtime and time context within the matching turn', () => {
    const runtime = { type: 'user/message', data: { id: 'context', source: { kind: 'runtime-context' } } }
    const clock = { type: 'user/message', data: { id: 'clock', source: { kind: 'time-context' } } }
    expect(resolveTaskResult([start, prompt, runtime, clock, answer, end], 'task', true)).toEqual({ kind: 'completed', text: 'report' })
  })
  it('keeps file evidence on a completed shared turn', () => {
    const other = { type: 'user/message', data: { id: 'other' } }
    const file = { type: 'deliverables/presented', data: { turn: 1, files: [{ path: 'report.md' }] } }
    expect(resolveTaskResult([start, prompt, other, file, end], 'task', true)).toEqual({ kind: 'ambiguous', hasFiles: true })
  })
  it('recognizes a presented file when there is no assistant text', () => {
    const file = { type: 'deliverables/presented', data: { turn: 1, files: [{ path: 'report.md' }] } }
    expect(resolveTaskResult([start, prompt, file, end], 'task', true)).toEqual({ kind: 'completed', text: 'report.md', hasFiles: true })
  })
  it('does not label delivery as completion', () => {
    expect(resolveTaskResult([start, prompt], 'task', true)).toEqual({ kind: 'running' })
    expect(resolveTaskResult([], 'task', true)).toEqual({ kind: 'waiting' })
    expect(resolveTaskResult([], 'task', false)).toEqual({ kind: 'unavailable' })
  })
  it('does not credit a mixed turn or a failed turn as success', () => {
    expect(resolveTaskResult([start, prompt, { type: 'user/message', data: { id: 'other' } }, answer, end], 'task', true)).toEqual({ kind: 'ambiguous' })
    expect(resolveTaskResult([start, prompt, answer, { type: 'turn/end', data: { turn: 1, reason: { kind: 'error' } } }], 'task', true)).toEqual({ kind: 'failed', reason: 'error' })
  })
})
