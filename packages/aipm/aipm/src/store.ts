/** Project folder layout and the `.aipm/project.json` stage-state document. */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { FIRST_STAGE_ID, STAGES, STAGE_IDS, findStage } from './stages.ts'

/** Stage progress values shown on the stage board. */
export type StageStatus = 'not_started' | 'in_progress' | 'done'

/** Valid stage statuses. */
export const STAGE_STATUSES: readonly StageStatus[] = ['not_started', 'in_progress', 'done']

/** Recorded progress of one stage. */
export interface StageState {
  status: StageStatus
  /** Short progress note, e.g. which sub-step finished last. */
  note?: string
  /** Session that last worked on this stage; the board reopens it. */
  sessionId?: string
  /** ISO timestamp of the last update. */
  updatedAt?: string
  /** ISO timestamp of the user's completion confirmation. */
  confirmedAt?: string
}

/** The whole project state document. */
export interface ProjectState {
  schemaVersion: 1
  name: string
  summary: string
  createdAt: string
  /** Stage the pipeline currently points at. */
  currentStage: string
  stages: Record<string, StageState>
}

/** Project-relative state file path. */
export const PROJECT_STATE_FILE = '.aipm/project.json'

/** Input for creating a project in an existing or new folder. */
export interface InitProjectInput {
  name: string
  summary: string
}

/** Input for one stage update. */
export interface UpdateStageInput {
  stage: string
  status?: StageStatus
  note?: string
  sessionId?: string
  /** Must be true to mark a stage done: the user confirmed completion in chat. */
  confirmedByUser?: boolean
}

/** A rejected project operation with a message meant for the model or the user. */
export class ProjectError extends Error {}

function statePath(root: string): string {
  return join(root, PROJECT_STATE_FILE)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeStage(value: unknown): StageState {
  if (!isRecord(value) || !STAGE_STATUSES.includes(value.status as StageStatus)) return { status: 'not_started' }
  const stage: StageState = { status: value.status as StageStatus }
  for (const key of ['note', 'sessionId', 'updatedAt', 'confirmedAt'] as const) {
    if (typeof value[key] === 'string') stage[key] = value[key]
  }
  return stage
}

/**
 * Parse a state document, filling stages the document predates.
 * @param text - raw JSON text.
 * @returns the normalized state.
 */
export function parseProjectState(text: string): ProjectState {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new ProjectError(`${PROJECT_STATE_FILE} is not valid JSON`)
  }
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.name !== 'string') {
    throw new ProjectError(`${PROJECT_STATE_FILE} is not an AIPM project state document`)
  }
  const stored = isRecord(value.stages) ? value.stages : {}
  const stages: Record<string, StageState> = {}
  for (const id of STAGE_IDS) stages[id] = normalizeStage(stored[id])
  const currentStage = typeof value.currentStage === 'string' && findStage(value.currentStage) ? value.currentStage : FIRST_STAGE_ID
  return {
    schemaVersion: 1,
    name: value.name,
    summary: typeof value.summary === 'string' ? value.summary : '',
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : '',
    currentStage,
    stages,
  }
}

/**
 * Read a project's state.
 * @param root - absolute project folder.
 * @returns the state, or undefined when the folder is not an AIPM project.
 */
export async function readProject(root: string): Promise<ProjectState | undefined> {
  let text: string
  try {
    text = await readFile(statePath(root), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
  return parseProjectState(text)
}

async function writeProject(root: string, state: ProjectState): Promise<void> {
  const target = statePath(root)
  const temporary = `${target}.${process.pid}.tmp`
  await mkdir(join(root, '.aipm'), { recursive: true })
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  await rename(temporary, target)
}

function agentsDocument(input: InitProjectInput): string {
  const stageLines = STAGES.map(stage => `- \`${stage.id}/\`：${stage.title}`).join('\n')
  return `# ${input.name}

${input.summary}

这是一个 AIPM Studio 产品项目。各阶段产出物放在对应的阶段目录里，后面的阶段要先读前面阶段的产出物。

${stageLines}

阶段状态记录在 \`${PROJECT_STATE_FILE}\`，只通过 \`aipm_stage\` 工具读写，不要直接编辑这个文件。
`
}

/**
 * Create the stage folders, state document, and project AGENTS.md.
 * @param root - absolute project folder; created when missing.
 * @param input - product name and one-line summary.
 * @param now - creation time.
 * @returns the new state.
 */
export async function initProject(root: string, input: InitProjectInput, now: Date = new Date()): Promise<ProjectState> {
  const name = input.name.trim()
  if (name === '') throw new ProjectError('project name must not be empty')
  if (await readProject(root) !== undefined) throw new ProjectError('this folder is already an AIPM project; read it with action "get"')
  for (const id of STAGE_IDS) await mkdir(join(root, id), { recursive: true })
  const agentsPath = join(root, 'AGENTS.md')
  await writeFile(agentsPath, agentsDocument({ name, summary: input.summary.trim() }), { encoding: 'utf8', flag: 'wx' }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'EEXIST') throw error
  })
  const stages: Record<string, StageState> = {}
  for (const id of STAGE_IDS) stages[id] = { status: 'not_started' }
  const state: ProjectState = {
    schemaVersion: 1,
    name,
    summary: input.summary.trim(),
    createdAt: now.toISOString(),
    currentStage: FIRST_STAGE_ID,
    stages,
  }
  await writeProject(root, state)
  return state
}

/**
 * Apply one stage update.
 * @param root - absolute project folder.
 * @param input - the stage and the fields to change.
 * @param now - update time.
 * @returns the updated state.
 */
export async function updateStage(root: string, input: UpdateStageInput, now: Date = new Date()): Promise<ProjectState> {
  const state = await readProject(root)
  if (state === undefined) throw new ProjectError('this folder is not an AIPM project yet; create it with action "init" first')
  if (findStage(input.stage) === undefined) throw new ProjectError(`unknown stage ${JSON.stringify(input.stage)}; valid stages: ${STAGE_IDS.join(', ')}`)
  if (input.status !== undefined && !STAGE_STATUSES.includes(input.status)) {
    throw new ProjectError(`unknown status ${JSON.stringify(input.status)}; valid statuses: ${STAGE_STATUSES.join(', ')}`)
  }
  if (input.status === 'done' && input.confirmedByUser !== true) {
    throw new ProjectError('a stage can be marked done only after the user confirmed it; ask with ask_user_question, then retry with confirmed_by_user: true')
  }
  const timestamp = now.toISOString()
  const stage: StageState = { ...(state.stages[input.stage] ?? { status: 'not_started' }) }
  if (input.status !== undefined) stage.status = input.status
  if (input.note !== undefined) stage.note = input.note
  if (input.sessionId !== undefined) stage.sessionId = input.sessionId
  stage.updatedAt = timestamp
  if (input.status === 'done') stage.confirmedAt = timestamp
  state.stages[input.stage] = stage
  if (input.status === 'in_progress') state.currentStage = input.stage
  if (input.status === 'done') {
    const next = STAGE_IDS[STAGE_IDS.indexOf(input.stage) + 1]
    if (next !== undefined) state.currentStage = next
  }
  await writeProject(root, state)
  return state
}
