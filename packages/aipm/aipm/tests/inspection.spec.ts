/** Repository analysis stays read-only and accepts only hash-checked file/line evidence. */
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import ProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { ToolCallId, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionRequestId } from '@deepseek-ai/dsh-api-session-controller/types'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { afterEach, describe, expect, it } from 'vitest'
import { installInspectionProjection, prepareInspectionTarget } from '../../../api/session-controller/src/inspection-context.ts'
import { initProject } from '../src/store.ts'
import { readProjectDocuments } from '../src/documents.ts'
import * as Aipm from '../src/index.ts'

const roots: string[] = []; const contexts: Context[] = []
const limits = { maxFiles: 30, maxEntries: 100, maxDepth: 5, maxFileBytes: 20000, maxReadLines: 40,
  maxIndexBytes: 10000, maxEvidenceBytes: 20000, maxReportBytes: 40000 }
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
async function setup(task: 'reverse' | 'gaps' = 'reverse', baseline = false, overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), 'aipm-inspection-')); roots.push(root)
  const source = join(root, 'source'); const output = join(root, 'reports')
  await mkdir(join(source, 'requirements'), { recursive: true }); await mkdir(output)
  await mkdir(join(source, 'node_modules')); await writeFile(join(source, 'node_modules/ignore.ts'), 'not source')
  await writeFile(join(source, 'app.ts'), 'export function record(confirm: boolean) {\n  return save();\n}\n')
  await writeFile(join(source, 'requirements/PRD.md'), '# Requirements\nOnly save after confirmation.\n')
  await writeFile(join(source, '.env'), 'API_KEY=private')
  await writeFile(join(source, 'leaky.ts'), 'const key="ghp_abcdefghijklmnopqrstuvwxyz0123456789"')
  await symlink(join(source, 'app.ts'), join(source, 'link.ts'))
  const config = { review: { maxInputBytes: 10000, maxOutputTokens: 1000, timeoutMs: 1000 }, inspection: { ...limits, ...overrides } }
  const file = join(root, 'cordis.yml')
  await writeFile(file, '- name: cordis:prompt\n- name: cordis:tools\n- name: cordis:sessions\n- name: cordis:projection\n- name: cordis:aipm\n  config: ' + JSON.stringify(config) + '\n')
  const ctx = new Context(); contexts.push(ctx); ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  Object.assign(ctx.loader.builtins, { include: Include, prompt: SystemPrompt, tools: ToolRuntime, sessions: SessionStore,
    projection: ProjectionRegistry, aipm: Aipm })
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(file).href } }); await ctx.loader.await()
  installInspectionProjection(ctx)
  await initProject(output, { name: '代码分析', summary: '' })
  const session = ctx.sessions.create(SessionId('analysis'), { meta: { cwd: output } })
  const target = await prepareInspectionTarget(session, { mode: task, output: 'prd', inspection: { sourcePath: source,
    ...baseline ? { baselinePath: 'requirements/PRD.md' } : {} } })
  if (target === undefined) throw new Error('Missing inspection target')
  session.append('workshop/inspection-start', target)
  const agent = { id: session.id, session } as Agent
  let call = 0
  const raw = (args: object) => ctx.tools.execute({ callId: ToolCallId('inspect-' + String(call++)), name: 'aipm_inspect',
    arguments: args, agent, signal: new AbortController().signal })
  const run = async (args: object): Promise<Record<string, unknown>> => {
    const result = await raw(args); expect(result.isError, JSON.stringify(result.content)).toBe(false)
    const text = result.content.filter(block => block.type === 'text').map(block => block.text).join('')
    return JSON.parse(text.slice(text.indexOf('\n') + 1)) as Record<string, unknown>
  }
  return { ctx, source, output, session, raw, run, target }
}
function finding(status: string, evidenceIds: string[]) {
  return { section: '功能与规则', title: '保存记录', detail: '函数不检查确认参数就调用保存。', status, evidenceIds,
    suggestion: '保存前检查确认状态。', acceptance: ['取消时不得保存（待执行）。'] }
}

describe('repository evidence and reports', () => {
  it('loads through cordis.yml, skips hidden/dependency/link paths and saves a separate PRD with real lines', async () => {
    const f = await setup(); const before = await readFile(join(f.source, 'app.ts'), 'utf8')
    const scan = await f.run({ action: 'scan' })
    const paths = (scan.files as { path: string }[]).map(row => row.path)
    expect(paths).toContain('app.ts'); expect(paths).not.toContain('.env'); expect(paths).not.toContain('link.ts')
    expect(paths.some(path => path.startsWith('node_modules'))).toBe(false)
    const evidence = await f.run({ action: 'read', path: 'app.ts', startLine: 1, lineCount: 3 })
    expect((await f.run({ action: 'read', path: 'requirements/PRD.md' })).totalLines).toBeGreaterThan(0)
    expect(evidence.lines).toEqual([{ line: 1, text: 'export function record(confirm: boolean) {' }, { line: 2, text: '  return save();' }, { line: 3, text: '}' }])
    const result = await f.run({ action: 'save', title: '反推需求', summary: '从保存逻辑整理需求。',
      findings: [finding('implemented', [String(evidence.evidenceId)])], limitations: ['用户定位待确认。'] })
    const path = (result.paths as string[])[0]!
    const text = await readFile(join(f.output, path), 'utf8')
    expect(text).toContain('app.ts:1-3'); expect(text).toContain('代码可见，未运行验证'); expect(text).toContain('用户定位待确认')
    expect((await readProjectDocuments(f.output)).documents[0]?.kind).toBe('prd')
    expect(await readFile(join(f.source, 'app.ts'), 'utf8')).toBe(before)
    expect(f.ctx.sessionProjections.stateOf(f.session, 'workshopInspection')?.evidence).toHaveLength(2)
  })

  it('requires both chosen requirements and implementation evidence for a requirement difference', async () => {
    const f = await setup('gaps', true); await f.run({ action: 'scan' })
    const code = await f.run({ action: 'read', path: 'app.ts', startLine: 1, lineCount: 3 })
    const req = await f.run({ action: 'read', path: 'requirements/PRD.md', startLine: 1, lineCount: 2 })
    const request = { action: 'save', title: '差距', summary: '确认规则与实现有差异。' }
    expect((await f.raw({ ...request, findings: [finding('requirement-gap', [String(code.evidenceId)])] })).isError).toBe(true)
    await f.run({ ...request, findings: [finding('requirement-gap', [String(code.evidenceId), String(req.evidenceId)])] })
    expect((await readProjectDocuments(f.output)).documents[0]?.kind).toBe('review')
  })

  it('keeps unselected documentation from becoming a requirement and refuses fabricated or stale citations', async () => {
    const f = await setup('gaps'); await f.run({ action: 'scan' })
    const req = await f.run({ action: 'read', path: 'requirements/PRD.md', startLine: 1, lineCount: 2 })
    expect(req.kind).toBe('documentation')
    const request = { action: 'save', title: '差距', summary: '静态分析' }
    expect((await f.raw({ ...request, findings: [finding('requirement-gap', [String(req.evidenceId)])] })).isError).toBe(true)
    expect((await f.raw({ ...request, findings: [finding('recommendation', ['fabricated'])] })).isError).toBe(true)
    const code = await f.run({ action: 'read', path: 'app.ts', startLine: 1, lineCount: 3 })
    await writeFile(join(f.source, 'app.ts'), 'changed')
    expect((await f.raw({ ...request, findings: [finding('recommendation', [String(code.evidenceId)])] })).isError).toBe(true)
    expect((await readProjectDocuments(f.output)).documents).toHaveLength(0)
  })

  it('rejects traversal, credentials, symlinks, arbitrary roots and excessive reads', async () => {
    const f = await setup(); await f.run({ action: 'scan' })
    for (const path of ['../outside.ts', '.env', 'link.ts', '/etc/passwd', 'leaky.ts']) {
      expect((await f.raw({ action: 'read', path, startLine: 1, lineCount: 2 })).isError, path).toBe(true)
    }
    expect((await f.raw({ action: 'read', path: 'app.ts', startLine: 0, lineCount: 3 })).isError).toBe(true)
    expect((await f.raw({ action: 'read', path: 'app.ts', startLine: 1, lineCount: 10000 })).isError).toBe(true)
    await expect(prepareInspectionTarget(f.session, { mode: 'reverse', output: 'prd', inspection: { sourcePath: f.output } })).rejects.toThrow()
    await expect(prepareInspectionTarget(f.session, { mode: 'gaps', output: 'prd', inspection: { sourcePath: f.source, baselinePath: '../PRD.md' } })).rejects.toThrow()
  })

  it('exposes truncated scans, bounds total evidence and refuses missing targets', async () => {
    const f = await setup('reverse', false, { maxFiles: 1, maxEvidenceBytes: 1 })
    expect((await f.run({ action: 'scan' })).truncated).toBe(true)
    expect((await f.raw({ action: 'read', path: 'app.ts', startLine: 1, lineCount: 3 })).isError).toBe(true)
    const other = f.ctx.sessions.create(SessionId('no-selection'), { meta: { cwd: f.output } })
    const result = await f.ctx.tools.execute({ callId: ToolCallId('unscoped'), name: 'aipm_inspect', arguments: { action: 'scan' },
      agent: { id: other.id, session: other } as Agent, signal: new AbortController().signal })
    expect(result.isError).toBe(true)
  })

  it('blocks direct mutating tools during inspection and releases the guard for a later human task', async () => {
    const f = await setup()
    let called = false
    f.ctx.tools.register(defineTool({ name: 'write-source', description: 'mutation fixture', parameters: {},
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      execute: () => { called = true; return Promise.resolve('changed') } }))
    const execute = () => f.ctx.tools.execute({ callId: ToolCallId('guarded-write'), name: 'write-source', arguments: {},
      agent: { id: f.session.id, session: f.session } as Agent, signal: new AbortController().signal })
    expect((await execute()).isError).toBe(true); expect(called).toBe(false)
    f.session.append('workshop/inspection-start', { ...f.target, requestId: 'first' })
    f.session.append('user/message', createUserMessage({ source: { kind: 'user', rpcId: 'next' as SessionRequestId },
      content: [{ type: 'text', text: 'A separate next task' }] }), { surfaceOp: 'append' })
    expect((await execute()).isError).toBe(false); expect(called).toBe(true)
  })

  it('resets evidence on a newly selected target and does not accept tests as implementation', async () => {
    const f = await setup(); await f.run({ action: 'scan' })
    const doc = await f.run({ action: 'read', path: 'requirements/PRD.md', startLine: 1, lineCount: 2 })
    expect((await f.raw({ action: 'save', title: 'PRD', summary: '静态结果', findings: [finding('implemented', [String(doc.evidenceId)])] })).isError).toBe(true)
    f.session.append('workshop/inspection-start', f.target)
    expect(f.ctx.sessionProjections.stateOf(f.session, 'workshopInspection')?.evidence).toHaveLength(0)
    expect((await f.raw({ action: 'save', title: 'PRD', summary: '静态结果', findings: [finding('inferred', [String(doc.evidenceId)])] })).isError).toBe(true)
  })
})
