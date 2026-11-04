import { useId, useRef, useState } from 'react'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { Button, IconCloseOutlineRegular, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ScheduleCreateRequest } from '@deepseek-ai/dsh-schedule/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { ReminderField } from './AdvanceReminder.tsx'
import css from './CreateTaskForm.module.css'

export interface CreateTaskInput {
  readonly sessionId: SessionId
  readonly requestId: string
  readonly workspaceId?: WorkspaceId
  readonly schedule: ScheduleCreateRequest
  readonly remindBeforeMinutes: number
}

export function CreateTaskForm({ onCreate, onClose, useWorkspaces, t }: PropsLocale<'schedule.manager'>
  & Pick<PropsRuntime<'main'>, 'useWorkspaces'> & { onCreate: (input: CreateTaskInput) => Promise<void>; onClose: () => void }) {
  const workspaces = useWorkspaces(snapshot => snapshot)
  const projectId = useId()
  const [title, setTitle] = useState('')
  const [prompt, setPrompt] = useState('')
  const [kind, setKind] = useState<'once' | 'daily' | 'weekly'>('once')
  const [date, setDate] = useState('')
  const [time, setTime] = useState(() => {
    const now = new Date()
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  })
  const [weekday, setWeekday] = useState('1')
  const [workspace, setWorkspace] = useState('')
  const [remindBeforeMinutes, setRemindBeforeMinutes] = useState(0)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)
  const attempt = useRef<CreateTaskInput | null>(null)
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const valid = title.trim() !== '' && title.trim().length <= 120 && prompt.trim() !== '' && time !== ''
    && Number.isSafeInteger(remindBeforeMinutes) && remindBeforeMinutes >= 0 && remindBeforeMinutes <= 10080
    && (kind !== 'once' || (date !== '' && new Date(`${date}T${time}`).getTime() > Date.now()))
  const submit = async () => {
    if (pending || (!valid && attempt.current === null)) return
    if (attempt.current === null) {
      const wallTime = time.length === 5 ? `${time}:00` : time
      const schedule: ScheduleCreateRequest = { title: title.trim(), prompt: prompt.trim(),
        ...(kind === 'once' ? { at: { date, time: wallTime, time_zone: zone } }
          : kind === 'daily' ? { daily: { time: wallTime, time_zone: zone } }
            : { weekly: { time: wallTime, time_zone: zone, weekdays: [Number(weekday)] } }) }
      attempt.current = { sessionId: `session-${randomUUID()}` as SessionId,
        requestId: randomUUID(), schedule, remindBeforeMinutes, ...(workspace === '' ? {} : { workspaceId: workspace as WorkspaceId }) }
    }
    setPending(true)
    setError(false)
    try { await onCreate(attempt.current); onClose() }
    catch { setError(true) }
    finally { setPending(false) }
  }
  return <Modal open className={css.dialog as string} title={t('create.title')} closeLabel={t('create.cancel')} onClose={() => { if (!pending) onClose() }}>
    <form className={css.form} onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <fieldset disabled={pending || attempt.current !== null} className={css.fields}>
        <label>{t('create.name')}<input value={title} maxLength={120} onChange={(event) => { setTitle(event.currentTarget.value) }} /></label>
        <label>{t('create.instruction')}<textarea value={prompt} onChange={(event) => { setPrompt(event.currentTarget.value) }} /></label>
        <div className={css.projectField}>
          <label htmlFor={projectId}>{t('create.project')}</label>
          <div className={css.projectSelect}>
            <select id={projectId} value={workspace} data-clear={workspace !== ''} onChange={(event) => { setWorkspace(event.currentTarget.value) }}>
              <option value="" disabled hidden>{t('create.noProject')}</option>
              {workspaces.items.map(item => <option value={item.workspaceId} key={item.workspaceId}>{item.title}</option>)}
            </select>
            {workspace !== '' && <button type="button" className={css.clearProject} aria-label={t('create.clearProject')}
              title={t('create.clearProject')} onClick={() => { setWorkspace('') }}><IconCloseOutlineRegular size={14} /></button>}
          </div>
        </div>
        <label>{t('create.frequency')}<select value={kind} onChange={(event) => { setKind(event.currentTarget.value as typeof kind) }}>
          <option value="once">{t('create.once')}</option><option value="daily">{t('create.daily')}</option><option value="weekly">{t('create.weekly')}</option>
        </select></label>
        {kind === 'weekly' && <label>{t('create.weekday')}<select value={weekday} onChange={(event) => { setWeekday(event.currentTarget.value) }}>
          {[1,2,3,4,5,6,7].map(day => <option value={day} key={day}>{t(`create.day${day}` as 'create.day1')}</option>)}
        </select></label>}
        {kind === 'once' && <label>{t('create.date')}<input type="date" value={date} onChange={(event) => { setDate(event.currentTarget.value) }} /></label>}
        <label>{t('create.time')}<input type="time" value={time} onChange={(event) => { setTime(event.currentTarget.value) }} /></label>
        <span>{t('create.zone', { zone })}</span>
        <ReminderField value={remindBeforeMinutes} onChange={setRemindBeforeMinutes} t={t} />
      </fieldset>
      {error && <p role="alert">{t('create.error')}</p>}
      <div className={css.actions}><Button type="button" disabled={pending} onClick={onClose}>{t('create.cancel')}</Button>
        <Button type="submit" variant="primary" disabled={pending || (!valid && attempt.current === null)}>{t(pending ? 'create.saving' : error ? 'create.retry' : 'create.save')}</Button></div>
    </form>
  </Modal>
}
