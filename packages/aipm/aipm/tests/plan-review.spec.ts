/** Independent review requests and reports preserve exact plan revisions across entry points. */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { LlmAdapter, ToolCallId, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { afterEach, describe, expect, it } from 'vitest'
import { initProject } from '../src/store.ts'
import { readProjectDocuments, saveProjectDocuments } from '../src/documents.ts'
import { reviewPlan } from '../src/plan-review.ts'
import * as Aipm from '../src/index.ts'
import { workshopProposal } from './fixtures/workshop-proposal.ts'

const contexts: Context[] = []
const roots: string[] = []
const config = { maxInputBytes: 120000, maxOutputTokens: 6000, timeoutMs: 1000 }
const report = JSON.stringify({ summary: '方案需要补充撤销流程。', findings: [
  { severity: 'high', location: '写入流程', problem: '没有撤销入口，误操作后无法恢复。', suggestion: '补充撤销与恢复规则。' },
], openQuestions: ['撤销支持多长时间？'] })
class Adapter extends LlmAdapter {
  requests: GenerateOptions[] = []
  constructor(private readonly response = report, private readonly finish: 'stop' | 'max-tokens' = 'stop') { super() }
  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    yield { type: 'text-delta', index: 0, text: this.response }
    yield { type: 'finish', reason: { kind: this.finish } }
  }
}
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
async function setup(response = report, finish: 'stop' | 'max-tokens' = 'stop') {
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(SessionStore)
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  const adapter = new Adapter(response, finish)
  ctx.llm.registerAdapter(['review-model'], adapter)
  const root = await mkdtemp(join(tmpdir(), 'aipm-review-')); roots.push(root)
  await initProject(root, { name: '审稿测试', summary: '' })
  const session = ctx.sessions.create(SessionId('review-test'), { meta: { cwd: root } })
  session.append('request/header', { header: { config: { provider: 'review-model', model: 'selected-model' } }, reason: 'initial' })
  const [plan] = await saveProjectDocuments(root, [{ title: '方案', kind: 'plan', fileName: '方案.md', content: '# 方案\n确认后写入。',
    expectedVersion: 0, change: '初稿', source: 'conversation' }])
  if (plan === undefined) throw new Error('Missing fixture plan')
  return { ctx, adapter, root, session, plan, signal: new AbortController().signal }
}

describe('independent technical-plan review', () => {
  it('logs exact inputs before dispatch, uses selected model without tools, and saves advisory findings separately', async () => {
    const f = await setup()
    await saveProjectDocuments(f.root, [{ title: '需求', kind: 'prd', fileName: 'PRD.md', content: '需要支持撤销。',
      expectedVersion: 0, change: '需求', source: 'conversation' }])
    let logged = false
    f.ctx.on('llm/stream', async function* (options, next) {
      logged = f.session.snapshotEvents().some(e => e.type === 'aipm/review-request')
      expect(options.tools).toBeUndefined()
      yield * next()
    })
    const before = await readFile(join(f.root, f.plan.revisions[0]!.path), 'utf8')
    const result = await reviewPlan(f.ctx, config, f.session, f.plan.id, 1, f.signal)
    expect(result.status).toBe('complete'); expect(logged).toBe(true)
    expect(f.adapter.requests).toHaveLength(1)
    expect(f.adapter.requests[0]).toMatchObject({ provider: 'review-model', model: 'selected-model', maxTokens: 6000 })
    const request = f.session.snapshotEvents().find(e => e.type === 'aipm/review-request')
    expect(JSON.stringify(request)).toContain('需要支持撤销')
    if (result.status !== 'complete') throw new Error('Expected review')
    expect(await readFile(join(f.root, result.path), 'utf8')).toContain('优先处理')
    expect(await readFile(join(f.root, f.plan.revisions[0]!.path), 'utf8')).toBe(before)
    expect((await readProjectDocuments(f.root)).documents.map(d => [d.kind, d.revisions.length])).toEqual([['plan', 1], ['prd', 1], ['review', 1]])
  })

  it.each([['not-json', 'stop'], [report, 'max-tokens']] as const)('keeps the plan and records incomplete output for %s', async (response, finish) => {
    const f = await setup(response, finish)
    expect(await reviewPlan(f.ctx, config, f.session, f.plan.id, 1, f.signal)).toMatchObject({ status: 'failed' })
    expect((await readProjectDocuments(f.root)).documents).toHaveLength(1)
    expect(f.session.snapshotEvents().find(e => e.type === 'aipm/review-result')?.data).toMatchObject({ status: 'failed' })
  })

  it('refuses stale targets, oversized prompts and cancellation before calling a model', async () => {
    const f = await setup()
    expect(await reviewPlan(f.ctx, config, f.session, f.plan.id, 2, f.signal)).toMatchObject({ status: 'failed' })
    expect(await reviewPlan(f.ctx, { ...config, maxInputBytes: 1 }, f.session, f.plan.id, 1, f.signal)).toMatchObject({ status: 'failed' })
    expect(await reviewPlan(f.ctx, config, f.session, f.plan.id, 1, AbortSignal.abort())).toMatchObject({ status: 'failed' })
    expect(f.adapter.requests).toHaveLength(0)
  })

  it('automatically reviews ordinary plan saves and allows explicit re-review without changing the plan', async () => {
    const f = await setup()
    const fiber = f.ctx.plugin(Aipm, { review: config }); await fiber
    const agent = { id: f.session.id, session: f.session } as Agent
    const save = await f.ctx.tools.execute({ callId: ToolCallId('plan-save'), name: 'aipm_document',
      arguments: { action: 'save', documentId: f.plan.id, title: '方案', kind: 'plan', fileName: '方案.md', content: '# V2\n写入并支持撤销。',
        expectedVersion: 1, change: '补充撤销' }, agent, signal: f.signal })
    expect(save.isError).toBe(false)
    expect(f.adapter.requests).toHaveLength(1)
    const manual = await f.ctx.tools.execute({ callId: ToolCallId('manual-review'), name: 'aipm_review',
      arguments: { documentId: f.plan.id, expectedVersion: 2 }, agent, signal: f.signal })
    expect(manual.isError).toBe(false)
    expect(f.adapter.requests).toHaveLength(2)
    const catalog = await readProjectDocuments(f.root)
    expect(catalog.documents.find(d => d.id === f.plan.id)?.revisions).toHaveLength(2)
    expect(catalog.documents.filter(d => d.kind === 'review')).toHaveLength(2)
    await fiber.dispose()
    expect(f.ctx.tools.get('aipm_review')).toBeUndefined()
  })

  it('stops a timed-out review and logs failure without publishing a report', async () => {
    const f = await setup()
    f.ctx.on('llm/stream', async function* (options) {
      const signal = options.signal
      if (signal === undefined) throw new Error('Missing review cancellation')
      await new Promise<void>((resolve) => {
        if (signal.aborted) resolve()
        else signal.addEventListener('abort', () => { resolve() }, { once: true })
      })
      yield { type: 'text-delta', index: 0, text: report }
    })
    expect(await reviewPlan(f.ctx, { ...config, timeoutMs: 5 }, f.session, f.plan.id, 1, f.signal)).toMatchObject({ status: 'failed' })
    expect((await readProjectDocuments(f.root)).documents).toHaveLength(1)
    expect(f.session.snapshotEvents().find(e => e.type === 'aipm/review-result')?.data).toMatchObject({ status: 'failed' })
  })

  it('does not review PRD-only saves and retains a plan when automatic review fails', async () => {
    const f = await setup('invalid')
    await f.ctx.plugin(Aipm, { review: config })
    const agent = { id: f.session.id, session: f.session } as Agent
    for (const kind of ['prd', 'plan'] as const) {
      const result = await f.ctx.tools.execute({ callId: ToolCallId('save-' + kind), name: 'aipm_document',
        arguments: { action: 'save', title: kind, kind, fileName: kind + '.md', content: '# ' + kind, expectedVersion: 0, change: '新建' },
        agent, signal: f.signal })
      expect(result.isError).toBe(false)
    }
    expect(f.adapter.requests).toHaveLength(1)
    expect((await readProjectDocuments(f.root)).documents.map(d => d.kind)).toEqual(['plan', 'prd', 'plan'])
  })
})


describe('review Loader composition', () => {
  it('loads policy from cordis.yml and automatically reviews a Workshop plan through the real tools', async () => {
    const root = await mkdtemp(join(tmpdir(), 'review-loader-')); roots.push(root)
    const file = join(root, 'cordis.yml')
    await writeFile(file, [
      '- name: cordis:prompt', '- name: cordis:tools', '- name: cordis:sessions', '- name: cordis:llm',
      '- name: cordis:aipm', '  config:', '    review:', '      maxInputBytes: 120000', '      maxOutputTokens: 6000', '      timeoutMs: 1000', '',
    ].join('\n'))
    const ctx = new Context(); contexts.push(ctx); ctx.baseUrl = pathToFileURL(root).href + '/'
    await ctx.plugin(Loader)
    Object.assign(ctx.loader.builtins, { include: Include, prompt: SystemPrompt, tools: ToolRuntime,
      sessions: SessionStore, llm: LlmRuntime, aipm: Aipm })
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(file).href } })
    await ctx.loader.await()
    const adapter = new Adapter(); ctx.llm.registerAdapter(['review-model'], adapter)
    await initProject(root, { name: 'Loader test', summary: '' })
    const session = ctx.sessions.create(SessionId('review-loader'), { meta: { cwd: root } })
    session.append('request/header', { header: { config: { provider: 'review-model', model: 'selected-model' } }, reason: 'initial' })
    const proposal = workshopProposal()
    const result = await ctx.tools.execute({ callId: ToolCallId('workshop-auto-review'), name: 'aipm_workshop',
      arguments: { action: 'save', proposal, deliverables: ['plan'], expectedVersion: 0,
        targets: [{ kind: 'plan', expectedVersion: 0 }], change: '生成方案' },
      agent: { id: session.id, session } as Agent, signal: new AbortController().signal })
    expect(result.isError).toBe(false)
    expect(adapter.requests).toHaveLength(1)
    const catalog = await readProjectDocuments(root)
    expect(catalog.documents.map(d => d.kind)).toEqual(['plan', 'review'])
    expect(session.snapshotEvents().filter(e => e.type === 'aipm/review-request')).toHaveLength(1)
    expect(JSON.stringify(result.content)).toContain('审稿报告已单独保存')
  })
})
