import { useEffect, useRef, useState } from 'react'
import { IconClockOutlineRegular, IconCloseOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ScheduleCatalogEntry } from '@deepseek-ai/dsh-schedule/client'
import type { CatalogInjected } from './catalog-source.ts'
import { collectAdvanceReminders, dismissAdvanceReminder, readAdvanceReminder, REMINDER_CHANGED, snoozeAdvanceReminder } from './advance-reminder.ts'
import type { AdvanceNotice } from './advance-reminder.ts'
import { createReminderSound } from './reminder-sound.ts'
import css from './AdvanceReminder.module.css'

type Translate = PropsLocale<'schedule.manager'>['t']

/** Reusable interval field for creation and existing tasks. */
export function ReminderField({ value, onChange, disabled, t }: {
  value: number
  onChange: (value: number) => void
  disabled?: boolean
  t: Translate
}) {
  const standard = [0, 5, 10, 30, 60]
  const [custom, setCustom] = useState(!standard.includes(value))
  return <div className={css.field}>
    <label>{t('advance.label')}<select value={custom ? 'custom' : String(value)} disabled={disabled} onChange={(event) => {
      const next = event.currentTarget.value
      setCustom(next === 'custom')
      onChange(next === 'custom' ? 1 : Number(next))
    }}>
      <option value="0">{t('advance.none')}</option>
      {[5, 10, 30, 60].map(minutes => <option key={minutes} value={minutes}>{t('advance.minutes', { minutes: String(minutes) })}</option>)}
      <option value="custom">{t('advance.custom')}</option>
    </select></label>
    {custom && <label>{t('advance.customMinutes')}<input type="number" min="1" max="10080" step="1" value={value}
      disabled={disabled} onChange={(event) => { onChange(Number(event.currentTarget.value)) }} /></label>}
  </div>
}

type ReminderOverlayProps = PropsRuntime<'shell.overlay'> & PropsLocale<'schedule.manager'>
  & InjectFace<Pick<CatalogInjected<ScheduleCatalogEntry>, 'hooks'> & { openTask: (id: ScheduleCatalogEntry['id']) => void }>

/** Monitor the task catalog while a workbench page is open. */
export function AdvanceReminderOverlay({ useCatalog, openTask, t }: ReminderOverlayProps) {
  const catalog = useCatalog(snapshot => snapshot)
  const [notices, setNotices] = useState<AdvanceNotice[]>([])
  const sound = useRef<ReturnType<typeof createReminderSound> | null>(null)
  useEffect(() => {
    const player = createReminderSound()
    sound.current = player
    return () => { sound.current = null; player.dispose() }
  }, [])
  useEffect(() => {
    const check = () => {
      if (!catalog.settled) return
      const pendingBefore = new Set(catalog.records.flatMap((task) => {
        const occurrence = readAdvanceReminder(task.id)?.pendingFor
        const rule = readAdvanceReminder(task.id)
        return occurrence === undefined || rule?.snoozedUntil !== undefined ? [] : [`${task.id}:${occurrence}`]
      }))
      const next = collectAdvanceReminders(catalog.records, Date.now())
      if (next.some(item => !pendingBefore.has(`${item.task.id}:${item.occurrenceAt}`))) sound.current?.play()
      setNotices(next)
    }
    check()
    const timer = window.setInterval(check, 1000)
    window.addEventListener(REMINDER_CHANGED, check)
    window.addEventListener('storage', check)
    return () => { window.clearInterval(timer); window.removeEventListener(REMINDER_CHANGED, check); window.removeEventListener('storage', check) }
  }, [catalog.records, catalog.settled])
  if (notices.length === 0) return null
  return <div className={css.notices} aria-label={t('advance.notices')}>
    {notices.map(({ task, occurrenceAt }) => <div key={`${task.id}-${occurrenceAt}`} className={css.notice} role="alert">
      <div className={css.noticeHead}>
        <span className={css.noticeIcon} aria-hidden><IconClockOutlineRegular size={20} /></span>
        <div className={css.noticeContent}>
          <div className={css.noticeKicker}>{t('advance.kicker')}</div>
          <strong className={css.noticeTitle}>{task.title}</strong>
          <div className={css.noticeTime}>{t('advance.taskTime', { time: new Date(occurrenceAt).toLocaleString(t('time.locale')) })}</div>
        </div>
        <button type="button" className={css.noticeClose} aria-label={t('advance.dismiss')} title={t('advance.dismiss')}
          onClick={() => { try { dismissAdvanceReminder(task.id, occurrenceAt) } catch { /* Keep notice on failure. */ } }}>
          <IconCloseOutlineRegular size={16} />
        </button>
      </div>
      <div className={css.noticeActions}>
        {Date.parse(occurrenceAt) - Date.now() > 5 * 60_000 && <button type="button" className={css.noticeLater} onClick={() => {
          try { snoozeAdvanceReminder(task.id, occurrenceAt, Date.now()) } catch { /* Keep notice on failure. */ }
        }}>{t('advance.snooze')}</button>}
        <button type="button" className={css.noticeOpen} onClick={() => { openTask(task.id) }}>{t('advance.openTask')}</button>
      </div>
    </div>)}
  </div>
}
