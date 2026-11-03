/** Real Loader composition for selected-document analysis and development handoff. */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
import type { Agent } from '@deepseek-ai/dsh-agent'
import { unzipSync, strFromU8 } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'
import { installDeliveryProjection, prepareDelivery } from '../../../api/session-controller/src/delivery-context.ts'
import { installInspectionProjection } from '../../../api/session-controller/src/inspection-context.ts'
import { initProject } from '../src/store.ts'
import { readProjectDocuments, saveProjectDocuments } from '../src/documents.ts'
import * as Aipm from '../src/index.ts'

const roots: string[] = []; const contexts: Context[] = []
const limits = { maxFiles: 20, maxFileBytes: 40000, maxInputBytes: 60000, maxReportBytes: 60000,
  maxArchiveBytes: 120000, maxArchiveInputBytes: 100000 }
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
async function setup(task: 'impact' | 'handoff' = 'impact', overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), 'aipm-delivery-')); roots.push(root)
  const inspection = { maxFiles: 20, maxEntries: 100, maxDepth: 5, maxFileBytes: 40000, maxReadLines: 40,
    maxIndexBytes: 10000, maxEvidenceBytes: 20000, maxReportBytes: 60000 }
  const config = { inspection,
    review: { maxInputBytes: 10000, maxOutputTokens: 1000, timeoutMs: 1000 }, delivery: { ...limits, ...overrides } }
  const file = join(root, 'cordis.yml')
  await writeFile(file, '- name: cordis:prompt\n- name: cordis:tools\n- name: cordis:sessions\n- name: cordis:projection\n- name: cordis:aipm\n  config: ' + JSON.stringify(config) + '\n')
  const ctx = new Context(); contexts.push(ctx); ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  Object.assign(ctx.loader.builtins, { include: Include, prompt: SystemPrompt, tools: ToolRuntime, sessions: SessionStore,
    projection: ProjectionRegistry, aipm: Aipm })
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(file).href } }); await ctx.loader.await()
  installDeliveryProjection(ctx); installInspectionProjection(ctx)
  await initProject(root, { name: '共享账本', summary: '简单记账。' })
  const saved = await saveProjectDocuments(root, [
    { title: '需求', fileName: 'PRD.md', kind: 'prd', content: '# 需求\n每人只能读取自己的账目。\n', expectedVersion: 0, change: '初版', source: 'conversation' },
    { title: '方案', fileName: 'PRD.md', kind: 'plan', content: '# 方案\n按 ownerId 查询账目。\n', expectedVersion: 0, change: '初版', source: 'conversation' },
    { title: '内部材料', fileName: 'ignore.json', kind: 'other', content: '{"secret":true}', expectedVersion: 0, change: '内部', source: 'conversation' },
  ])
  const session = ctx.sessions.create(SessionId('delivery'), { meta: { cwd: root } })
  const selection = { requestId: 'task-1', task, request: task === 'impact' ? '增加多人共享记账。' : '先开发核心流程。',
    documents: saved.slice(0, 2).map(row => ({ id: row.id, version: 1 })) }
  session.append('workshop/delivery-start', selection)
  const agent = { id: session.id, session } as Agent
  let call = 0
  const raw = (args: object, name = 'aipm_delivery', signal = new AbortController().signal) => ctx.tools.execute({
    callId: ToolCallId('delivery-' + String(call++)), name, arguments: args, agent, signal })
  const run = async (args: object) => {
    const result = await raw(args); expect(result.isError, JSON.stringify(result.content)).toBe(false)
    const text = result.content.filter(block => block.type === 'text').map(block => block.text).join('')
    return JSON.parse(text.slice(text.indexOf('\n') + 1)) as { paths: string[]; documents: { id: string; text?: string }[] }
  }
  return { ctx, root, saved, session, selection, raw, run }
}
function item(documentId: string, extra = {}) {
  return { area: 'permission', title: '共享可见性', impact: '原先仅本人可见，需要确认共享范围。', action: '补充共享成员和权限。',
    certainty: 'supported', priority: 'high', references: [{ documentId, quote: '每人只能读取自己的账目。' }],
    testCases: ['非成员无法读取共享账目（待验证）。'], ...extra }
}

describe('selected-document delivery', () => {
  it('records exact input hashes, validates quotes, and saves a separate advisory impact report', async () => {
    const f = await setup(); const before = await readFile(join(f.root, f.saved[0]!.revisions[0]!.path))
    const input = await f.run({ action: 'get' })
    expect(input.documents[0]?.text).toContain('每人只能读取')
    expect(f.ctx.sessionProjections.stateOf(f.session, 'workshopDelivery')?.snapshot?.documents).toHaveLength(2)
    const result = await f.run({ action: 'impact', summary: '共享影响权限和查询。', items: [item(f.saved[0]!.id)], questions: ['谁能邀请成员？'] })
    const text = await readFile(join(f.root, result.paths[0]!), 'utf8')
    expect(text).toContain('需求 V1'); expect(text).toContain('谁能邀请成员'); expect(text).toContain('尚未执行')
    expect(await readFile(join(f.root, f.saved[0]!.revisions[0]!.path))).toEqual(before)
    expect((await readProjectDocuments(f.root)).documents).toHaveLength(4)
  })
  it('requires loading first and rejects fabricated quotes, unobserved code and wrong actions', async () => {
    const f = await setup()
    expect((await f.raw({ action: 'impact', summary: 's', items: [item(f.saved[0]!.id)] })).isError).toBe(true)
    await f.run({ action: 'get' })
    for (const entry of [item(f.saved[0]!.id, { references: [{ documentId: f.saved[0]!.id, quote: '虚构原句' }] }),
      item(f.saved[0]!.id, { area: 'code' }), item(f.saved[0]!.id, { evidenceIds: ['fabricated'] })]) {
      expect((await f.raw({ action: 'impact', summary: 's', items: [entry] })).isError).toBe(true)
    }
    expect((await f.raw({ action: 'package' })).isError).toBe(true)
    expect((await readProjectDocuments(f.root)).documents).toHaveLength(3)
  })
  it('rejects a newer revision or modified bytes after input loading', async () => {
    const f = await setup('handoff'); await f.run({ action: 'get' })
    await writeFile(join(f.root, f.saved[0]!.revisions[0]!.path), 'modified')
    expect((await f.raw({ action: 'package' })).isError).toBe(true)
    await f.run({ action: 'get' })
    await saveProjectDocuments(f.root, [{ id: f.saved[0]!.id, title: '需求', kind: 'prd', fileName: 'PRD.md', content: 'V2',
      expectedVersion: 1, change: '修改', source: 'conversation' }])
    expect((await f.raw({ action: 'package' })).isError).toBe(true)
  })
  it('packages only selected bytes with unique flat names and human-readable instructions', async () => {
    const f = await setup('handoff'); const input = await f.run({ action: 'get' })
    expect(input.documents.every(row => row.text === undefined)).toBe(true)
    const result = await f.run({ action: 'package' })
    const archive = unzipSync(await readFile(join(f.root, result.paths[0]!)))
    expect(Object.keys(archive).sort()).toEqual(['PRD-2.md', 'PRD.md', '交接清单.md', '给编程AI的开发说明.md'].sort())
    expect(archive['PRD.md']).toEqual(new Uint8Array(await readFile(join(f.root, f.saved[0]!.revisions[0]!.path))))
    expect(archive['PRD-2.md']).toEqual(new Uint8Array(await readFile(join(f.root, f.saved[1]!.revisions[0]!.path))))
    expect(strFromU8(archive['交接清单.md']!)).toContain('需求 V1')
    expect(strFromU8(archive['给编程AI的开发说明.md']!)).toContain('目标代码目录')
    expect((await readProjectDocuments(f.root)).documents.filter(row => row.kind === 'prd')[0]?.revisions).toHaveLength(1)
  })
  it('records missing plan and escapes reserved or colliding archive filenames', async () => {
    const f = await setup('handoff')
    const docs = await saveProjectDocuments(f.root, [{ title: '补充', kind: 'other', fileName: '交接清单.md', content: '用户清单',
      expectedVersion: 0, change: '补充', source: 'conversation' }, { title: '图片', kind: 'other', fileName: 'CON.png',
      content: new Uint8Array([137, 80, 78, 71, 0, 1]), expectedVersion: 0, change: '补充', source: 'conversation' }])
    f.session.append('workshop/delivery-start', { ...f.selection, documents: [...f.selection.documents.slice(0, 1), ...docs.map(row => ({ id: row.id, version: 1 }))] })
    await f.run({ action: 'get' }); const result = await f.run({ action: 'package' })
    const archive = unzipSync(await readFile(join(f.root, result.paths[0]!)))
    expect(Object.keys(archive)).toContain('交接清单-2.md'); expect(Object.keys(archive)).toContain('文档-CON.png')
    expect(strFromU8(archive['交接清单.md']!)).toContain('未选择技术方案')
    expect(archive['文档-CON.png']).toEqual(new Uint8Array([137, 80, 78, 71, 0, 1]))
  })
  it.each([{ maxFiles: 1 }, { maxFileBytes: 2 }, { maxInputBytes: 2 }, { maxArchiveInputBytes: 2 }])('enforces input limits %j', async (overrides) => {
    const f = await setup('handoff', overrides); expect((await f.raw({ action: 'get' })).isError).toBe(true)
  })
  it('enforces archive size without publishing a document', async () => {
    const f = await setup('handoff', { maxArchiveBytes: 2 }); await f.run({ action: 'get' })
    expect((await f.raw({ action: 'package' })).isError).toBe(true)
    expect((await readProjectDocuments(f.root)).documents).toHaveLength(3)
  })
  it('rejects internal JSON and recognizable credentials before returning content', async () => {
    const f = await setup('handoff')
    f.session.append('workshop/delivery-start', { ...f.selection, documents: [{ id: f.saved[2]!.id, version: 1 }] })
    expect((await f.raw({ action: 'get' })).isError).toBe(true)
    f.session.append('workshop/delivery-start', f.selection)
    await writeFile(join(f.root, f.saved[0]!.revisions[0]!.path), 'key="ghp_abcdefghijklmnopqrstuvwxyz0123456789"')
    expect((await f.raw({ action: 'get' })).isError).toBe(true)
  })
  it('blocks mutating tools during selection and releases on the next human task', async () => {
    const f = await setup()
    f.ctx.tools.register(defineTool({ name: 'test_mutate', description: 'test', parameters: {},
      output: { schema: { type: 'object', additionalProperties: false, properties: { value: { type: 'boolean', required: true } } }, render: () => [] },
      execute: async () => ({ value: true }) }))
    expect((await f.raw({}, 'test_mutate')).isError).toBe(true)
    expect((await f.raw({ action: 'save' }, 'aipm_document')).isError).toBe(true)
    f.session.append('user/message', createUserMessage({ content: [{ type: 'text', text: '下一轮修改' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
    expect((await f.raw({}, 'test_mutate')).isError).not.toBe(true)
    expect((await f.raw({ action: 'get' })).isError).toBe(true)
  })
  it('does not publish on cancellation and requires an explicit nonempty admission selection', async () => {
    const f = await setup('handoff'); await f.run({ action: 'get' })
    const controller = new AbortController(); controller.abort()
    expect((await f.raw({ action: 'package' }, 'aipm_delivery', controller.signal)).isError).toBe(true)
    await expect(prepareDelivery(f.session, { mode: 'handoff', output: 'prd', delivery: { documents: [] } }, 'task', '交接'))
      .rejects.toMatchObject({ code: 'gateway/bad-request' })
    expect((await readProjectDocuments(f.root)).documents).toHaveLength(3)
  })
  it('binds code impacts to the selected source and refuses stale read evidence', async () => {
    const f = await setup()
    const source = join(f.root, 'source'); await mkdir(source)
    await writeFile(join(source, 'app.ts'), 'export function list(ownerId) { return db.find({ ownerId }); }')
    const target = await prepareDelivery(f.session, { mode: 'impact', output: 'prd', delivery: {
      documents: f.selection.documents, sourcePath: source } }, 'task-1', '增加共享记账')
    if (target?.inspection === undefined) throw new Error('Missing source selection')
    f.session.append('workshop/delivery-start', target.selection)
    f.session.append('workshop/inspection-start', target.inspection)
    await f.run({ action: 'get' })
    expect((await f.raw({ action: 'impact', summary: 's', items: [item(f.saved[0]!.id)] })).isError).toBe(true)
    expect((await f.raw({ action: 'scan' }, 'aipm_inspect')).isError).not.toBe(true)
    const read = await f.raw({ action: 'read', path: 'app.ts' }, 'aipm_inspect')
    expect(read.isError).not.toBe(true)
    const evidence = f.ctx.sessionProjections.stateOf(f.session, 'workshopInspection')?.evidence[0]
    if (evidence === undefined) throw new Error('Missing read evidence')
    const request = { action: 'impact', summary: '查询范围要支持共享成员。',
      items: [item(f.saved[0]!.id, { area: 'code', evidenceIds: [evidence.id] })] }
    expect((await f.raw({ action: 'save' }, 'aipm_inspect')).isError).toBe(true)
    await writeFile(join(source, 'app.ts'), 'export function list() { return db.all(); }')
    expect((await f.raw(request)).isError).toBe(true)
    const current = await f.raw({ action: 'read', path: 'app.ts' }, 'aipm_inspect')
    expect(current.isError).not.toBe(true)
    const latest = f.ctx.sessionProjections.stateOf(f.session, 'workshopInspection')?.evidence.at(-1)
    const result = await f.run({ ...request, items: [item(f.saved[0]!.id, { area: 'code', evidenceIds: [latest?.id] })] })
    const report = await readFile(join(f.root, result.paths[0]!), 'utf8')
    expect(report).toContain('app.ts:1-1'); expect(report).toContain('已读代码片段')
    expect(await readFile(join(source, 'app.ts'), 'utf8')).toBe('export function list() { return db.all(); }')
  })

})
