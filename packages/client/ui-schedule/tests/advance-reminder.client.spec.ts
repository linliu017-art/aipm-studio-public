// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ScheduleCatalogEntry, ScheduleId } from '@deepseek-ai/dsh-schedule/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { collectAdvanceReminders, dismissAdvanceReminder, readAdvanceReminder, setAdvanceReminder, snoozeAdvanceReminder } from '../src/client/advance-reminder.ts'

const task: ScheduleCatalogEntry = { id: 'test-reminder' as ScheduleId, sessionId: 'test-session' as SessionId,
  kind: 'at', title: 'Review', prompt: 'Review', status: 'active', scheduledAt: '2026-11-05T10:00:00.000Z' }
afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('workbench advance reminders', () => {
  it('expires the advance reminder at the task time', () => {
    setAdvanceReminder(task.id, 5)
    const notice = { task, occurrenceAt: task.scheduledAt }
    expect(collectAdvanceReminders([task], Date.parse('2026-11-05T09:54:59Z'))).toEqual([])
    expect(collectAdvanceReminders([task], Date.parse('2026-11-05T09:55:00Z'))).toEqual([notice])
    expect(collectAdvanceReminders([task], Date.parse('2026-11-05T09:59:59Z'))).toEqual([notice])
    expect(collectAdvanceReminders([task], Date.parse('2026-11-05T10:00:00Z'))).toEqual([])
    expect(collectAdvanceReminders([{ ...task, status: 'inactive' }], Date.parse('2026-11-05T10:01:00Z'))).toEqual([])
  })
  it('does not show a missed advance reminder after the task time', () => {
    setAdvanceReminder(task.id, 5)
    expect(collectAdvanceReminders([task], Date.parse('2026-11-05T10:01:00Z'))).toEqual([])
  })
  it('does not snooze beyond the task time', () => {
    setAdvanceReminder(task.id, 5)
    const now = Date.parse('2026-11-05T09:55:00Z')
    collectAdvanceReminders([task], now)
    snoozeAdvanceReminder(task.id, task.scheduledAt, now)
    expect(readAdvanceReminder(task.id)?.snoozedUntil).toBeUndefined()
  })
  it('supports changing, disabling, and the next recurring occurrence', () => {
    setAdvanceReminder(task.id, 10)
    expect(readAdvanceReminder(task.id)?.minutes).toBe(10)
    expect(collectAdvanceReminders([task], Date.parse('2026-11-05T09:50:00Z'))).toHaveLength(1)
    dismissAdvanceReminder(task.id, task.scheduledAt)
    const next = { ...task, scheduledAt: '2026-11-06T10:00:00.000Z' }
    expect(collectAdvanceReminders([next], Date.parse('2026-11-06T09:50:00Z'))).toEqual([{ task: next, occurrenceAt: next.scheduledAt }])
    setAdvanceReminder(task.id, 0)
    expect(readAdvanceReminder(task.id)).toBeUndefined()
    expect(collectAdvanceReminders([next], Date.parse('2026-11-06T09:51:00Z'))).toEqual([])
  })
  it('hides a snoozed reminder and restores it after five minutes', () => {
    setAdvanceReminder(task.id, 10)
    const now = Date.parse('2026-11-05T09:50:00Z')
    expect(collectAdvanceReminders([task], now)).toHaveLength(1)
    snoozeAdvanceReminder(task.id, task.scheduledAt, now)
    expect(collectAdvanceReminders([task], now + 4 * 60_000)).toEqual([])
    expect(collectAdvanceReminders([task], now + 5 * 60_000)).toEqual([{ task, occurrenceAt: task.scheduledAt }])
    expect(readAdvanceReminder(task.id)?.snoozedUntil).toBeUndefined()
  })
  it('does not emit when the browser cannot persist the reminder', () => {
    setAdvanceReminder(task.id, 5)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('unavailable') })
    expect(collectAdvanceReminders([task], Date.parse('2026-11-05T09:55:00Z'))).toEqual([])
  })
})
