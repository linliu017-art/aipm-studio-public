/** Immutable, project-local Workshop revisions and human-readable artifacts. */
import { readFile, readdir, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'
import { withFileLock } from '@deepseek-ai/dsh-atomic-write'
import { readDocumentCatalog, readProjectDocuments, saveProjectDocuments } from './documents.ts'
import { readProject, updateStage } from './store.ts'
import { checkWorkshopProposal } from './workshop-rules.ts'
import type { WorkshopCheck } from './workshop-rules.ts'
import { parseWorkshopProposal, type WorkshopDeliverable, type WorkshopProposal } from './workshop-schema.ts'
import { FACT_LABELS, LAYERS } from './workshop-catalog.ts'

/** Legacy Workshop directory, read only for existing projects. */
export const WORKSHOP_DIRECTORY = '03-PRD/Agent工坊'

/** Saved proposal and its exact requested deliverables. */
export interface WorkshopRevision {
  schemaVersion: 1
  version: number
  change: string
  createdAt: string
  projectName: string
  deliverables: WorkshopDeliverable[]
  proposal: WorkshopProposal
}

/** Explicit document identity and optimistic version for one requested Workshop artifact. */
export interface WorkshopDocumentTarget {
  kind: WorkshopDeliverable
  documentId?: string
  expectedVersion: number
}

function inside(root: string, path: string): void {
  const child = relative(root, path)
  if (child === '..' || child.startsWith('..' + sep) || isAbsolute(child)) throw new Error('Workshop path leaves the current project')
}

async function directory(root: string): Promise<string | undefined> {
  const canonical = await realpath(root)
  let current = canonical
  for (const segment of WORKSHOP_DIRECTORY.split('/')) {
    const candidate = join(current, segment)
    try { current = await realpath(candidate) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      return undefined
    }
    inside(canonical, current)
  }
  return current
}

/**
 * Read the latest complete revision without creating a project or directory.
 * @param root - selected Session working directory.
 * @returns latest revision, or undefined before the first Workshop save.
 */
export async function readWorkshopRevision(root: string): Promise<WorkshopRevision | undefined> {
  const catalog = await readDocumentCatalog(root)
  let version: number
  let file: string
  if (catalog?.workshop !== undefined) {
    version = catalog.workshop.version
    file = await realpath(join(root, catalog.workshop.path))
    inside(await realpath(root), file)
  } else {
    const parent = await directory(root)
    if (parent === undefined) return undefined
    const versions = (await readdir(parent)).filter(name => /^V[1-9]\d*$/.test(name))
      .map(name => Number(name.slice(1))).sort((a, b) => b - a)
    const latest = versions[0]
    if (latest === undefined) return undefined
    if (!Number.isSafeInteger(latest)) throw new Error('Invalid Workshop version directory')
    version = latest
    file = await realpath(join(parent, 'V' + String(version), '.workshop.json'))
    inside(parent, file)
  }
  const value: unknown = JSON.parse(await readFile(file, 'utf8'))
  if (typeof value !== 'object' || value === null || !('schemaVersion' in value) || value.schemaVersion !== 1
    || !('version' in value) || value.version !== version || !('proposal' in value)
    || !('change' in value) || typeof value.change !== 'string'
    || !('createdAt' in value) || typeof value.createdAt !== 'string'
    || !('projectName' in value) || typeof value.projectName !== 'string'
    || !('deliverables' in value) || !Array.isArray(value.deliverables)
    || value.deliverables.length === 0 || !value.deliverables.every((item): item is WorkshopDeliverable => item === 'prd' || item === 'plan')) {
    throw new Error('Workshop revision metadata is invalid; preserve it and repair before saving')
  }
  return { schemaVersion: 1, version, proposal: parseWorkshopProposal(value.proposal), change: value.change,
    createdAt: value.createdAt, projectName: value.projectName, deliverables: value.deliverables }
}

function bullets(items: readonly string[]): string { return items.map(item => '- ' + item).join('\n') }
function cell(text: string): string { return text.replaceAll('|', '／').replaceAll('\n', ' ') }

/**
 * Render exactly the requested artifact from one saved revision.
 * @param revision - validated version metadata and source proposal.
 * @param kind - requested artifact type.
 * @param check - mechanical check results, never an independent model review.
 * @param documentVersion - this document revision, independent of the Workshop workflow counter.
 * @returns standalone Markdown with sources, assumptions and visible check limitations.
 */
export function renderWorkshopArtifact(
  revision: WorkshopRevision, kind: WorkshopDeliverable, check: WorkshopCheck, documentVersion = revision.version,
): string {
  const p = revision.proposal
  const lines = ['# ' + revision.projectName + ' · ' + (kind === 'prd' ? 'PRD' : '方案'), '',
    '版本：V' + String(documentVersion), '', '本次变更：' + revision.change, '',
    '文档状态：' + (p.facts.some(fact => fact.status === 'open') || p.requirements.some(item => item.status === 'open')
      || p.unknowns.length > 0 ? '含待确认事项的草稿' : '待用户评审'), '',
    '## 原始材料', '', p.sourceText, '', '## 需求事实', '', '| 维度 | 内容 | 状态 | 原文依据 |', '|---|---|---|---|',
    ...p.facts.map(fact => '| ' + [FACT_LABELS[fact.key], fact.value, fact.status === 'confirmed' ? '明确' : '待确认', fact.source].map(cell).join(' | ') + ' |'), '']
  if (kind === 'prd') {
    lines.push('## 功能需求与验收条件', '')
    for (const item of p.requirements) lines.push('### ' + item.id + ' ' + item.title, '', item.description, '',
      '状态：' + (item.status === 'confirmed' ? '明确' : '待确认'), '', '原文依据：' + item.source, '', bullets(item.acceptance), '')
    lines.push('## 成功指标', '', bullets(p.metrics), '')
  } else if (p.design !== undefined) {
    const d = p.design
    lines.push('## 五要素', '')
    const elementLabels: Record<string, string> = { tools: '工具', knowledge: '知识', observation: '观察', action: '行动', permissions: '权限' }
    for (const [name, items] of Object.entries(d.elements)) lines.push('### ' + (elementLabels[name] ?? name), '', bullets(items), '')
    const failureLabels: Record<string, string> = { toolFailure: '工具失败', hallucination: '模型幻觉', timeout: '超时', unauthorized: '越权' }
    lines.push('## 组件选型', '', '| 组件 | 结论 | 依据 |', '|---|---|---|',
      ...check.components.map(item => '| ' + [item.id + ' ' + item.name, item.decision, item.reason].map(cell).join(' | ') + ' |'), '',
      '## 七层架构', '', '```mermaid', 'flowchart TD',
      ...LAYERS.map((layer, index) => '  L' + String(index) + '["' + layer[1] + '"]'),
      ...LAYERS.slice(1).map((_layer, index) => '  L' + String(index) + ' --> L' + String(index + 1)), '```', '',
      '层次图用于组织设计，不表示已实现的运行拓扑。', '', '## 领域工具', '', '| 工具 | 输入 | 输出 | 副作用 | 权限 | 归属层 |', '|---|---|---|---|---|---|',
      ...d.tools.map(tool => '| ' + [tool.name, tool.input, tool.output, tool.sideEffect, tool.permission, tool.layer].map(cell).join(' | ') + ' |'), '',
      '## 系统提示词草案', '', d.systemPrompt, '', '## 上下文与记忆', '', d.contextMemory, '', '## 失败与降级', '',
      ...Object.entries(d.failures).map(([scene, handling]) => '- ' + (failureLabels[scene] ?? scene) + '：' + handling), '',
      '## 可观测方案', '', bullets(d.observability), '', '## 部署方案', '', d.deployment, '', '## 测试设计', '', bullets(d.testing), '')
  }
  lines.push('## 待确认事项', '', bullets([...p.unknowns, ...check.warnings]) || '暂无记录；仍需用户评审。', '',
    '## 检查范围', '', '已执行结构、引用一致性及适用的设计规则检查。未执行独立模型审稿、竞品调研、代码运行或验收测试。',
    '原文引用只能验证与所提交材料的一致性，不能证明材料真实或推断已获用户确认。', '')
  return lines.join('\n')
}

/**
 * Commit a new immutable version after validation and optimistic concurrency checks.
 * @param root - selected project directory; must already be initialized.
 * @param proposal - structurally validated model output.
 * @param deliverables - exact requested artifacts.
 * @param expectedVersion - zero initially, otherwise the version previously read.
 * @param change - user request or description of the current revision.
 * @param targets - one exact document target per requested artifact; omitted identities create separate documents.
 * @param sessionId - producing Session, when the save comes from a conversation.
 * @returns committed revision and project-relative artifact paths.
 */
export async function saveWorkshopRevision(
  root: string, proposal: WorkshopProposal, deliverables: WorkshopDeliverable[],
  expectedVersion: number, change: string, targets: readonly WorkshopDocumentTarget[], sessionId?: string,
): Promise<{
  revision: WorkshopRevision
  paths: string[]
  documents: { documentId: string; title: string; version: number; path: string }[]
}> {
  const check = checkWorkshopProposal(proposal, deliverables)
  if (check.errors.length > 0) throw new Error(check.errors.join('\n'))
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || !change.trim()) throw new Error('Expected version and change are required')
  if (targets.length !== deliverables.length || new Set(targets.map(target => target.kind)).size !== targets.length
    || !targets.every(target => deliverables.includes(target.kind))) throw new Error('Provide one document target per requested artifact')
  const project = await readProject(root)
  if (project === undefined) throw new Error('Use aipm_stage init to save this product before writing Workshop artifacts')
  const canonical = await realpath(root)
  const stateDirectory = await realpath(join(canonical, '.aipm'))
  inside(canonical, stateDirectory)
  return withFileLock(join(stateDirectory, 'workshop'), async () => {
    const current = await readWorkshopRevision(root)
    if ((current?.version ?? 0) !== expectedVersion) throw new Error('Workshop version changed; get the latest version before saving')
    const revision: WorkshopRevision = { schemaVersion: 1, version: expectedVersion + 1, createdAt: new Date().toISOString(),
      projectName: project.name, change: change.trim(), proposal, deliverables }
    const catalog = await readProjectDocuments(root)
    const inputs = deliverables.map((kind) => {
      const fileName = kind === 'prd' ? 'PRD.md' : '方案.md'
      const target = targets.find(item => item.kind === kind)
      if (target === undefined) throw new Error('Missing Workshop document target')
      const document = target.documentId === undefined ? undefined : catalog.documents.find(row => row.id === target.documentId)
      if (target.documentId !== undefined && (document === undefined || document.kind !== kind)) {
        throw new Error('Document target does not match the requested artifact')
      }
      return { ...document === undefined ? {} : { id: document.id },
        title: document?.title ?? (kind === 'prd' ? 'PRD' : '技术方案'), kind,
        fileName, content: renderWorkshopArtifact(revision, kind, check, target.expectedVersion + 1),
        expectedVersion: target.expectedVersion,
        change, source: 'workshop' as const, ...sessionId === undefined ? {} : { sessionId } }
    })
    const documents = await saveProjectDocuments(root, inputs, { version: revision.version, text: JSON.stringify(revision, null, 2) + '\n' })
    const committed = documents.map((document) => {
      const latest = document.revisions.at(-1)
      if (latest === undefined) throw new Error('Workshop document has no revision')
      return { documentId: document.id, title: document.title, version: latest.version, path: latest.path }
    })
    return { revision, paths: committed.map(document => document.path), documents: committed }
  })
}

/**
 * Associate an already committed Workshop version with the PRD stage.
 * @param root - selected project directory.
 * @param version - committed version number.
 * @param sessionId - current Session identity.
 */
export async function markWorkshopStage(root: string, version: number, sessionId: string): Promise<void> {
  await updateStage(root, { stage: '03-PRD', status: 'done', note: 'Agent 工坊 V' + String(version) + ' 已保存，检查结论见文档', sessionId })
}
