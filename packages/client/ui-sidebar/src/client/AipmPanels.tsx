/** Workspace-backed project panel for Nini Flow. */
import { useEffect, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceId, WorkspaceSnapshot, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  Button, Input, IconEditOutlineRegular,
  FileTypeIcon,
  IconCheckOutlineRegular,
  IconChevronRightOutlineRegular,
  IconFolderOpenOutlineRegular,
  IconNewChatOutlineRegular,
  IconRefreshOutlineRegular,
  LinkIconRegular,
  Tooltip,
  classifyFileType,
  fileSizeText,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SidebarKey } from './locales.ts'
import {
  PROJECT_STAGES,
  type ProjectFileView,
  type ProjectStageDefinition,
  type ProjectView,
} from './project-reader.ts'
import { isManagedDocumentPath, projectDocuments, type ProjectDocumentView } from './project-documents.ts'
import css from './AipmPanels.module.css'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface GlobalStandardProps {
    /** Selector hook over the pure Workspace Controller snapshot. */
    useWorkspaces: SnapshotSelectorHook<WorkspaceSnapshot>
  }
}

export type AipmPanelsInjected = {
  readProject: (workspace: WorkspaceView, sessionId: SessionId | undefined, signal: AbortSignal) => Promise<ProjectView>
  renameProject: (workspaceId: WorkspaceId, name: string) => Promise<void>
  startWorkspaceSession: (workspaceId: WorkspaceId) => void
  downloadHandoff: (sessionId: SessionId, path: string) => Promise<void>
  reviewProjectPlan: (workspaceId: WorkspaceId, documentId: string, title: string, version: number) => Promise<void>
  openProjectSession: (sessionId: SessionId) => void
  openProjectFile: (sessionId: SessionId, workspaceRoot: string, relativePath: string) => void
}

type AipmPanelProps = PropsRuntime<'main'> & InjectFace<AipmPanelsInjected> & PropsLocale<'sidebar'>

interface ProjectLoadState {
  readonly phase: 'loading' | 'ready'
  readonly projects: readonly ProjectView[]
}

/** Folder glyph used by the Projects rail entry. */
export function ProjectsPanelIcon({ size }: PropsRuntime<'sidebar.panellist'>) {
  return <IconFolderOpenOutlineRegular size={size} />
}

function projectName(workspace: WorkspaceView): string {
  const pathName = workspace.path.split(/[\\/]/).filter(Boolean).at(-1)
  return workspace.title.trim() || pathName || workspace.workspaceId
}

function readerSession(
  workspace: WorkspaceView,
  sessions: SessionListState,
  archived: readonly SessionId[],
): SessionId | undefined {
  return workspace.sessionIds.find(id => sessions.byId[id] !== undefined && !archived.includes(id))
    ?? workspace.sessionIds.find(id => sessions.byId[id] !== undefined)
}

function fallbackProject(
  workspace: WorkspaceView,
  sessionId: SessionId | undefined,
  error: unknown,
): ProjectView {
  return {
    workspace,
    ...(sessionId === undefined ? {} : { readerSessionId: sessionId }),
    name: projectName(workspace),
    summary: '',
    initialized: false,
    materials: [],
    outputs: [],
    issues: [{ code: 'scan-failed', message: error instanceof Error ? error.message : String(error) }],
  }
}

/**
 * Read project cards for either the project browser or Workshop project chooser.
 * @param props - read-only Workspace and Session sources plus the bounded project reader.
 * @returns projects, source readiness and a read-only refresh action.
 */
export function useProjectViews({ useWorkspaces, useSessions, readProject }: Pick<AipmPanelProps, 'useWorkspaces' | 'useSessions' | 'readProject'>): {
  readonly workspaces: WorkspaceSnapshot
  readonly sessions: SessionListState
  readonly state: ProjectLoadState
  readonly refresh: () => void
} {
  const workspaces = useWorkspaces(snapshot => snapshot)
  const sessions = useSessions(snapshot => snapshot)
  const [generation, setGeneration] = useState(0)
  const [state, setState] = useState<ProjectLoadState>({ phase: 'loading', projects: [] })
  useEffect(() => {
    if (workspaces.phase !== 'ready' || sessions.phase !== 'ready') {
      setState({ phase: 'loading', projects: [] })
      return
    }
    const lifetime = new AbortController()
    setState(previous => ({ phase: 'loading', projects: previous.projects }))
    void Promise.all(workspaces.items.map(async (workspace) => {
      const sessionId = readerSession(workspace, sessions, workspaces.archivedSessionIds)
      try {
        return await readProject(workspace, sessionId, lifetime.signal)
      } catch (error) {
        if (lifetime.signal.aborted) throw error
        return fallbackProject(workspace, sessionId, error)
      }
    })).then((projects) => {
      if (!lifetime.signal.aborted) setState({ phase: 'ready', projects })
    }).catch((error: unknown) => {
      if (!lifetime.signal.aborted) console.warn('Nini Flow project read failed:', error)
    })
    return () => { lifetime.abort() }
  }, [generation, readProject, sessions, workspaces])
  return { workspaces, sessions, state, refresh: () => { setGeneration(value => value + 1) } }
}

function Empty({ children }: { readonly children: string }) {
  return <div className={css.empty}>{children}</div>
}

function Loading() {
  return <div className={css.loading} aria-busy="true"><span /></div>
}

function ProjectCard({ project, sessionsCount, open, t }: {
  readonly project: ProjectView
  readonly sessionsCount: number
  readonly open: () => void
  readonly title?: string
  readonly metadata?: string | undefined
  readonly accessibilityName?: string
} & PropsLocale<'sidebar'>) {
  const label = t('projects.open', { name: project.name })
  const documents = project.documents ?? projectDocuments([...project.materials, ...project.outputs])
  return (
    <button type="button" className={css.card} aria-label={label} onClick={open}>
      <span className={css.cardIcon} aria-hidden="true"><IconFolderOpenOutlineRegular size={20} /></span>
      <span className={css.cardCopy}>
        <span className={css.cardTitleLine}>
          <strong>{project.name}</strong>
          {!project.initialized && <span className={css.softBadge}>{t('projects.workspaceOnly')}</span>}
        </span>
        <span className={css.path}>{project.workspace.path}</span>
        <span className={css.meta}>{t('projects.cardMeta', {
          sessions: sessionsCount,
          outputs: documents.filter(document => !document.material).length,
        })}</span>
      </span>
      <IconChevronRightOutlineRegular className={css.chevron} size={16} />
    </button>
  )
}

function PanelHeader({ refresh, t }: {
  readonly refresh: () => void
} & PropsLocale<'sidebar'>) {
  return (
    <header className={css.header}>
      <div>
        <span className={css.kicker}>{t('projects.kicker')}</span>
        <h1>{t('projects.title')}</h1>
        <p>{t('projects.description')}</p>
      </div>
      <button type="button" className={css.iconButton} aria-label={t('common.refresh')} onClick={refresh}>
        <IconRefreshOutlineRegular size={16} />
      </button>
    </header>
  )
}

function StageRow({ stage, project, t }: {
  readonly stage: ProjectStageDefinition
  readonly project: ProjectView
} & PropsLocale<'sidebar'>) {
  const state = project.state?.stages[stage.id]
  const status = state?.status ?? 'not_started'
  const statusLabel = t(`status.${status}`)
  return (
    <li className={css.stageRow}>
      <Tooltip label={statusLabel} side="right" portal openOnClick>
        <button type="button" className={css.stageIndex} data-status={status}
          aria-label={t('projects.stageStatus', { stage: t(`stage.${stage.id}` as SidebarKey), status: statusLabel })}>
          {status === 'done' && <IconCheckOutlineRegular size={15} />}
          {status === 'in_progress' && <span className={css.stageDot} aria-hidden="true" />}
        </button>
      </Tooltip>
      <span className={css.stageCopy}>
        <strong>{t(`stage.${stage.id}` as SidebarKey)}</strong>
        <span>{statusLabel}</span>
      </span>
    </li>
  )
}

function OutputRow({ file, project, open, title, metadata, accessibilityName, t }: {
  readonly file: ProjectFileView
  readonly project: ProjectView
  readonly open: () => void
  readonly title?: string
  readonly metadata?: string | undefined
  readonly accessibilityName?: string
} & PropsLocale<'sidebar'>) {
  const markdown = classifyFileType(file.relativePath) === 'markdown'
  return (
    <Tooltip label={file.relativePath} portal>
      <button
        type="button"
        className={css.outputRow}
        aria-label={accessibilityName ?? t('projects.openFile', { name: file.name, project: project.name })}
        onClick={open}
      >
        <span className={markdown ? css.markdownIcon : css.fileIcon} aria-hidden="true">
          {markdown ? <LinkIconRegular kind="document" size={22} /> : <FileTypeIcon path={file.relativePath} size={20} />}
        </span>
        <span className={css.outputCopy}>
          <strong>{title ?? file.name}</strong>
        </span>
        <span className={css.outputMeta}>
          {metadata ?? (file.size === undefined ? '' : fileSizeText(file.size))}
        </span>
      </button>
    </Tooltip>
  )
}

function ProjectDetail({
  project, sessionsCount, back, renameProject, refresh, startWorkspaceSession, openProjectFile, openProjectSession,
  reviewProjectPlan, downloadHandoff, t,
}: {
  readonly project: ProjectView
  readonly sessionsCount: number
  readonly back: () => void
  readonly refresh: () => void
} & Pick<AipmPanelsInjected, 'renameProject' | 'startWorkspaceSession' | 'openProjectFile' | 'openProjectSession' | 'reviewProjectPlan' | 'downloadHandoff'> & PropsLocale<'sidebar'>) {
  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState(project.name)
  const [savingName, setSavingName] = useState(false)
  const [nameError, setNameError] = useState('')
  const cancelName = (): void => { if (!savingName) { setEditingName(false); setNameError('') } }
  const saveName = (): void => {
    const next = name.trim()
    if (next === '' || savingName) return
    if (next === project.name) { cancelName(); return }
    setSavingName(true)
    setNameError('')
    void renameProject(project.workspace.workspaceId, next)
      .then(() => { setEditingName(false); refresh() })
      .catch((error: unknown) => { setNameError(error instanceof Error ? error.message : t('projects.name.failed')) })
      .finally(() => { setSavingName(false) })
  }
  const documents = project.documents ?? projectDocuments([...project.materials, ...project.outputs])
  const activeStages = PROJECT_STAGES.filter((stage) => {
    const status = project.state?.stages[stage.id]?.status
    return status === 'in_progress' || status === 'done'
  })
  const openFile = (file: ProjectFileView): void => {
    const sessionId = file.sessionId ?? project.readerSessionId
    if (sessionId === undefined) return
    openProjectFile(sessionId, project.workspace.path, file.relativePath)
  }
  return (
    <div className={css.detailRoot}>
      <button type="button" className={css.back} onClick={back}>
        <IconChevronRightOutlineRegular size={14} />
        <span>{t('projects.back')}</span>
      </button>
      <section className={css.projectHero}>
        <div className={css.projectHeroCopy}>
          <span className={css.kicker}>{project.initialized ? t('projects.aipmProject') : t('projects.workspaceOnly')}</span>
          {editingName ? <form className={css.nameEditor} onSubmit={(event) => { event.preventDefault(); saveName() }}>
            <Input aria-label={t('projects.name.label')} value={name} autoFocus disabled={savingName}
              onChange={(event) => { setName(event.currentTarget.value); setNameError('') }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.nativeEvent.isComposing || Reflect.get(event.nativeEvent, 'keyCode') === 229)) event.preventDefault()
                if (event.key === 'Escape') { event.preventDefault(); cancelName() }
              }} />
            <Button type="submit" variant="primary" disabled={savingName || name.trim() === ''}>
              {t(savingName ? 'projects.name.saving' : 'projects.name.save')}
            </Button>
            <Button variant="outline" disabled={savingName} onClick={cancelName}>{t('projects.name.cancel')}</Button>
            {nameError !== '' && <p role="alert" className={css.nameError}>{nameError}</p>}
          </form> : <div className={css.nameRow}>
            <h2>{project.name}</h2>
            {project.state !== undefined && <Tooltip label={t('projects.name.edit')} portal>
              <Button variant="ghost" aria-label={t('projects.name.edit')} icon={<IconEditOutlineRegular size={16} />}
                onClick={() => { setName(project.name); setNameError(''); setEditingName(true) }} />
            </Tooltip>}
          </div>}
          <p>{project.summary || t('projects.noSummary')}</p>
          <span className={css.detailPath}>{project.workspace.path}</span>
        </div>
        <button type="button" className={css.primaryAction} onClick={() => { startWorkspaceSession(project.workspace.workspaceId) }}>
          <IconNewChatOutlineRegular size={16} />
          <span>{t('projects.newChat')}</span>
        </button>
      </section>
      <div className={css.stats}>
        <span><strong>{documents.filter(document => !document.material).length}</strong>{t('projects.statOutputs')}</span>
        <span><strong>{documents.filter(document => document.material).length}</strong>{t('projects.statMaterials')}</span>
        <span><strong>{sessionsCount}</strong>{t('projects.statChats')}</span>
      </div>
      {project.issues.some(issue => issue.code === 'scan-failed') && (
        <div className={css.notice}>{t('projects.readFailed')}</div>
      )}
      {project.issues.some(issue => issue.code === 'documents-invalid') && (
        <div className={css.notice}>{t('documents.readFailed')}</div>
      )}
      {activeStages.length > 0 && (
        <section className={css.progress} aria-label={t('projects.stages')}>
          <div className={css.sectionHeading}>
            <h3>{t('projects.stages')}</h3>
            <span>{t('projects.activeStages', { n: activeStages.length })}</span>
          </div>
          <ol className={css.stageList}>
            {activeStages.map(stage => <StageRow key={stage.id} stage={stage} project={project} t={t} />)}
          </ol>
        </section>
      )}
      <section className={css.documents} aria-label={t('projects.documents')}>
        <div className={css.sectionHeading}>
          <h3>{t('projects.documents')}</h3>
          <span>{t('documents.count', { n: documents.length })}</span>
        </div>
        {documents.length === 0
          ? <div className={css.compactEmpty}>{t('projects.noFiles')}</div>
          : <ProjectDocuments documents={documents} project={project} openFile={openFile} openSession={openProjectSession}
            reviewPlan={reviewProjectPlan} downloadHandoff={downloadHandoff} t={t} />}
      </section>
    </div>
  )
}

function DocumentEntry({ document, project, openFile, openSession, reviewPlan, downloadHandoff, t }: {
  readonly document: ProjectDocumentView
  readonly project: ProjectView
  readonly openFile: (file: ProjectFileView) => void
  readonly openSession: (sessionId: SessionId) => void
  readonly downloadHandoff: AipmPanelsInjected['downloadHandoff']
  readonly reviewPlan: AipmPanelsInjected['reviewProjectPlan']
} & PropsLocale<'sidebar'>) {
  const [historyOpen, setHistoryOpen] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState(false)
  const [reviewStarting, setReviewStarting] = useState(false)
  const current = document.revisions.at(-1)
  if (current === undefined) return null
  const title = document.title === 'PRD' ? t('documents.prdTitle')
    : document.title === '方案' ? t('documents.planTitle') : document.title
  return <div className={css.documentEntry}>
    <OutputRow file={current.file} project={project} title={title}
      metadata={t('documents.current', { n: current.version })} open={() => { openFile(current.file) }} t={t} />
    {!document.material && current.file.name === '开发交接包.zip' && isManagedDocumentPath(current.file.relativePath) && <div>
      <Button variant="outline" disabled={downloading || project.readerSessionId === undefined}
        onClick={() => {
          if (downloading || project.readerSessionId === undefined) return
          setDownloading(true); setDownloadError(false)
          void downloadHandoff(project.readerSessionId, current.file.relativePath)
            .catch(() => { setDownloadError(true) }).finally(() => { setDownloading(false) })
        }}>{t(downloading ? 'documents.downloading' : downloadError ? 'documents.downloadRetry' : 'documents.download')}</Button>
      {downloadError && <p role="alert" className={css.notice}>{t('documents.downloadFailed')}</p>}
    </div>}
    {document.kind === 'plan'  && !document.material && <Button variant="outline" disabled={reviewStarting}
      onClick={() => {
        if (reviewStarting) return
        setReviewStarting(true)
        void reviewPlan(project.workspace.workspaceId, document.id, title, current.version)
          .catch(() => { /* Workspace navigation owns the global failure notice. */ })
          .finally(() => { setReviewStarting(false) })
      }}>{t(reviewStarting ? 'documents.reviewStarting' : 'documents.review')}</Button>}
    <details className={css.documentHistory} open={historyOpen}>
      <summary aria-label={t('documents.historyFor', { name: title })} aria-expanded={historyOpen}
        onClick={(event) => { event.preventDefault(); setHistoryOpen(value => !value) }}>
        <IconChevronRightOutlineRegular size={12} />
        {t('documents.history', { n: document.revisions.length })}
      </summary>
      {historyOpen && <ol>
        {[...document.revisions].reverse().map(revision => <li key={revision.version}>
          <OutputRow file={revision.file} project={project} title={'V' + String(revision.version)}
            metadata={revision === current ? t('documents.latest') : undefined}
            accessibilityName={t('documents.openRevision', { name: title, n: revision.version })}
            open={() => { openFile(revision.file) }} t={t} />
          <div className={css.revisionCopy}>
            <span>{t(`documents.source.${revision.source}`)}</span>
            {revision.change !== '' && <span>{revision.change}</span>}
            {revision.file.sessionId !== undefined && <button type="button" className={css.revisionSession}
              onClick={() => { if (revision.file.sessionId !== undefined) openSession(revision.file.sessionId) }}>
              {t('documents.conversation')}
            </button>}
          </div>
        </li>)}
      </ol>}
    </details>
  </div>
}

function ProjectDocuments({ documents, project, openFile, openSession, reviewPlan, downloadHandoff, t }: {
  readonly documents: readonly ProjectDocumentView[]
  readonly project: ProjectView
  readonly openFile: (file: ProjectFileView) => void
  readonly openSession: (sessionId: SessionId) => void
  readonly downloadHandoff: AipmPanelsInjected['downloadHandoff']
  readonly reviewPlan: AipmPanelsInjected['reviewProjectPlan']
} & PropsLocale<'sidebar'>) {
  const kinds = ['prd', 'plan', 'prototype', 'research', 'review', 'other', 'materials'] as const
  return <div className={css.documentGroups}>
    {kinds.map((kind) => {
      const group = documents.filter(document => (document.material ? 'materials' : document.kind) === kind)
      if (group.length === 0) return null
      return <section key={kind} aria-label={t(`documents.kind.${kind}`)}>
        <h4>{t(`documents.kind.${kind}`)}</h4>
        {group.map(document => <DocumentEntry key={document.id} document={document} project={project}
          openFile={openFile} openSession={openSession} reviewPlan={reviewPlan} downloadHandoff={downloadHandoff} t={t} />)}
      </section>
    })}
  </div>
}

/** Project browser: cards enter a read-only project overview instead of creating a chat. */
export function ProjectsPanel(props: AipmPanelProps) {
  const { workspaces, sessions, state, refresh } = useProjectViews(props)
  const [selectedId, setSelectedId] = useState<WorkspaceId | null>(null)
  const projects = state.projects.filter(project => project.initialized)
  const selected = selectedId === null ? undefined : projects.find(project => project.workspace.workspaceId === selectedId)
  if (selected !== undefined) {
    const sessionsCount = selected.workspace.sessionIds.filter(id => sessions.byId[id] !== undefined).length
    return <main className={css.root}>
      <ProjectDetail
        key={selected.workspace.workspaceId}
        project={selected}
        renameProject={props.renameProject}
        refresh={refresh}
        sessionsCount={sessionsCount}
        back={() => { setSelectedId(null) }}
        startWorkspaceSession={props.startWorkspaceSession}
        openProjectFile={props.openProjectFile}
        openProjectSession={props.openProjectSession}
        reviewProjectPlan={props.reviewProjectPlan}
        downloadHandoff={props.downloadHandoff}
        t={props.t}
      />
    </main>
  }
  return (
    <main className={css.root}>
      <PanelHeader refresh={refresh} t={props.t} />
      {workspaces.phase !== 'ready' || state.phase === 'loading'
        ? <Loading />
        : projects.length === 0
          ? <Empty>{props.t('projects.empty')}</Empty>
          : <div className={css.grid}>{projects.map(project => (
            <ProjectCard
              key={project.workspace.workspaceId}
              project={project}
              sessionsCount={project.workspace.sessionIds.filter(id => sessions.byId[id] !== undefined).length}
              open={() => { setSelectedId(project.workspace.workspaceId) }}
              t={props.t}
            />
          ))}</div>}
    </main>
  )
}
