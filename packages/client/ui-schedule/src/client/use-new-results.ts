import { useCallback, useEffect, useRef, useState } from 'react'
import type { ScheduleCatalogEntry, ScheduleDeliveryRecord } from '@deepseek-ai/dsh-schedule/client'
import type { DeliveryHistoryInjected } from './DeliveryHistory.tsx'
import type { LoadTaskResult } from './TaskResultPreview.tsx'
import { hasContentResult, requestsContent } from './content-task.ts'

const KEY = 'dsh.schedule.read-results.v1'
type Entry = { task: ScheduleCatalogEntry; record: ScheduleDeliveryRecord; kind: 'completed' | 'failed' | 'ambiguous' }
type Snapshot = { entries: Entry[]; error: boolean; limited: boolean }
function key(task: ScheduleCatalogEntry, id: string): string { return `${task.id}:${id}` }
function readKeys(): Set<string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return new Set(Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [])
  } catch { return new Set() }
}

/** Find unviewed, settled deliveries without mistaking delivery acknowledgements for results. */
export function useNewResults(records: readonly ScheduleCatalogEntry[], loadHistory: DeliveryHistoryInjected['loadHistory'] | undefined, loadResult: LoadTaskResult) {
  const [read, setRead] = useState(readKeys)
  const [snapshot, setSnapshot] = useState<Snapshot>({ entries: [], error: false, limited: false })
  const cache = useRef(new Map<string, Entry['kind']>())
  const markRead = useCallback((task: ScheduleCatalogEntry, id: string) => {
    setRead((current) => {
      const next = new Set(current); next.add(key(task, id))
      try { localStorage.setItem(KEY, JSON.stringify([...next])) } catch { /* Keep this page's state. */ }
      return next
    })
  }, [])
  const signature = JSON.stringify(records.map(task => [task.id, task.sessionId, task.lastDelivery?.messageId, task.title]))
  useEffect(() => {
    if (loadHistory === undefined) return
    const abort = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      const entries: Entry[] = []; let error = false; let limited = false
      for (const task of records) {
        if (task.lastDelivery === undefined) continue
        let before: ScheduleDeliveryRecord['messageId'] | undefined
        for (let page = 0; page < 5; page++) {
          if (abort.signal.aborted) return
          try {
            const response = await loadHistory({
              id: task.id, sessionId: task.sessionId, limit: 100, ...(before === undefined ? {} : { before }),
            })
            if (!response.ok || 'code' in response.value) { error = true; break }
            for (const record of response.value.records) {
              const id = key(task, record.messageId)
              if (read.has(id) || !requestsContent(record.prompt)) continue
              let kind = cache.current.get(id)
              if (kind === undefined) {
                const result = await loadResult(task.sessionId, record.messageId, abort.signal)
                if ((result.kind === 'completed' && (result.hasFiles === true || hasContentResult(result.text)))
                  || (result.kind === 'ambiguous' && result.hasFiles === true)) {
                  kind = result.kind; cache.current.set(id, kind)
                }
              }
              if (kind !== undefined) entries.push({ task, record, kind })
            }
            before = response.value.nextBefore
            if (before === undefined) break
            if (page === 4) limited = true
          } catch { if (!abort.signal.aborted) error = true; break }
        }
      }
      if (abort.signal.aborted) return
      entries.sort((a, b) => Date.parse(b.record.deliveredAt) - Date.parse(a.record.deliveredAt))
      setSnapshot({ entries, error, limited })
      timer = setTimeout(() => { void load() }, 15000)
    }
    void load()
    return () => { abort.abort(); if (timer !== undefined) clearTimeout(timer) }
    // The signature avoids restarting reads on equivalent catalog snapshots.
  }, [signature, loadHistory, loadResult, read])
  return { ...snapshot, entries: snapshot.entries.filter(entry => !read.has(key(entry.task, entry.record.messageId))), markRead }
}
