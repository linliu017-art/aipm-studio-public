import { expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { agentFor, harness } from './harness.ts'

it('creates one durable task for a browser request, including after an uncertain retry', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-04T00:00:00Z'))
  const test = await harness()
  try {
    const sessionId = SessionId('task-create-test')
    const agent = agentFor(test.ctx, sessionId)
    vi.spyOn(test.ctx.agents, 'get').mockReturnValue(agent)
    const request = { sessionId, requestId: 'ac816e43-7a0e-4cc3-905d-b745cd2585b3',
      schedule: { title: 'Reminder', prompt: 'Review changes', at: '2026-11-04T00:01:00Z' } }
    const first = await test.service.createFromClient(request)
    vi.setSystemTime(new Date('2026-11-04T00:02:00Z'))
    expect(await test.service.createFromClient(request)).toEqual(first)
    expect(await test.service.catalog()).toHaveLength(1)
  } finally {
    await test.ctx.fiber.dispose()
    vi.restoreAllMocks()
    vi.useRealTimers()
  }
})
