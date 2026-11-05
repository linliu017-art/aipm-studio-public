/** Derive a conservative result preview from one complete Session log window. */
export interface ResultEvent {
  readonly type: string
  readonly data: unknown
}
export type TaskResult =
  | { readonly kind: 'waiting' | 'running' | 'unavailable' }
  | { readonly kind: 'ambiguous'; readonly hasFiles?: true }
  | { readonly kind: 'failed'; readonly reason: string }
  | { readonly kind: 'completed'; readonly text: string; readonly hasFiles?: true }

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}
function textContent(value: unknown): string {
  if (!Array.isArray(value)) return ''
  return value.flatMap((part) => {
    const item = object(part)
    return item?.type === 'text' && typeof item.text === 'string' ? [item.text] : []
  }).join('\n').trim()
}
/** Only a matched message and a terminal turn can establish a result. */
export function resolveTaskResult(events: readonly ResultEvent[], messageId: string, complete: boolean): TaskResult {
  let found = false
  let mixed = false
  let turn: number | undefined
  let answer = ''
  const presentedFiles: string[] = []
  let priorInput = false
  for (const event of events) {
    const data = object(event.data)
    if (event.type === 'turn/start' && typeof data?.turn === 'number') {
      if (found) return { kind: 'unavailable' }
      turn = data.turn
      priorInput = false
    }
    if (event.type === 'user/message') {
      if (data?.id === messageId) {
        if (turn === undefined) return { kind: 'unavailable' }
        found = true
        mixed = priorInput
        const content = textContent(data.content)
        const batch = content.match(/(?:^|\n)reminders_json: (.+)/)
        if (batch !== null) {
          try {
            const reminders: unknown = JSON.parse(batch[1] as string)
            if (!Array.isArray(reminders) || reminders.length !== 1) mixed = true
          }
          catch { mixed = true }
        }
      } else {
        const source = object(data?.source)
        const contextOnly = source?.kind === 'runtime-context' || source?.kind === 'time-context'
        if (!contextOnly && found) mixed = true
        else if (!contextOnly) priorInput = true
      }
    }
    if (!found) continue
    const files = data?.files
    if (event.type === 'deliverables/presented' && data?.turn === turn && Array.isArray(files)) {
      for (const file of files) {
        const path = object(file)?.path
        if (typeof path === 'string' && path.trim() !== '') presentedFiles.push(path)
      }
    }
    if (event.type === 'assistant/message' && data?.turn === turn) {
      const message = object(data?.message)
      const text = textContent(message?.content)
      if (text !== '') answer = text
    }
    if (event.type === 'turn/end' && data?.turn === turn) {
      const reason = object(data?.reason)
      if (reason?.kind !== 'completed') return { kind: 'failed', reason: typeof reason?.kind === 'string' ? reason.kind : 'unknown' }
      if (mixed) return { kind: 'ambiguous', ...(presentedFiles.length > 0 ? { hasFiles: true as const } : {}) }
      const text = answer || presentedFiles.join('\n')
      return text === '' ? { kind: 'unavailable' } : { kind: 'completed', text, ...(presentedFiles.length > 0 ? { hasFiles: true as const } : {}) }
    }
  }
  return found ? { kind: 'running' } : complete ? { kind: 'waiting' } : { kind: 'unavailable' }
}
