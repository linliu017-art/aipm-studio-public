import { expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { agentFor, harness } from './harness.ts'

it('runs a paused task once without changing its rule or target and records the delivery', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-04T00:00:00Z'))
  const test = await harness()
  try {
    const sessionId = SessionId('manual-run')
    const agent = agentFor(test.ctx, sessionId)
    test.resolve.mockResolvedValue({ agent } as never)
    const task = await test.service.create(sessionId, { title: 'Report', prompt: 'Write report', daily: { time: '09:00:00', time_zone: 'Asia/Shanghai' } })
    expect(await test.service.setPaused({ id: task.id, sessionId, paused: true })).toEqual({ ok: true })
    const before = (await test.service.catalog())[0]!
    const result = await test.service.runNow({ id: task.id, sessionId })
    const after = (await test.service.catalog())[0]!
    expect(after.status).toBe('paused')
    expect(after.scheduledAt).toBe(before.scheduledAt)
    expect(after.lastDelivery?.messageId).toBe(result.messageId)
    expect(agent.followup).toHaveBeenCalledOnce()
    expect(agent.followup.mock.calls[0]![0].content[0]).toMatchObject({ type: 'text', text: expect.stringContaining('Write report') })
    const history = await test.service.history({ id: task.id, sessionId, limit: 20 })
    expect(history).toMatchObject({ records: [{ messageId: result.messageId, prompt: 'Write report' }] })
  } finally { await test.ctx.fiber.dispose(); vi.restoreAllMocks(); vi.useRealTimers() }
})

it('refuses a task belonging to another Session without dispatching', async () => {
  const test = await harness()
  try {
    const sessionId = SessionId('manual-owner')
    const agent = agentFor(test.ctx, sessionId)
    test.resolve.mockResolvedValue({ agent } as never)
    const task = await test.service.create(sessionId, { title: 'Report', prompt: 'Write report', after_seconds: 3600 })
    await expect(test.service.runNow({ id: task.id, sessionId: SessionId('different') })).rejects.toThrow('Task is unavailable')
    expect(agent.followup).not.toHaveBeenCalled()
    expect(test.resolve).not.toHaveBeenCalled()
  } finally { await test.ctx.fiber.dispose() }
})

it('ends a one-time task after manual delivery and retains its receipt', async () => {
  const test = await harness()
  try {
    const sessionId = SessionId('manual-one-shot')
    const agent = agentFor(test.ctx, sessionId)
    test.resolve.mockResolvedValue({ agent } as never)
    const task = await test.service.create(sessionId, { title: 'One time', prompt: 'Check', after_seconds: 3600 })
    const receipt = await test.service.runNow({ id: task.id, sessionId })
    const result = (await test.service.catalog()).find(item => item.id === task.id)!
    expect(result.status).toBe('inactive')
    expect(result.lastDelivery?.messageId).toBe(receipt.messageId)
    expect(await test.service.list({ sessionId })).toHaveLength(0)
  } finally { await test.ctx.fiber.dispose() }
})

it('keeps a one-time task scheduled when delivery cannot be acknowledged', async () => {
  const test = await harness()
  try {
    const sessionId = SessionId('manual-failed')
    const agent = agentFor(test.ctx, sessionId)
    test.resolve.mockResolvedValue({ agent } as never)
    const task = await test.service.create(sessionId, { title: 'One time', prompt: 'Check', after_seconds: 3600 })
    vi.spyOn(test.ctx.sessions, 'flush').mockResolvedValue(false)
    await expect(test.service.runNow({ id: task.id, sessionId })).rejects.toThrow('did not acknowledge')
    const result = (await test.service.catalog()).find(item => item.id === task.id)!
    expect(result.status).toBe('active')
    expect(result.lastDelivery).toBeUndefined()
  } finally { vi.restoreAllMocks(); await test.ctx.fiber.dispose() }
})
