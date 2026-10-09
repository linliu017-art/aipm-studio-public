/** Unified read model over one Workspace, its AIPM state, and project files. */

import { readdir, stat } from 'node:fs/promises'
import { extname, join, relative, sep } from 'node:path'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { PROJECT_STATE_FILE, readProject, type ProjectState } from './store.ts'
import { STAGE_IDS } from './stages.ts'

const INTERNAL_DIRECTORIES = new Set(['.aipm', '.git', 'node_modules'])
const INTERNAL_ROOT_FILES = new Set(['.DS_Store', 'AGENTS.md'])

/** Workspace-owned fields required to build an AIPM project view. */
export interface WorkspaceProjectSource {
  readonly id: WorkspaceId
  readonly path: string
  readonly title: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly sessionIds: readonly SessionId[]
}

/** Explicit scan bounds supplied by the host that owns deployment policy. */
export interface ProjectScanOptions {
  readonly maxDepth: number
  readonly maxFiles: number
}

/** One user material or generated output discovered under the project directory. */
export interface ProjectFileView {
  readonly name: string
  readonly relativePath: string
  readonly extension: string
  readonly size: number
  readonly modifiedAt: string
  readonly kind: 'material' | 'output'
  readonly stage?: string
}

/** A recoverable problem found while reading one project. */
export interface ProjectReadIssue {
  readonly code: 'missing-directory' | 'invalid-state' | 'scan-failed' | 'scan-limit-reached'
  readonly message: string
}

/** One UI-ready project assembled from every current source of project truth. */
export interface AipmProjectView {
  readonly id: WorkspaceId
  readonly path: string
  readonly workspaceTitle: string
  readonly name: string
  readonly nameSource: 'aipm' | 'workspace'
  readonly summary: string
  readonly initialized: boolean
  readonly createdAt: string
  readonly updatedAt: string
  readonly sessionIds: readonly SessionId[]
  readonly state?: ProjectState
  readonly materials: readonly ProjectFileView[]
  readonly outputs: readonly ProjectFileView[]
  readonly health: 'ok' | 'warning' | 'error'
  readonly issues: readonly ProjectReadIssue[]
}

interface ProjectScanResult {
  readonly files: readonly ProjectFileView[]
  readonly truncated: boolean
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined
}

function validateScanOptions(options: ProjectScanOptions): void {
  if (!Number.isSafeInteger(options.maxDepth) || options.maxDepth < 0) {
    throw new RangeError('project scan maxDepth must be a non-negative safe integer')
  }
  if (!Number.isSafeInteger(options.maxFiles) || options.maxFiles < 1) {
    throw new RangeError('project scan maxFiles must be a positive safe integer')
  }
}

function stageFor(relativePath: string): string | undefined {
  const first = relativePath.split(sep, 1)[0]
  return first !== undefined && STAGE_IDS.includes(first) ? first : undefined
}

async function scanProjectFiles(root: string, options: ProjectScanOptions): Promise<ProjectScanResult> {
  validateScanOptions(options)
  const files: ProjectFileView[] = []
  let truncated = false

  const visit = async (directory: string, depth: number): Promise<void> => {
    const entries = (await readdir(directory, { withFileTypes: true }))
      .sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      if (files.length >= options.maxFiles) {
        truncated = true
        return
      }
      if (entry.isDirectory()) {
        if (INTERNAL_DIRECTORIES.has(entry.name) || depth >= options.maxDepth) continue
        await visit(join(directory, entry.name), depth + 1)
        if (truncated) return
        continue
      }
      if (!entry.isFile()) continue
      const path = join(directory, entry.name)
      const relativePath = relative(root, path)
      if (depth === 0 && INTERNAL_ROOT_FILES.has(entry.name)) continue
      let details
      try {
        details = await stat(path)
      } catch (error) {
        if (errorCode(error) === 'ENOENT') continue
        throw error
      }
      const stage = stageFor(relativePath)
      files.push({
        name: entry.name,
        relativePath,
        extension: extname(entry.name).slice(1).toLowerCase(),
        size: details.size,
        modifiedAt: details.mtime.toISOString(),
        kind: stage === undefined ? 'material' : 'output',
        ...(stage === undefined ? {} : { stage }),
      })
    }
  }

  await visit(root, 0)
  return { files, truncated }
}

function latestTimestamp(initial: string, candidates: readonly string[]): string {
  let latest = initial
  let latestValue = Date.parse(initial)
  for (const candidate of candidates) {
    const value = Date.parse(candidate)
    if (!Number.isNaN(value) && (Number.isNaN(latestValue) || value > latestValue)) {
      latest = candidate
      latestValue = value
    }
  }
  return latest
}

function healthOf(issues: readonly ProjectReadIssue[]): AipmProjectView['health'] {
  if (issues.some(issue => issue.code !== 'scan-limit-reached')) return 'error'
  return issues.length === 0 ? 'ok' : 'warning'
}

/**
 * Read one Workspace as a UI-ready AIPM project without mutating either source.
 * @param workspace - durable Workspace identity, path, title, and Sessions.
 * @param options - explicit recursive file-scan bounds.
 * @returns a unified project view, including recoverable read issues.
 */
export async function readAipmProjectView(
  workspace: WorkspaceProjectSource,
  options: ProjectScanOptions,
): Promise<AipmProjectView> {
  validateScanOptions(options)
  const issues: ProjectReadIssue[] = []
  let directoryPresent = true
  try {
    directoryPresent = (await stat(workspace.path)).isDirectory()
  } catch (error) {
    if (errorCode(error) !== 'ENOENT' && errorCode(error) !== 'ENOTDIR') throw error
    directoryPresent = false
  }
  if (!directoryPresent) {
    issues.push({ code: 'missing-directory', message: `Project directory is unavailable: ${workspace.path}` })
    return {
      id: workspace.id,
      path: workspace.path,
      workspaceTitle: workspace.title,
      name: workspace.title,
      nameSource: 'workspace',
      summary: '',
      initialized: false,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
      sessionIds: workspace.sessionIds,
      materials: [],
      outputs: [],
      health: 'error',
      issues,
    }
  }

  let state: ProjectState | undefined
  let initialized = false
  try {
    state = await readProject(workspace.path)
    initialized = state !== undefined
  } catch (error) {
    initialized = true
    issues.push({
      code: 'invalid-state',
      message: `Cannot read ${PROJECT_STATE_FILE}: ${error instanceof Error ? error.message : String(error)}`,
    })
  }

  let scan: ProjectScanResult = { files: [], truncated: false }
  try {
    scan = await scanProjectFiles(workspace.path, options)
  } catch (error) {
    issues.push({
      code: 'scan-failed',
      message: `Cannot scan project files: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
  if (scan.truncated) {
    issues.push({
      code: 'scan-limit-reached',
      message: `Project file scan stopped after ${options.maxFiles} files.`,
    })
  }

  const stateName = state?.name.trim()
  const nameSource = stateName === undefined || stateName === '' ? 'workspace' : 'aipm'
  const fileTimes = scan.files.map(file => file.modifiedAt)
  const stageTimes = state === undefined
    ? []
    : Object.values(state.stages).flatMap(stage => stage.updatedAt === undefined ? [] : [stage.updatedAt])
  return {
    id: workspace.id,
    path: workspace.path,
    workspaceTitle: workspace.title,
    name: stateName === undefined || stateName === '' ? workspace.title : stateName,
    nameSource,
    summary: state?.summary ?? '',
    initialized,
    createdAt: state?.createdAt || workspace.createdAt,
    updatedAt: latestTimestamp(workspace.updatedAt, [...stageTimes, ...fileTimes]),
    sessionIds: workspace.sessionIds,
    ...(state === undefined ? {} : { state }),
    materials: scan.files.filter(file => file.kind === 'material'),
    outputs: scan.files.filter(file => file.kind === 'output'),
    health: healthOf(issues),
    issues,
  }
}

/**
 * Preserve Workspace display order while reading a complete AIPM project list.
 * @param workspaces - ordered durable Workspace records.
 * @param options - explicit recursive file-scan bounds shared by every project.
 * @returns ordered unified project views.
 */
export async function readAipmProjectViews(
  workspaces: readonly WorkspaceProjectSource[],
  options: ProjectScanOptions,
): Promise<readonly AipmProjectView[]> {
  validateScanOptions(options)
  return await Promise.all(workspaces.map(workspace => readAipmProjectView(workspace, options)))
}
