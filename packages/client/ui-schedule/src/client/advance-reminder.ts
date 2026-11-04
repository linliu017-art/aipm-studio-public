/** Browser-local settings and unacknowledged in-workbench notices. */
import type { ScheduleCatalogEntry } from '@deepseek-ai/dsh-schedule/client'

const PREFIX = 'dsh.schedule.advance-reminder.v1.'
export const REMINDER_CHANGED = 'dsh-schedule-reminder-changed'
export interface AdvanceReminder {
  readonly minutes: number
  readonly deliveredFor?: string
  readonly pendingFor?: string
  readonly snoozedUntil?: number
}
export interface AdvanceNotice { readonly task: ScheduleCatalogEntry; readonly occurrenceAt: string }

export function readAdvanceReminder(id: string): AdvanceReminder | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + id)
    if (raw === null) return undefined
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null || !('minutes' in value)) return undefined
    const minutes = value.minutes
    if (typeof minutes !== 'number' || !Number.isSafeInteger(minutes) || minutes < 1 || minutes > 10080) return undefined
    return { minutes,
      ...('deliveredFor' in value && typeof value.deliveredFor === 'string' ? { deliveredFor: value.deliveredFor } : {}),
      ...('pendingFor' in value && typeof value.pendingFor === 'string' ? { pendingFor: value.pendingFor } : {}),
      ...('snoozedUntil' in value && typeof value.snoozedUntil === 'number' && Number.isFinite(value.snoozedUntil)
        ? { snoozedUntil: value.snoozedUntil } : {}) }
  } catch { return undefined }
}

export function setAdvanceReminder(id: string, minutes: number): void {
  if (!Number.isSafeInteger(minutes) || minutes < 0 || minutes > 10080) throw new Error('Invalid reminder interval')
  const existing = readAdvanceReminder(id)
  if (minutes === 0) localStorage.removeItem(PREFIX + id)
  else if (existing?.minutes !== minutes) localStorage.setItem(PREFIX + id, JSON.stringify({ ...existing, minutes }))
  window.dispatchEvent(new Event(REMINDER_CHANGED))
}

export function dismissAdvanceReminder(id: string, occurrenceAt: string): void {
  const rule = readAdvanceReminder(id)
  if (rule?.pendingFor !== occurrenceAt) return
  localStorage.setItem(PREFIX + id, JSON.stringify({ minutes: rule.minutes, deliveredFor: rule.deliveredFor }))
  window.dispatchEvent(new Event(REMINDER_CHANGED))
}

/** Hide this notice temporarily and show it again after five minutes. */
export function snoozeAdvanceReminder(id: string, occurrenceAt: string, now: number): void {
  const rule = readAdvanceReminder(id)
  if (rule?.pendingFor !== occurrenceAt || now + 5 * 60_000 >= Date.parse(occurrenceAt)) return
  localStorage.setItem(PREFIX + id, JSON.stringify({ ...rule, snoozedUntil: now + 5 * 60_000 }))
  window.dispatchEvent(new Event(REMINDER_CHANGED))
}

/** Show pending notices only until their scheduled occurrence. */
export function collectAdvanceReminders(records: readonly ScheduleCatalogEntry[], now: number): AdvanceNotice[] {
  const notices: AdvanceNotice[] = []
  for (const task of records) {
    const rule = readAdvanceReminder(task.id)
    if (rule === undefined) continue
    if (rule.pendingFor !== undefined) {
      if (task.status !== 'active' || !Number.isFinite(Date.parse(rule.pendingFor))
        || now >= Date.parse(rule.pendingFor) || rule.pendingFor !== task.scheduledAt) {
        try {
          localStorage.setItem(PREFIX + task.id, JSON.stringify({ minutes: rule.minutes, deliveredFor: rule.deliveredFor }))
        } catch { /* Do not show expired notices. */ }
        continue
      }
      if (rule.snoozedUntil !== undefined) {
        if (now < rule.snoozedUntil) continue
        try {
          localStorage.setItem(PREFIX + task.id, JSON.stringify({ minutes: rule.minutes,
            deliveredFor: rule.deliveredFor, pendingFor: rule.pendingFor }))
        } catch { continue }
      }
      notices.push({ task, occurrenceAt: rule.pendingFor })
      continue
    }
    const nextTime = Date.parse(task.scheduledAt)
    const candidate = task.status === 'active' && Number.isFinite(nextTime) && now < nextTime
      && now >= nextTime - rule.minutes * 60_000 ? task.scheduledAt : undefined
    if (candidate === undefined || rule.deliveredFor === candidate) continue
    try {
      localStorage.setItem(PREFIX + task.id, JSON.stringify({ ...rule, deliveredFor: candidate, pendingFor: candidate }))
      notices.push({ task, occurrenceAt: candidate })
    } catch { /* Without durable storage do not pretend the notice was saved. */ }
  }
  return notices
}
