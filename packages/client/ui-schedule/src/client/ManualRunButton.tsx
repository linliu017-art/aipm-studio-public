import { useSyncExternalStore } from 'react'
import { Button, IconPlayOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ScheduleCatalogEntry } from '@deepseek-ai/dsh-schedule/client'
import type { ManualRunController } from './manual-run.ts'
import { taskName } from './schedule-format.ts'
import css from './TaskManagerPage.module.css'

export function ManualRunButton({ task, controller, compact, t }: { task: ScheduleCatalogEntry; controller: ManualRunController; compact?: boolean } & PropsLocale<'schedule.manager'>) {
  const states = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const state = states.get(task.id)
  const label = t(state === 'running' ? 'run.running' : 'run.action')
  return <span className={compact ? css.rowRun : css.detailRun}>
    <Button size="sm" disabled={state === 'running'} title={state === 'unknown' ? t('run.unknown') : label}
      aria-label={`${label}：${taskName(task)}`} onClick={() => { controller.run(task) }}>
      <IconPlayOutlineRegular size={14} /><span className={css.runText}>{label}</span>
    </Button>
    {state === 'unknown' && <span role="alert" className={css.runWarning}>{t('run.unknown')}</span>}
  </span>
}
