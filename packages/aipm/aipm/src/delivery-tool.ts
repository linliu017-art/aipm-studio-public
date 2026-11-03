/** Selected-document impact reports and deterministic development handoff archives. */
import { createHash } from 'node:crypto'
import { extname } from 'node:path'
import { realpath } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import type { DeliveryState, InspectionEvidence } from '@deepseek-ai/dsh-api-session-controller/types'
import type {} from '@deepseek-ai/dsh-session-projection'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { strToU8, zipSync } from 'fflate'
import { readDocumentSource, readProjectDocuments, saveProjectDocuments } from './documents.ts'
import { readProject } from './store.ts'

/** Deployment limits for selected inputs and published artifacts. */
export interface DeliveryConfig {
  /** Maximum explicitly selected documents. */
  maxFiles: number
  /** Maximum bytes per selected document. */
  maxFileBytes: number
  /** Maximum serialized model-visible input. */
  maxInputBytes: number
  /** Maximum bytes in an impact report. */
  maxReportBytes: number
  /** Maximum bytes in the final ZIP. */
  maxArchiveBytes: number
  /** Maximum uncompressed bytes, including handoff instructions. */
  maxArchiveInputBytes: number
}
const TEXT = new Set(['.md', '.txt', '.html', '.csv', '.svg', '.mmd'])
const FORMATS = new Set([...TEXT, '.pdf', '.docx', '.xlsx', '.pptx', '.png', '.jpg', '.jpeg', '.webp'])
const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
function checkText(text: string): string {
  const credentials = new RegExp('-----BEGIN [A-Z ]*PRIVATE KEY-----|'
    + String.raw`\b(?:ghp_|github_pat_|sk_live_|sk-(?:proj-|ant-)?)[A-Za-z0-9_-]{24,}|\bAKIA[A-Z0-9]{16}\b`)
  if (credentials.test(text)) throw new Error('选中文档或说明含疑似凭据，请先移除。')
  return text
}
function stateFor(ctx: Context, session: Session): DeliveryState {
  const state = ctx.get('sessionProjections')?.stateOf(session, 'workshopDelivery')
  if (state?.selection === undefined || state.selection === null) throw new Error('请从工坊选择项目文档后启动此任务。')
  return state
}
async function load(ctx: Context, session: Session, config: DeliveryConfig, observed: boolean) {
  const state = stateFor(ctx, session); const selection = state.selection; const root = session.header.cwd
  if (selection === null || root === undefined) throw new Error('缺少项目文档选择。')
  if (selection.documents.length > config.maxFiles) throw new Error('选中文档数量超限，请缩小范围。')
  checkText(selection.request)
  const catalog = await readProjectDocuments(root)
  let total = 0
  const documents = []
  for (const selected of selection.documents) {
    const document = catalog.documents.find(row => row.id === selected.id)
    const revision = document?.revisions.at(-1)
    if (document === undefined || revision?.version !== selected.version) throw new Error('文档版本已变化，请返回工坊重新选择。')
    checkText(document.title); checkText(revision.fileName)
    const extension = extname(revision.fileName).toLowerCase()
    if (!FORMATS.has(extension)) throw new Error('只支持文档、原型及图片；不打包源码、配置、JSON 或压缩包。')
    if (selection.task === 'impact' && !TEXT.has(extension)) throw new Error('影响分析请选择文本需求或方案文档。')
    const bytes = await readDocumentSource(root, revision.path, config.maxFileBytes)
    total += bytes.length
    if (total > config.maxArchiveInputBytes) throw new Error('选中文档总大小超限，请缩小范围。')
    const hash = digest(bytes)
    if (observed && !state.snapshot?.documents.some(row => row.id === document.id
      && row.version === revision.version && row.hash === hash)) {
      throw new Error('输入文档已变化或尚未读取，请重新 get 后再处理。')
    }
    const text = TEXT.has(extension)
      ? checkText(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) : undefined
    documents.push({ id: document.id, title: document.title, kind: document.kind, version: revision.version,
      fileName: revision.fileName, path: revision.path, bytes, hash, text })
  }
  if (stateFor(ctx, session).selection !== selection) throw new Error('本轮文档选择已变化，请重新开始。')
  return { selection, documents, root }
}
function archiveName(name: string, used: Set<string>): string {
  const extension = extname(name).toLowerCase()
  let stem = name.slice(0, -extension.length).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/^[. ]+|[. ]+$/g, '')
  if (!stem || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem)) stem = '文档-' + stem
  stem = Array.from(new Intl.Segmenter().segment(stem), part => part.segment).slice(0, 80).join('')
  let candidate = stem + extension; let number = 1
  while (used.has(candidate.normalize('NFC').toLowerCase())) candidate = stem + '-' + String(++number) + extension
  used.add(candidate.normalize('NFC').toLowerCase())
  return candidate
}

/**
 * Register selected-input loading, impact saves and deterministic ZIP assembly.
 * @param ctx - current Agent services and logged task projections.
 * @param config - explicit input and artifact budgets.
 */
export function registerDeliveryTool(ctx: Context, config: DeliveryConfig): void {
  ctx.tools.guard((exec) => {
    if (exec.agent === undefined) return undefined
    const selected = ctx.get('sessionProjections')?.stateOf(exec.agent.session, 'workshopDelivery')?.selection
    if (selected === undefined || selected === null) return undefined
    const args = exec.arguments
    if (['present', 'todo_write', 'skill'].includes(exec.name)) return undefined
    if (typeof args === 'object' && args !== null && 'action' in args) {
      if (exec.name === 'aipm_delivery' && (args.action === 'get'
        || args.action === (selected.task === 'impact' ? 'impact' : 'package'))) return undefined
      if (exec.name === 'aipm_stage' && (args.action === 'get' || args.action === 'update')) return undefined
      if (exec.name === 'aipm_inspect' && selected.task === 'impact' && selected.sourceRoot !== undefined
        && (args.action === 'scan' || args.action === 'read')) return undefined
    }
    return '本轮只处理选中文档：影响分析用 aipm_delivery get/impact；交接包用 get/package。不改原文档、不运行代码或外部工具。'
  })
  ctx.tools.register(defineTool({
    name: 'aipm_delivery',
    description: 'Use only for the explicit Workshop impact or handoff selection. get snapshots exactly selected current document versions. '
      + 'impact saves a separate advisory report, never edits originals. Cite exact quote substrings and selected document IDs. '
      + 'Supported code impact requires real aipm_inspect code evidence; otherwise mark proposed/unknown. '
      + 'package deterministically creates a ZIP of selected files plus a readable checklist and coding-AI instructions; '
      + 'no source tree, internal JSON, new PRD, code generation, execution or deployment. Call get first, then impact or package as selected; present returned paths.',
    parameters: {
      action: { type: 'string', required: true, enum: ['get', 'impact', 'package'] },
      summary: { type: 'string', description: 'impact: concise advisory overview, distinguishing known and proposed changes.' },
      items: { type: 'array', description: 'impact: affected areas and proposed actions; no claims of executed checks.',
        items: { type: 'object', additionalProperties: false, properties: {
          area: { type: 'string', required: true,
            enum: ['requirement', 'flow', 'data', 'api', 'permission', 'ui', 'architecture', 'code', 'test', 'document', 'other'] },
          title: { type: 'string', required: true }, impact: { type: 'string', required: true }, action: { type: 'string', required: true },
          certainty: { type: 'string', required: true, enum: ['supported', 'proposed', 'unknown'] },
          priority: { type: 'string', required: true, enum: ['high', 'medium', 'low'] },
          references: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
            documentId: { type: 'string', required: true }, quote: { type: 'string', required: true },
          } } },
          evidenceIds: { type: 'array', items: { type: 'string' } },
          testCases: { type: 'array', required: true, items: { type: 'string' } },
        } } },
      questions: { type: 'array', items: { type: 'string' }, description: 'impact: unresolved decisions and unread areas.' },
    },
    output: { schema: { type: 'object', additionalProperties: false, properties: {
      summary: { type: 'string', required: true }, data: { type: 'string', required: true },
    } }, render: (_args, value) => [{ type: 'text', text: value.summary + '\n' + value.data }] },
    async execute(args, exec) {
      const session = exec.agent?.session
      if (session === undefined) throw new Error('需要当前项目会话。')
      exec.signal.throwIfAborted()
      const { selection, documents, root } = await load(ctx, session, config, args.action !== 'get')
      if (args.action === 'get') {
        const value = { task: selection.task, request: selection.request,
          documents: documents.map(({ bytes, text, ...document }) => ({ ...document, bytes: bytes.length,
            ...selection.task === 'impact' ? { text } : {} })), sourceRoot: selection.sourceRoot ?? null,
          sourceInstruction: selection.sourceRoot === undefined ? '未选代码目录，代码影响只能列建议或待确认。'
            : '已选代码目录，必须先 aipm_inspect scan/read 再保存报告；未读取不等于未选择。' }
        const data = JSON.stringify(value)
        if (Buffer.byteLength(data) > config.maxInputBytes) throw new Error('文档内容超过模型输入限制，请减少选择。')
        exec.signal.throwIfAborted()
        session.append('workshop/delivery-snapshot', { documents: documents.map(({ id, version, hash }) => ({ id, version, hash })) })
        return { summary: '已锁定本轮所选文档版本。', data }
      }
      let content: string | Uint8Array; let fileName: string
      if (args.action === 'package') {
        if (selection.task !== 'handoff') throw new Error('本轮不是开发交接任务。')
        const project = await readProject(root)
        if (project === undefined) throw new Error('请先选择已登记项目。')
        const files: Record<string, Uint8Array> = {}
        const used = new Set(['交接清单.md', '给编程ai的开发说明.md'])
        const list = documents.map((document) => {
          const name = archiveName(document.fileName, used); files[name] = document.bytes
          return `- ${name} · ${document.title} V${document.version} · SHA-256 ${document.hash}`
        })
        const missing = ['prd', 'plan'].filter(kind => !documents.some(document => document.kind === kind))
        files['交接清单.md'] = strToU8(['# 开发交接清单', '', `项目：${checkText(project.name)}`, '', checkText(project.summary), '',
          '## 选中文档', '', ...list, '', '归档仅包含本次选择的版本。未打包源代码、环境配置、会话记录或工作台内部 JSON。', '',
          '## 缺少的材料', '', missing.length ? missing.map(kind => '- 未选择' + (kind === 'prd' ? ' PRD' : '技术方案')).join('\n') : '已选择 PRD 和技术方案。', '',
          '## 交接备注', '', selection.request, '', '本交接包仅整理材料，未运行编程 AI、代码或测试。', '',
        ].join('\n'))
        files['给编程AI的开发说明.md'] = strToU8(['# 给编程 AI 的开发说明', '', '先阅读《交接清单》及全部选中文档，核对版本和未决事项。', '',
          '1. 请用户指定目标代码目录，遵守该仓库的开发约定，不把本压缩包当成源码目录。',
          '2. 以明确确认的需求和方案为依据，缺少 PRD、技术方案或必要决策时先列出缺口，不把建议当成用户决定。',
          '3. 拆分可实施、可验证的步骤，说明会修改的模块及依赖；发现文档冲突时指出具体段落。',
          '4. 按用户授权开发，保留无关改动，运行与改动相符的检查，记录实际命令、结果和未验证范围。',
          '5. 交付修改说明、验证证据和剩余问题。计划、静态分析和验收建议不能描述为已实现或已通过测试。',
          '6. 不自动部署、发布、收集凭据或调用付费服务；此交接包不提供这些授权。', '',
        ].join('\n'))
        if (Object.values(files).reduce((sum, bytes) => sum + bytes.length, 0) > config.maxArchiveInputBytes) throw new Error('交接包原始内容超过限制。')
        // ZIP storage avoids recompressing Office and image artifacts.
        content = zipSync(files, { level: 0 })
        if (content.length > config.maxArchiveBytes) throw new Error('交接包超过下载大小限制，请减少选择。')
        fileName = '开发交接包.zip'
      } else {
        if (selection.task !== 'impact' || !args.summary?.trim() || !args.items?.length) throw new Error('影响分析需要概述和影响条目。')
        const inspection = ctx.get('sessionProjections')?.stateOf(session, 'workshopInspection')
        if (selection.sourceRoot !== undefined && (inspection?.target?.sourceRoot !== selection.sourceRoot
          || inspection.scan === null || (inspection.scan.files.length > 0 && inspection.evidence.length === 0))) {
          throw new Error('已选代码目录，请先用 aipm_inspect scan/read 读取证据，再保存影响报告。')
        }
        const evidence = new Map<string, InspectionEvidence>()
        for (const item of args.items) {
          if (!item.title.trim() || !item.impact.trim() || !item.action.trim()) throw new Error('影响条目不能为空。')
          for (const reference of item.references) {
            const document = documents.find(row => row.id === reference.documentId)
            if (!reference.quote.trim() || document?.text === undefined || !document.text.includes(reference.quote)) {
              throw new Error('引用必须是选中文档中的原文。')
            }
          }
          for (const id of item.evidenceIds ?? []) {
            const row = inspection?.target?.sourceRoot === selection.sourceRoot
              && selection.sourceRoot !== undefined ? inspection?.evidence.find(record => record.id === id) : undefined
            if (row === undefined) throw new Error('代码证据不属于本轮已读范围。')
            evidence.set(id, row)
          }
          if (item.certainty === 'supported' && !item.references.length && !item.evidenceIds?.length) throw new Error('有依据的影响须引用已读文档或代码。')
          if (item.area === 'code' && item.certainty === 'supported'
            && !item.evidenceIds?.some(id => evidence.get(id)?.kind === 'code')) throw new Error('确认代码影响须引用实现代码，否则标为建议或待确认。')
        }
        if (selection.sourceRoot !== undefined) {
          if (await realpath(selection.sourceRoot) !== selection.sourceRoot) throw new Error('代码目录已变化。')
          for (const row of evidence.values()) {
            if (digest(await readDocumentSource(selection.sourceRoot, row.path, config.maxFileBytes)) !== row.fileHash) throw new Error('引用代码已变化，请重新读取。')
          }
        }
        const areas = { requirement: '需求', flow: '业务流程', data: '数据', api: '接口', permission: '权限', ui: '界面',
          architecture: '架构', code: '代码', test: '测试', document: '文档', other: '其他' }
        const certainty = { supported: '有已读依据，仍需复核', proposed: '建议，尚未确认', unknown: '待确认' }
        content = ['# 迭代影响分析', '', args.summary, '', '## 本轮变更', '', selection.request, '',
          '## 分析依据', '', ...documents.map(document => `- ${document.title} V${document.version} · ${document.hash}`), '',
          '以下为影响判断和建议，未修改原文档或代码，未运行项目或测试。未读取的代码和文档不视为已覆盖。', '',
          ...selection.sourceRoot === undefined ? ['未选择代码目录，代码影响保留待确认。', ''] : [
            '所选代码目录：' + selection.sourceRoot,
            `代码范围：索引 ${inspection?.scan?.files.length ?? 0} 个文件，读取 ${new Set(inspection?.evidence.map(row => row.path)).size} 个文件。`,
            inspection?.scan?.truncated ? '代码索引已截断。' : '只覆盖已读取的代码片段。', '',
            '### 已读代码片段', '', ...inspection?.evidence.map(row =>
              `- ${row.path}:${row.startLine}-${row.endLine} · ${row.fileHash}`) ?? [], '',
          ],
          ...args.items.flatMap(item => ['## ' + item.title, '',
            `${areas[item.area]} · ${certainty[item.certainty]} · 优先级${{ high: '高', medium: '中', low: '低' }[item.priority]}`, '',
            item.impact, '', '建议动作：' + item.action, '',
            ...item.references.map((reference) => {
              const document = documents.find(row => row.id === reference.documentId)
              if (document === undefined) throw new Error('Missing selected document')
              return `文档依据：${document.title} V${document.version}「${reference.quote}」`
            }), ...item.evidenceIds?.map((id) => {
              const row = evidence.get(id)
              if (row === undefined) throw new Error('Missing read evidence')
              return `代码依据：${row.path}:${row.startLine}-${row.endLine} · ${row.fileHash}`
            }) ?? [], '', '建议验证（尚未执行）：', '', ...item.testCases.map(test => '- ' + test), '',
          ]), '## 待确认及覆盖限制', '', ...args.questions?.length ? args.questions.map(question => '- ' + question) : ['- 影响建议需由项目负责人确认后再应用。'], '',
        ].join('\n')
        checkText(content)
        if (Buffer.byteLength(content) > config.maxReportBytes) throw new Error('影响报告超出大小限制。')
        fileName = '迭代影响分析.md'
      }
      exec.signal.throwIfAborted()
      if (stateFor(ctx, session).selection !== selection) throw new Error('任务选择已变化。')
      const [document] = await saveProjectDocuments(root, [{ title: fileName.slice(0, -extname(fileName).length),
        kind: args.action === 'impact' ? 'review' : 'other', fileName, content, expectedVersion: 0,
        change: selection.request, source: 'conversation', sessionId: session.id }], undefined, documents.map(({ id, version, hash, bytes }) => ({ id, version, hash, byteLength: bytes.length })), exec.signal)
      const revision = document?.revisions.at(-1)
      if (revision === undefined) throw new Error('产物尚未保存。')
      return { summary: args.action === 'impact' ? '影响分析已单独保存，原文档未修改。' : '开发交接包已保存，可在项目文档中下载。',
        data: JSON.stringify({ documentId: document?.id, paths: [revision.path], version: revision.version }) }
    },
  }))
}
