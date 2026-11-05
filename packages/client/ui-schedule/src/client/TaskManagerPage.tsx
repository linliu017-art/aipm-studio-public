/** Cross-session retained reminders with local search and selection. */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  Button, IconClockOutlineRegular, IconCloseOutlineRegular, IconEllipsisOutlineRegular,
  IconPlusOutlineRegular, IconSearchOutlineRegular, Input, Modal,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { ScheduleCatalogEntry, ScheduleId } from '@deepseek-ai/dsh-schedule/client'
import type { CatalogSnapshot } from './catalog-source.ts'
import { CatalogFeedback } from './CatalogFeedback.tsx'
import { TaskDetail, useTaskDetail, type TaskDetailInjected } from './TaskDetail.tsx'
import { useRelativeClock } from './relative-clock.ts'
import { formatScheduleFrequency, nextRunParts, taskName, zoneLabel } from './schedule-format.ts'
import type { FrequencyZone } from './schedule-format.ts'
import { CreateTaskForm, type CreateTaskInput } from './CreateTaskForm.tsx'
import { clearTaskOpenRequest, OPEN_TASK_EVENT, selectedTaskForPage, SELECTED_TASK_KEY } from './task-manager-navigation.ts'
import { TaskMenu } from './TaskMenu.tsx'
import { ManualRunButton } from './ManualRunButton.tsx'
import { useNewResults } from './use-new-results.ts'
import css from './TaskManagerPage.module.css'

/** Injected catalog and task actions for the management page. */
export interface TaskManagerInjected extends TaskDetailInjected {
  /** Host task catalog with its query and deletion state. */
  readonly hooks: { readonly catalog: HostObservable<CatalogSnapshot<ScheduleCatalogEntry>> }
  readonly onCreateTask: (input: CreateTaskInput) => Promise<void>
  readonly loadResultsHistory?: TaskDetailInjected['loadHistory']
}

/** Root-scoped task catalog props derived from the framework and injected actions. */
export type TaskManagerPageProps = PropsRuntime<'main'>
  & InjectFace<TaskManagerInjected>
  & PropsLocale<'schedule.manager'>

type StatusFilter = 'all' | ScheduleCatalogEntry['status']

/**
 * Render retained tasks with authoritative deletion and timing-only edits.
 * @param props - framework catalog snapshot, localized copy, and action callbacks.
 * @returns the searchable task list beside the selected task's detail.
 */
export function TaskManagerPage(props: TaskManagerPageProps) {
  const { useCatalog, onCreateTask, onRetry, t } = props
  const [creating, setCreating] = useState(false)
  const [resultsOpen, setResultsOpen] = useState(false)
  const resultsTrigger = useRef<HTMLButtonElement>(null)
  const [rowMenu, setRowMenu] = useState<ScheduleId | null>(null)
  const [deleteRow, setDeleteRow] = useState<ScheduleCatalogEntry | null>(null)
  const [rowError, setRowError] = useState<'past' | 'error' | null>(null)
  const [rowPending, setRowPending] = useState(false)
  const [endedExpanded, setEndedExpanded] = useState(false)
  const onNewTask = () => { setCreating(true) }
  const catalog = useCatalog(snapshot => snapshot)
  const { records, status } = catalog
  const newResults = useNewResults(records, props.loadResultsHistory, props.loadResult)
  const [requestedResult, setRequestedResult] = useState<{ taskId: ScheduleId; id: string; at: string }>()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selectedId, setSelectedId] = useState<ScheduleId | null>(selectedTaskForPage)
  useEffect(() => {
    try {
      if (selectedId === null) sessionStorage.removeItem(SELECTED_TASK_KEY)
      else sessionStorage.setItem(SELECTED_TASK_KEY, selectedId)
    } catch { /* Navigation remains usable without storage. */ }
  }, [selectedId])
  useEffect(() => {
    clearTaskOpenRequest()
    const onOpen = (event: Event) => {
      const id = (event as CustomEvent<unknown>).detail
      if (typeof id !== 'string') return
      clearTaskOpenRequest()
      setRequestedResult(undefined)
      setResultsOpen(false)
      setSelectedId(id as ScheduleId)
      setTab('result')
    }
    window.addEventListener(OPEN_TASK_EVENT, onOpen)
    return () => { window.removeEventListener(OPEN_TASK_EVENT, onOpen) }
  }, [])
  // The rows state how long remains, so they read the shared ticking clock
  // rather than a value sampled at mount: a catalog refresh can move the target
  // this text describes.
  const now = useRelativeClock()
  const detail = useTaskDetail(props, catalog, selectedId ?? undefined)
  const { record: catalogRecord, task: selected, id: detailId, confirmId, setConfirmId, setTab } = detail
  const rowRef = useRef<HTMLButtonElement | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const confirming = records.find(record => record.id === confirmId)
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return records.filter(record => (
      (statusFilter === 'all' || record.status === statusFilter)
      && (record.prompt.toLowerCase().includes(query)
        || record.sessionId.toLowerCase().includes(query)
        || taskName(record).toLowerCase().includes(query))
    )).toSorted((left, right) =>
      Date.parse(left.scheduledAt) - Date.parse(right.scheduledAt))
  }, [records, search, statusFilter])

  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const startOfTomorrow = new Date(startOfToday)
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1)
  // A recurring task already delivered today belongs with its next occurrence.
  const deliveredToday = (record: ScheduleCatalogEntry): boolean => {
    const delivered = record.lastDelivery === undefined ? NaN : Date.parse(record.lastDelivery.deliveredAt)
    return delivered >= startOfToday.getTime() && delivered < startOfTomorrow.getTime()
      && (record.kind === 'every' || record.kind === 'daily' || record.kind === 'weekly' || record.kind === 'cron')
  }
  const groups = [
    { id: 'overdue', title: t('group.overdue'), records: rows.filter(record => record.status === 'active' && Date.parse(record.scheduledAt) < startOfToday.getTime()) },
    { id: 'today', title: t('group.today'), records: rows.filter(record => record.status === 'active' && Date.parse(record.scheduledAt) >= startOfToday.getTime() && Date.parse(record.scheduledAt) < startOfTomorrow.getTime() && !deliveredToday(record)) },
    { id: 'upcoming', title: t('group.upcoming'), records: rows.filter(record => record.status === 'active' && (Date.parse(record.scheduledAt) >= startOfTomorrow.getTime() ||
      (Date.parse(record.scheduledAt) >= startOfToday.getTime() && deliveredToday(record)))) },
    { id: 'unknown', title: t('group.unknown'), records: rows.filter(record => record.status === 'active' && !Number.isFinite(Date.parse(record.scheduledAt))) },
    { id: 'paused', title: t('status.paused'), records: rows.filter(record => record.status === 'paused') },
    { id: 'ended', title: t('status.inactive'), records: rows.filter(record => record.status === 'inactive').toReversed() },
  ].filter(group => group.records.length > 0)
  const showEnded = endedExpanded || statusFilter === 'inactive' || search.trim() !== ''

  // An inactive-only filter is its own empty state: no task is inactive, rather than no task matched.
  const emptyTitle = statusFilter === 'inactive' && search.trim() === ''
    ? 'list.emptyInactive'
    : records.length === 0 ? 'list.empty' : 'list.noMatches'
  // The list's frequency line omits a rule zone equal to the host's and otherwise
  // names it, the same way the detail's Repeat row does.
  const systemZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const frequencyZone: FrequencyZone = { system: systemZone, label: zone => zoneLabel(zone, t) }
  const frequency = (record: ScheduleCatalogEntry): string => formatScheduleFrequency(record, t, frequencyZone)

  useEffect(() => {
    // The detail focuses its own panel; with nothing selected, focus returns
    // to the row that opened it, or to the page heading once that row is gone.
    if (selectedId !== null) return
    if (rowRef.current !== null) {
      const target = rowRef.current.isConnected ? rowRef.current : headingRef.current
      target?.focus()
      rowRef.current = null
    }
  }, [selectedId])

  useEffect(() => {
    if (status !== 'ready') return
    if (selectedId !== null && selected === undefined) setSelectedId(null)
    if (confirmId !== null && confirming === undefined) setConfirmId(null)
  }, [status, selectedId, selected, confirmId, confirming])

  const closeDetails = (): void => {
    setSelectedId(null)
  }

  return (
    <section
      className={clsx(css.page, (selected !== undefined || resultsOpen) && css.hasDetails)}
      aria-label={t('title')}
      data-testid="task-manager-page"
      onKeyDown={(event) => {
        // A dropdown that closed on this Escape has already consumed the key: the
        // Menu primitive closes from the document capture phase and calls
        // preventDefault there, before React dispatches this handler.
        if (event.key !== 'Escape' || event.defaultPrevented || confirmId !== null || (selectedId === null && !resultsOpen)) return
        event.preventDefault()
        event.stopPropagation()
        if (resultsOpen) { setResultsOpen(false); resultsTrigger.current?.focus() }
        else closeDetails()
      }}
    >
      <div className={css.listPane}>
        <div className={css.pageScroll}>
          <div className={css.pageContent}>
            <div className={css.pageHeading}>
              <h1 ref={headingRef} tabIndex={-1}>{t('title')}</h1>
              <div className={css.creationActions}>
                <button ref={resultsTrigger} type="button" className={css.resultsTrigger} aria-expanded={resultsOpen} aria-controls={resultsOpen ? 'new-results-panel' : undefined} onClick={() => {
                  setSelectedId(null); setResultsOpen(!resultsOpen)
                }}>{t('newResults.title')} <span>{newResults.entries.length}</span></button>
                <Button variant="primary" size="sm" className={css.newButton} icon={<IconPlusOutlineRegular size={13} />} onClick={onNewTask}>{t('new.action')}</Button>
              </div>
            </div>
            <div className={css.filters}>
              <div className={css.filterTabs} role="group" aria-label={t('statusFilter.label')}>
                {(['all', 'active', 'paused', 'inactive'] as const).map(value => (
                  <button
                    key={value}
                    type="button"
                    className={clsx(css.filterTab, statusFilter === value && css.filterTabActive)}
                    aria-pressed={statusFilter === value}
                    onClick={() => { setStatusFilter(value) }}
                  >
                    {t(value === 'all' ? 'statusFilter.all' : `status.${value}`)}
                  </button>
                ))}
              </div>
            </div>
            <div className={css.searchField}>
              <Input
                type="search"
                icon={<IconSearchOutlineRegular />}
                aria-label={t('search.label')}
                placeholder={t('search.placeholder')}
                value={search}
                onChange={(event) => { setSearch(event.target.value) }}
              />
              {search !== '' && <Button size="sm" className={css.searchClear} aria-label={t('search.clear')} onClick={() => { setSearch('') }}>
                <IconCloseOutlineRegular />
              </Button>}
            </div>
            {rowError !== null && <p role="alert">{t(rowError === 'past' ? 'task.statusPast' : 'task.statusError')}</p>}
            <div className={css.list}>
              {selected === undefined && <CatalogFeedback status={status} populated={rows.length > 0} onRetry={onRetry} t={t} />}
              {status === 'ready' && rows.length === 0 && <div className={css.empty} role="status">
                <IconClockOutlineRegular size={24} className={css.emptyGlyph} />
                <h2>{t(emptyTitle)}</h2>
                <Button variant="outline" className={css.emptyAction} onClick={onNewTask}>
                  {t('empty.action')}
                </Button>
              </div>}
              <ul className={css.listRows} aria-label={t('list.label')} aria-busy={status === 'loading'}>
                {groups.map(group => <Fragment key={group.id}>
                  <li className={css.groupHeading}>
                    {group.id === 'ended' && statusFilter === 'all' && search.trim() === ''
                      ? <button type="button" className={css.groupToggle} aria-expanded={showEnded} onClick={() => { setEndedExpanded(value => !value) }}>
                        <span>{group.title} <span className={css.groupCount}>{group.records.length}</span></span>
                        <span className={css.groupToggleLabel}>{t(showEnded ? 'group.collapse' : 'group.expand')} {showEnded ? '⌃' : '⌄'}</span>
                      </button>
                      : <div className={css.groupTitle}>{group.title} <span className={css.groupCount}>{group.records.length}</span></div>}
                  </li>
                  {(group.id === 'ended' && !showEnded ? [] : group.records).map((record) => {
                  // One pair per row: the same absolute stamp and distance reach
                  // both halves, from one formatting call.
                    const nextRun = nextRunParts(record.scheduledAt, t('time.locale'), now, t)
                    return (
                      <li key={record.id} className={css.listRowItem}>
                        <Button
                          className={clsx(css.row, selectedId === record.id && css.selectedRow,
                            record.status === 'inactive' && css.endedRow)}
                          aria-label={taskName(record)}
                          aria-describedby={`${detailId}-metadata-${record.id}`}
                          aria-expanded={selectedId === record.id}
                          aria-controls={selectedId === record.id ? detailId : undefined}
                          onClick={(event) => {
                            rowRef.current = event.currentTarget
                            setResultsOpen(false)
                            setRequestedResult(undefined)
                            setSelectedId(record.id)
                            setTab('result')
                          }}
                        >
                          <IconClockOutlineRegular className={css.rowGlyph} />
                          <span className={css.rowContent}>
                            <span className={css.rowTitle}>{taskName(record)}</span>
                            <span className={css.rowSummary} id={`${detailId}-metadata-${record.id}`}>
                              {record.status !== 'active'
                              && <span className={css.metadata}>{t(record.status === 'paused' ? 'status.paused' : 'status.inactive')}</span>}
                              <span className={css.metadata}>{frequency(record)}</span>
                              {record.status === 'active' && <span className={css.metadata}>
                                {t('list.nextPrefix')}<time dateTime={record.scheduledAt}>
                                  {nextRun.absolute}
                                </time>
                                {' '}<span className={css.nextRunRelative}>{nextRun.relative}</span>
                              </span>}
                            </span>
                          </span>
                        </Button>
                        {props.manualRun !== undefined && <ManualRunButton task={record} controller={props.manualRun} compact t={t} />}
                        <TaskMenu className={css.rowMenu} open={rowMenu === record.id} onClose={() => { setRowMenu(null) }} align="end" portal
                          anchor={<Button className={css.rowMore} aria-label={`${t('detail.more')}：${taskName(record)}`}
                            aria-haspopup="menu" aria-expanded={rowMenu === record.id}
                            onClick={() => { setRowMenu(rowMenu === record.id ? null : record.id) }}>
                            <IconEllipsisOutlineRegular />
                          </Button>}
                          items={[
                            ...(record.status === 'inactive' ? [] : [{ id: 'pause',
                              label: t(record.status === 'paused' ? 'task.resume' : 'task.pause'), disabled: rowPending }]),
                            { id: 'delete', label: t('delete.action'), danger: true, disabled: rowPending },
                          ]}
                          onSelect={(action) => {
                            setRowMenu(null)
                            if (action === 'delete') { setDeleteRow(record); return }
                            setRowError(null)
                            setRowPending(true)
                            void props.onSetPaused(record, record.status !== 'paused').then((result) => { setRowError(result === 'ok' ? null : result) })
                              .catch(() => { setRowError('error') }).finally(() => { setRowPending(false) })
                          }} />
                      </li>
                    )
                  })}
                </Fragment>)}
              </ul>
            </div>
          </div>
        </div>
      </div>
      {deleteRow !== null && <Modal open title={t('delete.title')} description={t('delete.description')}
        closeLabel={t('delete.close')} onClose={() => { if (!rowPending) setDeleteRow(null) }}
        footer={<><Button variant="outline" disabled={rowPending} onClick={() => { setDeleteRow(null) }}>{t('delete.cancel')}</Button>
          <Button disabled={rowPending} onClick={() => {
            setRowPending(true)
            void props.onDelete(deleteRow.id).then(() => { setDeleteRow(null) }).finally(() => { setRowPending(false) })
          }}>{t('delete.confirm')}</Button></>} />}
      {creating && <CreateTaskForm t={t} useWorkspaces={props.useWorkspaces} onCreate={onCreateTask}
        onClose={() => { setCreating(false) }} />}
      {resultsOpen && <aside id="new-results-panel" className={clsx(css.detail, css.resultsPanel)} aria-label={t('newResults.title')}>
        <div className={css.resultsPanelHeader}><h2>{t('newResults.title')} <span>{newResults.entries.length}</span></h2>
          <button type="button" className={css.resultsClose} aria-label={t('newResults.close')} onClick={() => { setResultsOpen(false); resultsTrigger.current?.focus() }}><IconCloseOutlineRegular /></button>
        </div>
        <section className={css.newResults} aria-label={t('newResults.title')}>
          {newResults.entries.length === 0 && !newResults.error && <p>{t('newResults.empty')}</p>}
          {newResults.error && <p role="status">{t('newResults.error')}</p>}
          {newResults.limited && <p role="status">{t('newResults.limited')}</p>}
          {newResults.entries.map(({ task, record, kind }) => <button key={`${task.id}:${record.messageId}`}
            type="button" className={css.newResultRow} onClick={() => {
              rowRef.current = resultsTrigger.current
              setResultsOpen(false)
              setRequestedResult({ taskId: task.id, id: record.messageId, at: record.scheduledAt })
              setSelectedId(task.id); setTab('result')
            }}>
            <span className={css.newResultDot} aria-hidden="true" />
            <span className={css.newResultName}>{taskName(task)}</span>
            <time dateTime={record.deliveredAt}>{new Date(record.deliveredAt).toLocaleString(t('time.locale'))}</time>
            <span>{t(kind === 'completed' ? 'newResults.completed' : kind === 'failed' ? 'newResults.failed' : 'newResults.shared')}</span>
            <span>{t('newResults.view')}</span>
          </button>)}
        </section>
      </aside>}
      {selected !== undefined && <TaskDetail
        {...detail.props}
        requestedResult={requestedResult}
        onViewedResult={newResults.markRead}
        task={selected}
        authoritative={catalogRecord !== undefined}
        onDeleted={closeDetails}
        onClose={closeDetails}
      />}
    </section>
  )
}
