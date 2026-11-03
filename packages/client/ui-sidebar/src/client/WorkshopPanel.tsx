/** Read-only Workshop landing page and explicit conversation launcher. */
import { useId, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, Tooltip, IconAgentPresetOutlineRegular, IconFolderOpenOutlineRegular,
  IconNewChatOutlineRegular, IconRefreshOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { useProjectViews, type AipmPanelsInjected } from './AipmPanels.tsx'
import type { WorkshopMode, WorkshopStartRequest, WorkshopOutput } from './workshop-launch.ts'
import shared from './AipmPanels.module.css'
import css from './WorkshopPanel.module.css'

/** Private launch and read callbacks; navigation remains owned by Workspace UI. */
export interface WorkshopPanelInjected extends Pick<AipmPanelsInjected, 'readProject'> {
  startWorkshop: (request: WorkshopStartRequest) => Promise<void>
}

type Props = PropsRuntime<'main'> & InjectFace<WorkshopPanelInjected> & PropsLocale<'sidebar'>
type WorkshopDraft = {
  task: string
  sourcePath: string
  baselinePath: string
  workspaceId: string
  documentIds: readonly string[]
  output: WorkshopOutput
}
function emptyDraft(): WorkshopDraft {
  return { task: '', sourcePath: '', baselinePath: '', workspaceId: '', documentIds: [], output: 'both' }
}

/** Workshop navigation glyph, rendered by the existing permanent rail. */
export function WorkshopPanelIcon({ size }: PropsRuntime<'sidebar.panellist'>) {
  return <IconAgentPresetOutlineRegular size={size} />
}

/**
 * Choose a task, scope and deliverables before directly starting a Workshop chat.
 * @param props - read-only project sources, locale and launch callback.
 * @returns the Workshop landing page; rendering and mode selection perform no writes.
 */
export function WorkshopPanel(props: Props) {
  const { t } = props
  const { state, refresh } = useProjectViews(props)
  const [mode, setMode] = useState<WorkshopMode>('idea')
  const [drafts, setDrafts] = useState<Partial<Record<WorkshopMode, WorkshopDraft>>>({})
  const { task, sourcePath, baselinePath, workspaceId, documentIds, output } = drafts[mode] ?? emptyDraft()
  const updateDraft = (patch: Partial<WorkshopDraft>): void => {
    setDrafts(current => ({ ...current, [mode]: { ...current[mode] ?? emptyDraft(), ...patch } }))
  }
  const delivery = mode === 'impact' || mode === 'handoff'
  const inspection = mode === 'reverse' || mode === 'gaps'
  const [starting, setStarting] = useState(false)
  const fieldId = useId()
  const projects = state.projects.filter(project => project.initialized)
  const choices = mode === 'iterate'
    ? projects.filter(project => project.documents?.some(document => document.revisions.some(revision => revision.source === 'workshop'))
      || project.outputs.some(file => file.relativePath.startsWith('03-PRD/Agent工坊/')))
    : projects
  const selected = choices.find(project => project.workspace.workspaceId === workspaceId)
  const selectable = (selected?.documents ?? []).filter((document) => {
    const file = document.revisions.at(-1)?.file
    return !document.material && file !== undefined
      && (mode === 'impact' ? ['md', 'txt', 'html', 'csv', 'svg', 'mmd']
        : ['md', 'txt', 'html', 'csv', 'svg', 'mmd', 'pdf', 'docx', 'xlsx', 'pptx', 'png', 'jpg', 'jpeg', 'webp']).includes(file.extension)
  })
  const chosen = selectable.filter(document => documentIds.includes(document.id))
  const groups = [
    { id: 'create', modes: [
      { id: 'idea', icon: IconNewChatOutlineRegular },
      { id: 'materials', icon: IconFolderOpenOutlineRegular },
      { id: 'reverse', icon: IconFolderOpenOutlineRegular },
    ] },
    { id: 'improve', modes: [
      { id: 'gaps', icon: IconRefreshOutlineRegular },
      { id: 'impact', icon: IconRefreshOutlineRegular },
      { id: 'iterate', icon: IconRefreshOutlineRegular },
    ] },
    { id: 'deliver', modes: [{ id: 'handoff', icon: IconFolderOpenOutlineRegular }] },
  ] as const
  const valid = delivery ? selected !== undefined && chosen.length > 0 && (mode === 'handoff' || task.trim() !== '') : inspection ? sourcePath.trim() !== '' : (mode === 'idea' ? task.trim() !== ''
    : mode === 'iterate' ? selected !== undefined && task.trim() !== ''
      : task.trim() !== '' || selected !== undefined)

  const chooseMode = (next: WorkshopMode): void => {
    setMode(next)
  }
  const submit = (): void => {
    if (!valid || starting) return
    setStarting(true)
    void props.startWorkshop({ mode, task: task.trim(), output: inspection ? 'prd' : output,
      ...delivery ? { delivery: { documents: chosen.flatMap((document) => {
        const revision = document.revisions.at(-1)
        return revision === undefined ? [] : [{ id: document.id, version: revision.version }]
      }),
      ...mode === 'impact' && sourcePath.trim() ? { sourcePath: sourcePath.trim() } : {} } } : {},
      ...inspection ? { inspection: { sourcePath: sourcePath.trim(), ...mode === 'gaps' && baselinePath.trim()
        ? { baselinePath: baselinePath.trim() } : {} } } : {},
      ...selected === undefined ? {} : { workspaceId: selected.workspace.workspaceId } })
      .catch(() => { /* Workspace navigation reports the failure through its global notice. */ })
      .finally(() => { setStarting(false) })
  }
  const projectField = (
    <div className={css.field}>
      <label htmlFor={fieldId + '-project'}>{t(inspection ? 'workshop.inspection.destination' : 'workshop.project.label')}</label>
      <select id={fieldId + '-project'} value={workspaceId} disabled={starting || state.phase !== 'ready'}
        onChange={(event) => {
          const id = event.currentTarget.value
          updateDraft({ workspaceId: id, documentIds: choices.find(project => project.workspace.workspaceId === id)?.documents
            ?.filter(document => document.kind === 'prd' || document.kind === 'plan').map(document => document.id) ?? [] })
        }}>
        <option value="">{t(delivery ? 'workshop.delivery.chooseProject' : mode === 'iterate' ? 'workshop.project.choose' : inspection ? 'workshop.inspection.newDestination' : 'workshop.project.upload')}</option>
        {choices.map(project => <option key={project.workspace.workspaceId} value={project.workspace.workspaceId}>
          {project.name}
        </option>)}
      </select>
      <p>{t(delivery ? 'workshop.delivery.projectHint' : inspection ? 'workshop.inspection.destinationHint' : mode === 'iterate' ? 'workshop.project.iterateHint' : 'workshop.project.materialsHint')}</p>
      {mode === 'iterate' && state.phase === 'ready' && choices.length === 0
        && <p role="status">{t('workshop.project.noVersions')}</p>}
    </div>
  )
  const sourceField = (
    <div className={css.field}>
      <label htmlFor={fieldId + '-source'}>{t(mode === 'impact' ? 'workshop.delivery.source' : 'workshop.inspection.source')}</label>
      <input id={fieldId + '-source'} value={sourcePath} disabled={starting}
        placeholder={t('workshop.inspection.sourcePlaceholder')} onChange={(event) => { updateDraft({ sourcePath: event.currentTarget.value }) }} />
      <p>{t('workshop.inspection.sourceHint')}</p>
    </div>
  )
  const taskField = (
    <div className={css.field}>
      <label htmlFor={fieldId + '-task'}>{t(`workshop.task.${mode}.label`)}</label>
      <textarea id={fieldId + '-task'} value={task} rows={5} disabled={starting}
        placeholder={t(`workshop.task.${mode}.placeholder`)}
        onChange={(event) => { updateDraft({ task: event.currentTarget.value }) }} />
    </div>
  )
  const result = mode === 'reverse' ? 'workshop.result.reverse' : mode === 'gaps' ? 'workshop.result.gaps'
    : mode === 'impact' ? 'workshop.result.impact' : mode === 'handoff' ? 'workshop.result.handoff' : undefined
  const hasExtras = inspection || delivery
  const configured = inspection ? workspaceId !== '' || task.trim() !== '' || (mode === 'gaps' && baselinePath.trim() !== '')
    : mode === 'impact' ? sourcePath.trim() !== '' : mode === 'handoff' && task.trim() !== ''
  return <main className={`${shared.root} ${css.root}`}>
    <header className={`${shared.header} ${css.header}`}>
      <div>
        <h1>{t('workshop.title')}</h1>
        <p>{t('workshop.description')}</p>
      </div>
      <Tooltip label={t('workshop.refresh')} portal>
        <Button variant="outline" aria-label={t('workshop.refresh')} onClick={refresh} icon={<IconRefreshOutlineRegular size={16} />} />
      </Tooltip>
    </header>
    <div className={css.content}>
      <div className={css.mobileNavigation}>
        <label htmlFor={fieldId + '-mode'}>{t('workshop.mode.label')}</label>
        <select id={fieldId + '-mode'} value={mode} disabled={starting} aria-controls={fieldId + '-form'}
          onChange={(event) => {
            const next = groups.flatMap<WorkshopMode>(group => group.modes.map(item => item.id))
              .find(id => id === event.currentTarget.value)
            if (next !== undefined && next !== mode) chooseMode(next)
          }}>
          {groups.map(group => <optgroup key={group.id} label={t(`workshop.group.${group.id}`)}>
            {group.modes.map(item => <option key={item.id} value={item.id}>{t(`workshop.mode.${item.id}.title`)}</option>)}
          </optgroup>)}
        </select>
      </div>
      <nav className={css.navigation} aria-label={t('workshop.mode.label')}>
        {groups.map(group => <section className={css.group} key={group.id} aria-labelledby={fieldId + '-' + group.id}>
          <h2 id={fieldId + '-' + group.id}>{t(`workshop.group.${group.id}`)}</h2>
          {group.modes.map(({ id, icon: Icon }) => <button key={id} type="button"
            className={css.mode} disabled={starting} aria-pressed={mode === id}
            aria-controls={fieldId + '-form'} onClick={() => { if (mode !== id) chooseMode(id) }}>
            <Icon size={18} />
            <span>{t(`workshop.mode.${id}.title`)}</span>
          </button>)}
        </section>)}
      </nav>
      <form id={fieldId + '-form'} className={css.form} aria-labelledby={fieldId + '-title'}
        onSubmit={(event) => { event.preventDefault(); submit() }}>
        <header className={css.formHeader}>
          <h2 id={fieldId + '-title'}>{t(`workshop.mode.${mode}.title`)}</h2>
          <p>{t(`workshop.mode.${mode}.description`)}</p>
          {result !== undefined && <span className={css.outcome}>{t('workshop.output.label')} · {t(result)}</span>}
        </header>
        {mode !== 'idea' && !inspection && projectField}
        {delivery && selected !== undefined && <fieldset className={css.documentChoices}>
          <legend>{t('workshop.delivery.documents')}</legend>
          {selectable.length === 0 ? <p role="status">{t('workshop.delivery.noDocuments')}</p>
            : selectable.map(document => <label key={document.id}>
              <input type="checkbox" checked={documentIds.includes(document.id)} disabled={starting}
                onChange={(event) => { updateDraft({ documentIds: event.currentTarget.checked
                  ? [...documentIds, document.id] : documentIds.filter(id => id !== document.id) }) }} />
              <span>{document.title} · V{document.revisions.at(-1)?.version}</span>
            </label>)}
          <p>{t('workshop.delivery.documentsHint')}</p>
        </fieldset>}
        {inspection && sourceField}
        {!inspection && mode !== 'handoff' && taskField}
        {!inspection && !delivery && <div className={css.field}>
          <label htmlFor={fieldId + '-output'}>{t('workshop.output.label')}</label>
          <select id={fieldId + '-output'} value={output} disabled={starting}
            onChange={(event) => {
              const next = event.currentTarget.value
              if (next === 'prd' || next === 'plan' || next === 'both') updateDraft({ output: next })
            }}>
            <option value="both">{t('workshop.output.both')}</option>
            <option value="prd">{t('workshop.output.prd')}</option>
            <option value="plan">{t('workshop.output.plan')}</option>
          </select>
        </div>}
        {hasExtras && <details className={css.extras} key={mode}>
          <summary>{t('workshop.extra.label')}{configured && <span>{t('workshop.extra.configured')}</span>}</summary>
          <div className={css.extraFields}>
            {inspection && projectField}
            {mode === 'gaps' && <div className={css.field}>
              <label htmlFor={fieldId + '-baseline'}>{t('workshop.inspection.baseline')}</label>
              <input id={fieldId + '-baseline'} value={baselinePath} disabled={starting}
                placeholder={t('workshop.inspection.baselinePlaceholder')} onChange={(event) => { updateDraft({ baselinePath: event.currentTarget.value }) }} />
              <p>{t('workshop.inspection.baselineHint')}</p>
            </div>}
            {mode === 'impact' && sourceField}
            {(inspection || mode === 'handoff') && taskField}
          </div>
        </details>}
        <div className={css.footer}>
          <p>{t(delivery ? 'workshop.delivery.launchHint' : inspection ? 'workshop.inspection.launchHint' : 'workshop.launchHint')}</p>
          <Button type="submit" variant="primary" disabled={!valid || starting} icon={<IconNewChatOutlineRegular size={16} />}>
            {t(starting ? 'workshop.starting' : 'workshop.start')}
          </Button>
        </div>
      </form>
    </div>
  </main>
}
