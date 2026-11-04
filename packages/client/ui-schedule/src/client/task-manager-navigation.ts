import type { ScheduleId } from '@deepseek-ai/dsh-schedule/client'

export const SELECTED_TASK_KEY = 'dsh.schedule.selected-task.v1'
export const OPEN_TASK_EVENT = 'dsh-schedule-open-task'
let requestedTask: ScheduleId | null = null

export function requestTaskOpen(id: ScheduleId): void {
  requestedTask = id
  try { sessionStorage.setItem(SELECTED_TASK_KEY, id) } catch { /* The in-memory request still works. */ }
  window.dispatchEvent(new CustomEvent(OPEN_TASK_EVENT, { detail: id }))
}

export function selectedTaskForPage(): ScheduleId | null {
  if (requestedTask !== null) return requestedTask
  try { return sessionStorage.getItem(SELECTED_TASK_KEY) as ScheduleId | null } catch { return null }
}

export function clearTaskOpenRequest(): void { requestedTask = null }
