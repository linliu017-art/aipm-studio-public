import { useEffect, useRef, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TaskResult } from './result-resolver.ts'
import css from './TaskManagerPage.module.css'

export type LoadTaskResult = (sessionId: SessionId, messageId: string, signal: AbortSignal) => Promise<TaskResult>

type Props = PropsLocale<'schedule.manager'> & {
  sessionId: SessionId
  messageId: string | undefined
  loadResult: LoadTaskResult
  onViewed?: (id: string) => void
}

export function TaskResultPreview({ sessionId, messageId, loadResult, onViewed, t }: Props) {
  const viewed = useRef(onViewed)
  viewed.current = onViewed
  const [result, setResult] = useState<TaskResult | 'loading' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    if (messageId === undefined) return
    const abort = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    setExpanded(false)
    setResult('loading')
    const load = async () => {
      try {
        const next = await loadResult(sessionId, messageId, abort.signal)
        if (abort.signal.aborted) return
        setResult(next)
        if (next.kind === 'completed' || next.kind === 'failed' || next.kind === 'ambiguous') viewed.current?.(messageId)
        if (next.kind === 'waiting' || next.kind === 'running') timer = setTimeout(() => { void load() }, 10000)
      } catch {
        if (!abort.signal.aborted) setResult('error')
      }
    }
    void load()
    return () => { abort.abort(); if (timer !== undefined) clearTimeout(timer) }
  }, [sessionId, messageId, loadResult, attempt])
  if (messageId === undefined) return <p className={css.resultEmpty}>{t('result.empty')}</p>
  if (result === 'loading') return <p role="status">{t('result.loading')}</p>
  if (result === 'error') return <div><p role="alert">{t('result.error')}</p><Button onClick={() => { setAttempt(value => value + 1) }}>{t('delivery.retry')}</Button></div>
  if (result.kind === 'completed') {
    const long = result.text.length > 800
    const text = long && !expanded ? `${result.text.slice(0, 800)}…` : result.text
    return <div><p className={css.resultStatus}>{t('result.completed')}</p><div className={css.resultText}>{text}</div>
      {long && <Button size="sm" onClick={() => { setExpanded(value => !value) }}>{t(expanded ? 'delivery.collapse' : 'result.full')}</Button>}
    </div>
  }
  const key = result.kind === 'failed' ? 'result.failed' : result.kind === 'running' ? 'result.running'
    : result.kind === 'waiting' ? 'result.waiting' : result.kind === 'ambiguous' ? 'result.ambiguous' : 'result.unavailable'
  return <p role="status">{t(key)}</p>
}
