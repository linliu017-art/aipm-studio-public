/** Browser-side unified reader for one Nini Flow project workspace. */

import type { RemoteFailure, RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {
  WorkspaceDirectoryListing,
  WorkspaceFileRange,
  WorkspaceFileText,
} from '@deepseek-ai/dsh-api-workspace-files/types'
import { SessionId } from '@deepseek-ai/dsh-session/types'

/** One fixed AIPM stage and its project-directory name. */
export interface ProjectStageDefinition {
  readonly id: string
  readonly title: string
}

/** Ordered project stages. Their ids are also the output-directory names. */
export const PROJECT_STAGES: readonly ProjectStageDefinition[] = [
  { id: '01-立项', title: '立项' },
  { id: '02-需求分析', title: '需求分析' },
  { id: '03-PRD', title: 'PRD' },
  { id: '04-原型', title: '原型' },
  { id: '05-需求评审', title: '需求评审' },
  { id: '06-开发跟进', title: '开发跟进' },
  { id: '07-测试验收', title: '测试验收' },
  { id: '08-上线', title: '上线' },
  { id: '09-复盘', title: '复盘' },
] as const

const STAGE_BY_ID = new Map(PROJECT_STAGES.map(stage => [stage.id, stage]))
const INTERNAL_DIRECTORIES = new Set(['.aipm', '.git', 'node_modules'])
const INTERNAL_ROOT_FILES = new Set(['.DS_Store', 'AGENTS.md'])
const MAX_SCAN_DEPTH = 4
const MAX_PROJECT_FILES = 600

/** Progress persisted for one stage in `.aipm/project.json`. */
export interface ProjectStageState {
  readonly status: 'not_started' | 'in_progress' | 'done'
  readonly note?: string
  readonly sessionId?: SessionId
  readonly updatedAt?: string
}

/** Validated subset of the Nini Flow project state document needed by the UI. */
export interface ProjectStateView {
  readonly name: string
  readonly summary: string
  readonly createdAt: string
  readonly lastStage?: string
  readonly stages: Readonly<Record<string, ProjectStageState>>
}

/** One file discovered under a project directory. */
export interface ProjectFileView {
  readonly name: string
  readonly relativePath: string
  readonly extension: string
  readonly size?: number
  readonly kind: 'material' | 'output'
  readonly stage?: ProjectStageDefinition
  /** Session recorded for the stage that produced this output. */
  readonly sessionId?: SessionId
}

/** Recoverable project read failure shown without hiding the project itself. */
export interface ProjectReadIssue {
  readonly code: 'session-required' | 'state-invalid' | 'scan-failed' | 'scan-limit-reached'
  readonly message: string
}

/** One project assembled from its Workspace row, state document, and files. */
export interface ProjectView {
  readonly workspace: WorkspaceView
  readonly readerSessionId?: SessionId
  readonly name: string
  readonly summary: string
  readonly initialized: boolean
  readonly state?: ProjectStateView
  readonly materials: readonly ProjectFileView[]
  readonly outputs: readonly ProjectFileView[]
  readonly issues: readonly ProjectReadIssue[]
}

/** Remote methods required by the project reader. */
export interface ProjectFilesRemote {
  readonly list: (
    sessionId: SessionId,
    path: string,
    signal: AbortSignal,
  ) => Promise<RemoteResult<WorkspaceDirectoryListing>>
  readonly read: (
    sessionId: SessionId,
    path: string,
    range: WorkspaceFileRange,
    signal: AbortSignal,
  ) => Promise<RemoteResult<WorkspaceFileText>>
}

/** Remote carrier slice used by the sidebar plugin's inject factory. */
export interface ProjectRemoteCarrier {
  readonly workspaceFiles: ProjectFilesRemote
}

function joinPath(parent: string, child: string): string {
  return parent === '' ? child : `${parent}/${child}`
}

function extensionOf(name: string): string {
  const index = name.lastIndexOf('.')
  return index <= 0 || index === name.length - 1 ? '' : name.slice(index + 1).toLowerCase()
}

function stageOf(path: string): ProjectStageDefinition | undefined {
  return STAGE_BY_ID.get(path.split('/', 1)[0] ?? '')
}

function issueMessage(error: RemoteFailure): string {
  return `${error.code}: ${error.message}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stageStateOf(value: unknown): ProjectStageState {
  if (!isRecord(value)
    || (value.status !== 'not_started' && value.status !== 'in_progress' && value.status !== 'done')) {
    return { status: 'not_started' }
  }
  return {
    status: value.status,
    ...(typeof value.note === 'string' ? { note: value.note } : {}),
    ...(typeof value.sessionId === 'string' ? { sessionId: SessionId(value.sessionId) } : {}),
    ...(typeof value.updatedAt === 'string' ? { updatedAt: value.updatedAt } : {}),
  }
}

/**
 * Validate the persisted project metadata used by the UI.
 * @param text - raw `.aipm/project.json` text.
 * @returns normalized project state.
 */
export function parseProjectStateView(text: string): ProjectStateView {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('project.json 不是有效的 JSON')
  }
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.name !== 'string') {
    throw new Error('project.json 不是有效的 Nini Flow 项目文件')
  }
  const sourceStages = isRecord(value.stages) ? value.stages : {}
  const stages: Record<string, ProjectStageState> = {}
  for (const stage of PROJECT_STAGES) stages[stage.id] = stageStateOf(sourceStages[stage.id])
  return {
    name: value.name,
    summary: typeof value.summary === 'string' ? value.summary : '',
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : '',
    ...(typeof value.lastStage === 'string' && STAGE_BY_ID.has(value.lastStage)
      ? { lastStage: value.lastStage }
      : {}),
    stages,
  }
}

async function readState(
  remote: ProjectFilesRemote,
  sessionId: SessionId,
  signal: AbortSignal,
): Promise<{ readonly state?: ProjectStateView; readonly issue?: ProjectReadIssue }> {
  const result = await remote.read(sessionId, '.aipm/project.json', { offset: 1, limit: 5000 }, signal)
  if (!result.ok) {
    if (result.error.code === 'workspace-file/not-found') return {}
    return { issue: { code: 'state-invalid', message: issueMessage(result.error) } }
  }
  try {
    return { state: parseProjectStateView(result.value.text) }
  } catch (error) {
    return {
      issue: {
        code: 'state-invalid',
        message: error instanceof Error ? error.message : String(error),
      },
    }
  }
}

async function scanFiles(
  remote: ProjectFilesRemote,
  sessionId: SessionId,
  signal: AbortSignal,
): Promise<{ readonly files: readonly ProjectFileView[]; readonly truncated: boolean; readonly failure?: RemoteFailure }> {
  const files: ProjectFileView[] = []
  let truncated = false

  const visit = async (directory: string, depth: number): Promise<RemoteFailure | undefined> => {
    const result = await remote.list(sessionId, directory === '' ? '.' : directory, signal)
    if (!result.ok) return result.error
    if (result.value.truncated) truncated = true
    for (const entry of result.value.entries) {
      signal.throwIfAborted()
      if (files.length >= MAX_PROJECT_FILES) {
        truncated = true
        return undefined
      }
      const path = joinPath(directory, entry.name)
      if (entry.type === 'directory') {
        if (INTERNAL_DIRECTORIES.has(entry.name) || depth >= MAX_SCAN_DEPTH) continue
        const failure = await visit(path, depth + 1)
        if (failure !== undefined) return failure
        if (files.length >= MAX_PROJECT_FILES) return undefined
        continue
      }
      if (entry.type !== 'file' || (depth === 0 && INTERNAL_ROOT_FILES.has(entry.name))) continue
      const stage = stageOf(path)
      files.push({
        name: entry.name,
        relativePath: path,
        extension: extensionOf(entry.name),
        ...(entry.size === undefined ? {} : { size: entry.size }),
        kind: stage === undefined ? 'material' : 'output',
        ...(stage === undefined ? {} : { stage }),
      })
    }
    return undefined
  }

  const failure = await visit('', 0)
  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath, 'zh-CN'))
  return { files, truncated, ...(failure === undefined ? {} : { failure }) }
}

/**
 * Read a Workspace as a Nini Flow project without changing the Workspace or its Sessions.
 * @param remote - generated Workspace file Remote namespace.
 * @param workspace - Workspace row displayed as a project.
 * @param sessionId - existing Session whose root authorizes project reads.
 * @param signal - panel generation lifetime.
 * @returns unified project view.
 */
export async function readProjectView(
  remote: ProjectFilesRemote,
  workspace: WorkspaceView,
  sessionId: SessionId | undefined,
  signal: AbortSignal,
): Promise<ProjectView> {
  if (sessionId === undefined) {
    return {
      workspace,
      name: workspace.title,
      summary: '',
      initialized: false,
      materials: [],
      outputs: [],
      issues: [{ code: 'session-required', message: '项目还没有可用于读取文件的对话' }],
    }
  }
  const [stateResult, scan] = await Promise.all([
    readState(remote, sessionId, signal),
    scanFiles(remote, sessionId, signal),
  ])
  const issues: ProjectReadIssue[] = []
  if (stateResult.issue !== undefined) issues.push(stateResult.issue)
  if (scan.failure !== undefined) issues.push({ code: 'scan-failed', message: issueMessage(scan.failure) })
  if (scan.truncated) issues.push({ code: 'scan-limit-reached', message: `项目文件超过 ${MAX_PROJECT_FILES} 个，只显示部分结果` })
  const state = stateResult.state
  const files = scan.failure === undefined ? scan.files : []
  const outputs = files.filter(file => file.kind === 'output').map((file): ProjectFileView => {
    const stageSessionId = file.stage === undefined ? undefined : state?.stages[file.stage.id]?.sessionId
    return stageSessionId === undefined || !workspace.sessionIds.includes(stageSessionId)
      ? file
      : { ...file, sessionId: stageSessionId }
  })
  return {
    workspace,
    readerSessionId: sessionId,
    name: state?.name.trim() || workspace.title,
    summary: state?.summary ?? '',
    initialized: state !== undefined,
    ...(state === undefined ? {} : { state }),
    materials: files.filter(file => file.kind === 'material'),
    outputs,
    issues,
  }
}
