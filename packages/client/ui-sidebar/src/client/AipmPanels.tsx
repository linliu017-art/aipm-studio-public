/** Workspace-backed project panel for Nini Flow. */
import { useEffect, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceId, WorkspaceSnapshot, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  FileTypeIcon,
  IconChevronRightOutlineRegular,
  IconFolderOpenOutlineRegular,
  IconNewChatOutlineRegular,
  IconRefreshOutlineRegular,
  fileSizeText,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SidebarKey } from './locales.ts'
import {
  PROJECT_STAGES,
  type ProjectFileView,
  type ProjectStageDefinition,
  type ProjectView,
} from './project-reader.ts'
import css from './AipmPanels.module.css'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface GlobalStandardProps {
    /** Selector hook over the pure Workspace Controller snapshot. */
    useWorkspaces: SnapshotSelectorHook<WorkspaceSnapshot>
  }
}

export type AipmPanelsInjected = {
  readProject: (workspace: WorkspaceView, sessionId: SessionId | undefined, signal: AbortSignal) => Promise<ProjectView>
  startWorkspaceSession: (workspaceId: WorkspaceId) => void
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

function useProjectViews({ useWorkspaces, useSessions, readProject }: AipmPanelProps): {
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
} & PropsLocale<'sidebar'>) {
  const label = t('projects.open', { name: project.name })
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
          outputs: project.outputs.length,
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
  const outputCount = project.outputs.filter(file => file.stage?.id === stage.id).length
  const status = outputCount > 0 ? 'done' : state?.status ?? 'not_started'
  return (
    <li className={css.stageRow}>
      <span className={css.stageIndex}>{stage.id.slice(0, 2)}</span>
      <span className={css.stageCopy}>
        <strong>{t(`stage.${stage.id}` as SidebarKey)}</strong>
        <span>{state?.note ?? t('projects.stageFiles', { n: outputCount })}</span>
      </span>
      <span className={css.status} data-status={status}>{t(`status.${status}` as SidebarKey)}</span>
    </li>
  )
}

function OutputRow({ file, project, open, t }: {
  readonly file: ProjectFileView
  readonly project: ProjectView
  readonly open: () => void
} & PropsLocale<'sidebar'>) {
  return (
    <button
      type="button"
      className={css.outputRow}
      aria-label={t('projects.openFile', { name: file.name, project: project.name })}
      onClick={open}
    >
      <span className={css.fileIcon} aria-hidden="true"><FileTypeIcon path={file.relativePath} size={20} /></span>
      <span className={css.outputCopy}>
        <strong>{file.name}</strong>
        <span>{file.relativePath}</span>
      </span>
      <span className={css.outputMeta}>
        {file.stage === undefined ? '' : t(`stage.${file.stage.id}` as SidebarKey)}
        {file.size === undefined ? '' : fileSizeText(file.size)}
      </span>
      <IconChevronRightOutlineRegular className={css.chevron} size={15} />
    </button>
  )
}

function ProjectDetail({ project, sessionsCount, back, startWorkspaceSession, openProjectFile, t }: {
  readonly project: ProjectView
  readonly sessionsCount: number
  readonly back: () => void
} & Pick<AipmPanelsInjected, 'startWorkspaceSession' | 'openProjectFile'> & PropsLocale<'sidebar'>) {
  const recentOutputs = project.outputs.slice(0, 5)
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
          <h2>{project.name}</h2>
          <p>{project.summary || t('projects.noSummary')}</p>
          <span className={css.detailPath}>{project.workspace.path}</span>
        </div>
        <button type="button" className={css.primaryAction} onClick={() => { startWorkspaceSession(project.workspace.workspaceId) }}>
          <IconNewChatOutlineRegular size={16} />
          <span>{t('projects.newChat')}</span>
        </button>
      </section>
      <div className={css.stats}>
        <span><strong>{project.outputs.length}</strong>{t('projects.statOutputs')}</span>
        <span><strong>{project.materials.length}</strong>{t('projects.statMaterials')}</span>
        <span><strong>{sessionsCount}</strong>{t('projects.statChats')}</span>
      </div>
      {project.issues.some(issue => issue.code === 'scan-failed') && (
        <div className={css.notice}>{t('projects.readFailed')}</div>
      )}
      <div className={css.detailColumns}>
        <section className={css.detailSection}>
          <div className={css.sectionHeading}><h3>{t('projects.stages')}</h3></div>
          <ol className={css.stageList}>
            {PROJECT_STAGES.map(stage => <StageRow key={stage.id} stage={stage} project={project} t={t} />)}
          </ol>
        </section>
        <section className={css.detailSection}>
          <div className={css.sectionHeading}>
            <h3>{t('projects.recentOutputs')}</h3>
            <span>{t('projects.stageFiles', { n: project.outputs.length })}</span>
          </div>
          {recentOutputs.length === 0
            ? <div className={css.compactEmpty}>{t('projects.noOutputs')}</div>
            : <div className={css.outputList}>{recentOutputs.map(file => (
              <OutputRow key={file.relativePath} file={file} project={project} open={() => { openFile(file) }} t={t} />
            ))}</div>}
        </section>
      </div>
    </div>
  )
}

/** Project browser: cards enter a read-only project overview instead of creating a chat. */
export function ProjectsPanel(props: AipmPanelProps) {
  const { workspaces, sessions, state, refresh } = useProjectViews(props)
  const [selectedId, setSelectedId] = useState<WorkspaceId | null>(null)
  const selected = selectedId === null ? undefined : state.projects.find(project => project.workspace.workspaceId === selectedId)
  if (selected !== undefined) {
    const sessionsCount = selected.workspace.sessionIds.filter(id => sessions.byId[id] !== undefined).length
    return <main className={css.root}>
      <ProjectDetail
        project={selected}
        sessionsCount={sessionsCount}
        back={() => { setSelectedId(null) }}
        startWorkspaceSession={props.startWorkspaceSession}
        openProjectFile={props.openProjectFile}
        t={props.t}
      />
    </main>
  }
  return (
    <main className={css.root}>
      <PanelHeader refresh={refresh} t={props.t} />
      {workspaces.phase !== 'ready' || state.phase === 'loading'
        ? <Loading />
        : state.projects.length === 0
          ? <Empty>{props.t('projects.empty')}</Empty>
          : <div className={css.grid}>{state.projects.map(project => (
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
