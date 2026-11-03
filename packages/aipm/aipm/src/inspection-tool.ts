/** Read-only repository evidence and separately saved reverse-PRD / gap reports. */
import { createHash, randomUUID } from 'node:crypto'
import { lstat, readFile, readdir, realpath } from 'node:fs/promises'
import { extname, isAbsolute, join, relative, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import type { InspectionEvidence, InspectionState } from '@deepseek-ai/dsh-api-session-controller/types'
import type {} from '@deepseek-ai/dsh-session-projection'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { saveProjectDocuments } from './documents.ts'

/** Explicit bounds shared by inventory, source excerpts and rendered reports. */
export interface InspectionConfig {
  /** Maximum files in one source inventory. */
  maxFiles: number
  /** Maximum visited directory entries, including skipped files. */
  maxEntries: number
  /** Maximum source directory depth. */
  maxDepth: number
  /** Maximum bytes in one source file. */
  maxFileBytes: number
  /** Maximum lines returned by one read. */
  maxReadLines: number
  /** Maximum bytes in the full JSON inventory. */
  maxIndexBytes: number
  /** Maximum bytes in all retained evidence records for a task. */
  maxEvidenceBytes: number
  /** Maximum bytes in a complete report. */
  maxReportBytes: number
}

const SKIP = new Set(['node_modules', 'vendor', 'dist', 'build', 'out', 'coverage', 'target', '__pycache__', 'venv', 'env', '文档'])
const CODE = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.java', '.kt', '.swift', '.vue', '.svelte', '.html', '.css', '.sql', '.sh', '.dart', '.ex', '.exs', '.scala', '.lua', '.rb', '.php', '.cs', '.cpp', '.c', '.h'])
const TEXT = new Set([...CODE, '.md', '.txt', '.json', '.yaml', '.yml', '.toml', '.xml', '.graphql', '.prisma'])
function allowed(path: string): boolean {
  return path !== '' && !isAbsolute(path) && !path.includes('\\') && !path.includes('\0')
    && !path.split('/').some(part => !part || part === '.' || part === '..' || part.startsWith('.') || SKIP.has(part)
      || /(^|[-_.])(credentials?|secrets?|tokens?|passwords?)([-_.]|$)/i.test(part) || /\.(pem|key|p12|pfx|keystore)$/i.test(part))
    && TEXT.has(extname(path).toLowerCase()) && !/(^|\/)(package-lock|pnpm-lock|yarn.lock|bun.lock)/.test(path)
    && !/\.(min\.[cm]?js|map)$/.test(path)
}
function inside(root: string, path: string): boolean {
  const child = relative(root, path)
  return child === '' || (!isAbsolute(child) && child !== '..' && !child.startsWith('..' + sep))
}
function hash(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex') }
function stateFor(ctx: Context, session: Session): InspectionState {
  const registry = ctx.get('sessionProjections')
  if (registry === undefined) throw new Error('请从工坊选择代码目录后启动分析。')
  const state = registry.stateOf(session, 'workshopInspection')
  if (state === undefined || state.target === null) throw new Error('请从工坊选择代码目录后启动分析。')
  return state
}
async function sourceFile(root: string, path: string, config: InspectionConfig): Promise<Uint8Array> {
  if (!allowed(path)) throw new Error('该路径不在允许读取的源码范围内。')
  let file = root
  for (const part of path.split('/')) {
    file = join(file, part)
    if ((await lstat(file)).isSymbolicLink()) throw new Error('不读取符号链接。')
  }
  if (!inside(root, await realpath(file))) throw new Error('路径超出所选代码目录。')
  const info = await lstat(file)
  if (!info.isFile() || info.size > config.maxFileBytes) throw new Error('文件不可读或超过单文件大小限制。')
  const bytes = await readFile(file)
  if (bytes.length > config.maxFileBytes || bytes.includes(0)) throw new Error('文件过大或不是文本源码。')
  return bytes
}
function sourceText(bytes: Uint8Array): string {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  const credentials = new RegExp('-----BEGIN [A-Z ]*PRIVATE KEY-----|'
    + String.raw`\b(?:ghp_|github_pat_|sk_live_|sk-(?:proj-|ant-)?)[A-Za-z0-9_-]{24,}|\bAKIA[A-Z0-9]{16}\b`)
  if (credentials.test(text)) {
    throw new Error('文件包含疑似凭据，已跳过，未返回内容。')
  }
  return text
}

/**
 * Register bounded inspection operations tied to the Host's explicit source selection.
 * @param ctx - current Agent tool scope.
 * @param config - deployment scan, evidence and output bounds.
 */
export function registerInspectionTool(ctx: Context, config: InspectionConfig): void {
  ctx.tools.guard((exec) => {
    if (exec.agent === undefined) return undefined
    const registry = ctx.get('sessionProjections')
    const selected = registry?.stateOf(exec.agent.session, 'workshopInspection')
    if (selected?.target === undefined || selected.target === null) return undefined
    if (['aipm_inspect', 'aipm_delivery', 'present', 'todo_write', 'skill'].includes(exec.name)) return undefined
    const args = exec.arguments
    if (typeof args === 'object' && args !== null && 'action' in args) {
      if (exec.name === 'aipm_stage' && (args.action === 'get' || args.action === 'init' || args.action === 'update')) return undefined
      if (exec.name === 'aipm_document' && args.action === 'get') return undefined
    }
    return '本轮是只读源码分析，请使用 aipm_inspect 读取证据和保存报告，不运行命令、改代码或调用外部工具。'
  })
  ctx.tools.register(defineTool({
    name: 'aipm_inspect',
    description: 'Inspect only the repository selected in Workshop. scan returns a bounded file inventory; read returns real source lines and an evidenceId. '
      + 'Start from entry points and follow actual calls, routes, state and tests; keyword matches or missing matches do not prove implementation or absence. '
      + 'save writes only the requested reverse PRD or gap report to the separate current workbench project. Initialize that report project first. '
      + 'Cite evidenceIds from read; code-observed claims require implementation evidence, requirement gaps require both selected requirements and code. '
      + 'Do not use shell or ordinary file tools to bypass this reader. Do not run code, tests or network research; never modify inspected sources.',
    parameters: {
      action: { type: 'string', required: true, enum: ['scan', 'read', 'save'] },
      path: { type: 'string', description: 'read: project-relative path from scan; no absolute paths or parent traversal.' },
      startLine: { type: 'integer', description: 'read: one-based start line, default 1.' },
      lineCount: { type: 'integer', description: 'read: number of lines; defaults to the configured page size of ' + String(config.maxReadLines) + '. Keep excerpts focused.' },
      title: { type: 'string', description: 'save: user-facing report title.' },
      summary: { type: 'string', description: 'save: concise evidence-based product summary or gap overview.' },
      findings: { type: 'array', description: 'save: structured claims, grouped into meaningful PRD sections or gap categories.',
        items: { type: 'object', additionalProperties: false, properties: {
          section: { type: 'string', required: true }, title: { type: 'string', required: true }, detail: { type: 'string', required: true },
          status: { type: 'string', required: true, description: 'reverse: implemented/inferred/unknown only; gaps: requirement-gap/recommendation/unverified only. Mention already met requirements in the summary.', enum: ['implemented', 'inferred', 'unknown', 'requirement-gap', 'recommendation', 'unverified'] },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
          suggestion: { type: 'string' }, acceptance: { type: 'array', items: { type: 'string' }, description: 'Suggested acceptance criteria, never claimed as executed tests.' },
          evidenceIds: { type: 'array', required: true, items: { type: 'string' } },
        } } },
      limitations: { type: 'array', items: { type: 'string' }, description: 'save: unread areas, missing requirements and open questions.' },
    },
    output: { schema: { type: 'object', additionalProperties: false, properties: {
      summary: { type: 'string', required: true }, data: { type: 'string', required: true },
    } }, render: (_args, value) => [{ type: 'text', text: value.summary + '\n' + value.data }] },
    async execute(args, exec) {
      const session = exec.agent?.session
      if (session === undefined) throw new Error('分析需要当前工作台会话。')
      exec.signal.throwIfAborted()
      const state = stateFor(ctx, session)
      const target = state.target
      if (target === null) throw new Error('缺少代码目录。')
      if (await realpath(target.sourceRoot) !== target.sourceRoot) throw new Error('代码目录已变化，请重新选择。')
      if (args.action === 'scan') {
        const files: { path: string; bytes: number }[] = []
        let skipped = 0; let truncated = false; let visited = 0; let stopped = false
        const visit = async (path: string, depth: number): Promise<void> => {
          exec.signal.throwIfAborted()
          const entries = await readdir(join(target.sourceRoot, path), { withFileTypes: true })
          for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
            if (++visited > config.maxEntries) { truncated = true; stopped = true; return }
            const child = path ? path + '/' + entry.name : entry.name
            if (entry.name.startsWith('.') || SKIP.has(entry.name) || /^(credentials?|secrets?|tokens?|passwords?)$/i.test(entry.name) || entry.isSymbolicLink()) { skipped++; continue }
            if (entry.isDirectory()) {
              if (depth >= config.maxDepth) { skipped++; truncated = true; continue }
              await visit(child, depth + 1)
            } else if (entry.isFile() && allowed(child)) {
              const info = await lstat(join(target.sourceRoot, child))
              if (info.size > config.maxFileBytes) { skipped++; continue }
              const item = { path: child, bytes: info.size }
              const next = { files: [...files, item], skipped, truncated }
              if (files.length >= config.maxFiles || Buffer.byteLength(JSON.stringify(next)) > config.maxIndexBytes) {
                truncated = true; stopped = true; return
              }
              files.push(item)
            } else skipped++
            if (stopped || files.length >= config.maxFiles) { truncated = true; stopped = true; return }
          }
        }
        await visit('', 0)
        const scan = { files, skipped, truncated }
        if (Buffer.byteLength(JSON.stringify(scan)) > config.maxIndexBytes) throw new Error('目录索引超限，请选择更小的代码目录。')
        if (stateFor(ctx, session).target !== target) throw new Error('分析目标已变化，请重新开始。')
        session.append('workshop/inspection-scan', scan)
        return { summary: `已列出 ${files.length} 个候选文件；不代表全项目已覆盖，请检查截断标记。`,
          data: JSON.stringify({ sourceRoot: target.sourceRoot, task: target.task, baselinePath: target.baselinePath ?? null, ...scan }) }
      }
      if (state.scan === null) throw new Error('先 scan，再按索引读取源码。')
      if (args.action === 'read') {
        const startLine = args.startLine ?? 1
        const lineCount = args.lineCount ?? config.maxReadLines
        if (args.path === undefined || !Number.isSafeInteger(startLine) || startLine < 1 || !Number.isSafeInteger(lineCount)
          || lineCount < 1 || lineCount > config.maxReadLines) throw new Error('请提供有效行号与受限行数。')
        if (!state.scan.files.some(file => file.path === args.path) && args.path !== target.baselinePath) throw new Error('只读取索引或用户指定的需求文件。')
        const bytes = await sourceFile(target.sourceRoot, args.path, config)
        const lines = sourceText(bytes).split(/\r?\n/)
        if (startLine > lines.length) throw new Error('起始行超出文件范围。')
        const text = lines.slice(startLine - 1, startLine - 1 + lineCount).join('\n')
        const evidence: InspectionEvidence = { id: randomUUID(), path: args.path, fileHash: hash(bytes), startLine,
          endLine: Math.min(lines.length, startLine - 1 + lineCount), text,
          kind: args.path === target.baselinePath ? 'requirement'
            : CODE.has(extname(args.path).toLowerCase())
              && !/(^|\/)(__tests__|tests?|fixtures?|examples?|docs?)(\/|$)|\.(spec|test)\./i.test(args.path)
              ? 'code' : 'documentation' }
        if (Buffer.byteLength(JSON.stringify([...state.evidence, evidence])) > config.maxEvidenceBytes) throw new Error('证据读取已达上限，请基于已读内容完成或缩小范围重试。')
        exec.signal.throwIfAborted()
        if (stateFor(ctx, session).target !== target) throw new Error('分析目标已变化，请重新读取。')
        session.append('workshop/inspection-evidence', evidence)
        return { summary: `已读取 ${args.path}:${evidence.startLine}-${evidence.endLine}`, data: JSON.stringify({ evidenceId: evidence.id,
          kind: evidence.kind, path: evidence.path, fileHash: evidence.fileHash, totalLines: lines.length,
          lines: text.split('\n').map((line, index) => ({ line: evidence.startLine + index, text: line })) }) }
      }
      if (!args.title?.trim() || !args.summary?.trim() || !args.findings?.length) throw new Error('报告须有标题、总述和分析条目。')
      const findings = args.findings
      const refs = new Map<string, InspectionEvidence>()
      for (const item of findings) {
        if (!item.section.trim() || !item.title.trim() || !item.detail.trim()) throw new Error('分析条目不能为空。')
        const evidence = item.evidenceIds.map((id) => {
          const found = state.evidence.find(row => row.id === id)
          if (found === undefined) throw new Error('引用了尚未读取的证据。')
          refs.set(id, found); return found
        })
        if (target.task === 'reverse' && !['implemented', 'inferred', 'unknown'].includes(item.status)
          || target.task === 'gaps' && !['requirement-gap', 'recommendation', 'unverified'].includes(item.status)) throw new Error('条目状态与本轮任务不一致。')
        if (item.status === 'implemented' && !evidence.some(row => row.kind === 'code')) throw new Error('代码可见的功能必须引用实现代码，文档或测试描述不能代替实现。')
        if (['inferred', 'recommendation'].includes(item.status) && evidence.length === 0) throw new Error('推断或建议须附已读依据。')
        if (item.status === 'requirement-gap' && (!evidence.some(row => row.kind === 'requirement') || !evidence.some(row => row.kind === 'code'))) {
          throw new Error('需求差异须同时引用用户选定需求和实现代码；无需求依据时请标为工程建议或待验证。')
        }
      }
      for (const evidence of refs.values()) {
        if (hash(await sourceFile(target.sourceRoot, evidence.path, config)) !== evidence.fileHash) throw new Error('引用源码已变化，请重新读取后再保存。')
      }
      const destination = session.header.cwd
      if (destination === undefined || inside(target.sourceRoot, await realpath(destination))) throw new Error('结果须保存到源码之外的独立工作台项目。')
      const labels = { implemented: '代码可见，未运行验证', inferred: '推断，待确认', unknown: '待确认',
        'requirement-gap': '需求差异，待复核', recommendation: '工程建议', unverified: '待验证' }
      const ids = [...refs.keys()]
      const sections = [...new Set(findings.map(item => item.section))]
      const code = [...new Set(state.evidence.filter(row => row.kind === 'code').map(row => row.path))].length
      const markdown = ['# ' + args.title.trim(), '', args.summary.trim(), '',
        `源码目录：${target.sourceRoot}`, `分析范围：索引 ${state.scan.files.length} 个文件，读取 ${new Set(state.evidence.map(row => row.path)).size} 个文件（实现代码 ${code} 个）。`,
        state.scan.truncated ? '目录扫描已截断，结论仅覆盖已读取范围。' : '仅分析列明证据，未读取文件不视为已覆盖。',
        '本报告基于静态源码。未运行项目或测试；代码可见不等于功能已验收。建议和推断不表示用户已确认，搜索未命中不能证明功能不存在。', '',
        ...sections.flatMap(section => ['## ' + section, '', ...findings.filter(item => item.section === section).flatMap(item => [
          '### ' + item.title, '', `状态：${labels[item.status]}${item.priority === undefined ? '' : '；优先级：' + { high: '高', medium: '中', low: '低' }[item.priority]}`,
          '', item.detail, '', ...item.suggestion ? ['建议：' + item.suggestion, ''] : [],
          ...item.acceptance?.length ? ['验收建议（尚未执行）：', '', ...item.acceptance.map(line => '- ' + line), ''] : [],
          '依据：' + (item.evidenceIds.length ? item.evidenceIds.map(id => '[E' + String(ids.indexOf(id) + 1) + ']').join('、') : '无充分证据，保留待确认。'), '',
        ])]), '## 证据索引', '', ...ids.flatMap((id, index) => {
          const row = refs.get(id)
          if (row === undefined) throw new Error('Missing evidence')
          return [`- E${index + 1} · ${row.path}:${row.startLine}-${row.endLine}（${{ code: '实现代码', requirement: '选定需求', documentation: '文档材料' }[row.kind]}）`]
        }), '', '## 范围限制与待确认', '', ...args.limitations?.length ? args.limitations.map(line => '- ' + line) : ['- 未确认信息需与项目负责人核对。'], '',
      ].join('\n')
      if (Buffer.byteLength(markdown) > config.maxReportBytes) throw new Error('报告超过大小限制，请精简条目和引用范围。')
      exec.signal.throwIfAborted()
      if (stateFor(ctx, session).target !== target) throw new Error('分析目标已变化，请重新开始。')
      const [document] = await saveProjectDocuments(destination, [{ title: args.title.trim(), kind: target.task === 'reverse' ? 'prd' : 'review',
        fileName: target.task === 'reverse' ? '反推PRD.md' : '项目差距报告.md', content: markdown, expectedVersion: 0,
        change: target.task === 'reverse' ? '从已读源码反推需求' : '检查已读源码中的差距', source: 'conversation', sessionId: session.id }])
      const revision = document?.revisions.at(-1)
      if (revision === undefined) throw new Error('报告尚未保存。')
      return { summary: '分析报告已单独保存，源码未修改。', data: JSON.stringify({ documentId: document?.id, paths: [revision.path], version: revision.version }) }
    },
  }))
}
