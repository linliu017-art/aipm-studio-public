/** Observable Workshop behavior: citations, requested artifacts, versions and scoped registration. */
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { afterEach, describe, expect, it } from 'vitest'
import * as Aipm from '../src/index.ts'
import { checkWorkshopProposal, selectWorkshopComponents } from '../src/workshop-rules.ts'
import { parseWorkshopProposal, type WorkshopProposal } from '../src/workshop-schema.ts'
import { readWorkshopRevision, saveWorkshopRevision as saveActualWorkshopRevision, WORKSHOP_DIRECTORY } from '../src/workshop-store.ts'
import { readDocumentCatalog, readProjectDocuments, saveProjectDocuments } from '../src/documents.ts'
import { workshopProposal as proposal } from './fixtures/workshop-proposal.ts'
import { initProject, readProject } from '../src/store.ts'

const roots: string[] = []
const contexts: Context[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function root(initialized = true): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'aipm-workshop-'))
  roots.push(path)
  if (initialized) await initProject(path, { name: '收入助手', summary: '验证产品方案保存' })
  return path
}


async function saveWorkshopRevision(
  path: string, value: WorkshopProposal, deliverables: ('prd' | 'plan')[], version: number, change: string,
) {
  const catalog = await readProjectDocuments(path)
  const targets = deliverables.map((kind) => {
    const document = catalog.documents.find(row => row.kind === kind)
    return { kind, ...document === undefined ? {} : { documentId: document.id },
      expectedVersion: document?.revisions.at(-1)?.version ?? 0 }
  })
  return saveActualWorkshopRevision(path, value, deliverables, version, change, targets)
}

describe('Agent Workshop native adapter', () => {
  it('preserves draft mode without creating project directories', async () => {
    const path = await root(false)
    expect(await readWorkshopRevision(path)).toBeUndefined()
    expect(checkWorkshopProposal(proposal(), ['prd']).errors).toEqual([])
    await expect(saveWorkshopRevision(path, proposal(), ['prd'], 0, '生成 PRD')).rejects.toThrow('aipm_stage init')
    expect(await readdir(path)).toEqual([])
  })

  it('refuses unsupported source claims and incomplete plans without creating artifacts', async () => {
    const path = await root()
    const p = proposal()
    p.facts[0]!.source = '用户每天记三次账'
    p.design!.failures.timeout = ''
    const checks = checkWorkshopProposal(p, ['prd', 'plan'])
    expect(checks.errors).toEqual(expect.arrayContaining([expect.stringContaining('原文依据'), expect.stringContaining('timeout')]))
    await expect(saveWorkshopRevision(path, p, ['prd', 'plan'], 0, '写初稿')).rejects.toThrow()
    expect(await readWorkshopRevision(path)).toBeUndefined()
  })

  it('refuses invented second-phase scope but accepts an explicit source-backed deferral', async () => {
    const path = await root()
    const p = proposal()
    const feature = p.features!.find(item => item.id === 'audit_needed')!
    feature.value = 'later'
    feature.evidence = '审计可以后续补足'
    await expect(saveWorkshopRevision(path, p, ['prd', 'plan'], 0, '保存')).rejects.toThrow('二期安排')
    expect(await readWorkshopRevision(path)).toBeUndefined()
    p.sourceText += '用户明确要求二期增加审计记录。'
    feature.evidence = '二期增加审计记录'
    expect(checkWorkshopProposal(p, ['prd', 'plan']).errors).toEqual([])
  })

  it('keeps manual edits to V1 and saves a PRD-only revision without generating a new plan', async () => {
    const path = await root()
    const v1 = await saveWorkshopRevision(path, proposal(), ['prd', 'plan'], 0, '首版 PRD 与方案')
    expect(v1.paths).toEqual([expect.stringMatching(/^文档\/.+\/V1-.+\/PRD\.md$/), expect.stringMatching(/^文档\/.+\/V1-.+\/方案\.md$/)])
    const previous = join(path, v1.paths[0]!)
    await writeFile(previous, '# 用户手改的第一版\n')
    const v2 = await saveWorkshopRevision(path, proposal(), ['prd'], 1, '补充需求说明')
    expect(await readFile(previous, 'utf8')).toBe('# 用户手改的第一版\n')
    expect(v2.paths).toEqual([expect.stringMatching(/^文档\/.+\/V2-.+\/PRD\.md$/)])
    const catalog = await readProjectDocuments(path)
    expect(catalog.documents.find(row => row.kind === 'plan')?.revisions).toHaveLength(1)
    const prd = await readFile(join(path, v2.paths[0]!), 'utf8')
    expect(prd).toContain('待确认')
    expect(prd).toContain('未执行独立模型审稿')
    expect(await readWorkshopRevision(path)).toMatchObject({ version: 2, deliverables: ['prd'] })
  })

  it('increments document versions independently of Workshop workflow revisions', async () => {
    const path = await root()
    await saveWorkshopRevision(path, proposal(), ['plan'], 0, '只生成方案')
    const second = await saveWorkshopRevision(path, proposal(), ['prd'], 1, '再补需求文档')
    const catalog = await readProjectDocuments(path)
    expect(catalog.documents.map(document => document.revisions.at(-1)?.version)).toEqual([1, 1])
    expect(await readFile(join(path, second.paths[0]!), 'utf8')).toContain('版本：V1')
    expect((await readWorkshopRevision(path))?.version).toBe(2)
  })

  it('reads a legacy Workshop revision and preserves its original files after a unified update', async () => {
    const path = await root()
    const parent = join(path, WORKSHOP_DIRECTORY, 'V1')
    await mkdir(parent, { recursive: true })
    const metadata = { schemaVersion: 1, version: 1, change: '旧版本', createdAt: '', projectName: '收入助手',
      deliverables: ['prd'], proposal: proposal() }
    await writeFile(join(parent, '.workshop.json'), JSON.stringify(metadata))
    await writeFile(join(parent, 'PRD.md'), '# 旧版原文')
    expect((await readWorkshopRevision(path))?.version).toBe(1)
    await saveWorkshopRevision(path, proposal(), ['prd'], 1, '继续旧版')
    expect(await readFile(join(parent, 'PRD.md'), 'utf8')).toBe('# 旧版原文')
    const documents = (await readProjectDocuments(path)).documents
    expect(documents).toHaveLength(1)
    expect(documents[0]?.revisions.map(revision => revision.version)).toEqual([1, 2])
  })

  it('updates an ordinary PRD through Workshop by exact identity and refuses a stale document target', async () => {
    const path = await root()
    const [original] = await saveProjectDocuments(path, [{ title: '普通需求', kind: 'prd', fileName: 'PRD.md',
      content: '# 原始需求', expectedVersion: 0, change: '对话生成', source: 'conversation' }])
    const target = { kind: 'prd' as const, documentId: original!.id, expectedVersion: 1 }
    await saveActualWorkshopRevision(path, proposal(), ['prd'], 0, '工坊更新同一文档', [target])
    const current = (await readProjectDocuments(path)).documents
    expect(current).toHaveLength(1)
    expect(current[0]?.id).toBe(original?.id)
    expect(current[0]?.revisions.map(revision => revision.version)).toEqual([1, 2])
    await expect(saveActualWorkshopRevision(path, proposal(), ['prd'], 1, '过期内容', [target])).rejects.toThrow('Document version changed')
    expect((await readWorkshopRevision(path))?.version).toBe(1)
  })

  it('rejects one of two concurrent saves from the same version and leaves a readable committed version', async () => {
    const path = await root()
    const attempts = await Promise.allSettled([
      saveWorkshopRevision(path, proposal(), ['prd'], 0, '第一条变更'),
      saveWorkshopRevision(path, proposal(), ['prd'], 0, '另一条变更'),
    ])
    expect(attempts.filter(item => item.status === 'fulfilled')).toHaveLength(1)
    expect(attempts.filter(item => item.status === 'rejected')).toHaveLength(1)
    expect((await readWorkshopRevision(path))?.version).toBe(1)
    expect((await readDocumentCatalog(path))?.documents[0]?.revisions).toHaveLength(1)
  })

  it('preserves corrupted revision metadata and refuses to overwrite it', async () => {
    const path = await root()
    await saveWorkshopRevision(path, proposal(), ['prd'], 0, '首版')
    const metadata = join(path, (await readDocumentCatalog(path))!.workshop!.path)
    await writeFile(metadata, '{broken')
    await expect(readWorkshopRevision(path)).rejects.toThrow()
    await expect(saveWorkshopRevision(path, proposal(), ['prd'], 1, '新需求')).rejects.toThrow()
    expect(await readFile(metadata, 'utf8')).toBe('{broken')
  })

  it('refuses an output directory redirected outside the selected project', async () => {
    const path = await root()
    const outside = await root(false)
    await mkdir(join(path, '03-PRD'))
    await symlink(outside, join(path, '03-PRD/Agent工坊'), process.platform === 'win32' ? 'junction' : 'dir')
    await expect(saveWorkshopRevision(path, proposal(), ['prd'], 0, '写入')).rejects.toThrow('current project')
    expect(await readdir(outside)).toEqual([])
  })

  it('validates durable proposal types and derives stable integration decisions from three optional components', () => {
    expect(() => parseWorkshopProposal({})).toThrow('invalid')
    const features = proposal().features!
    for (const feature of features.slice(0, 3)) feature.value = 'yes'
    const decisions = selectWorkshopComponents(features)
    expect(decisions.find(item => item.id === 's15')?.decision).toBe('必选')
    expect(selectWorkshopComponents(features)).toEqual(decisions)
    expect(() => selectWorkshopComponents([...features, features[0]!])).toThrow('Duplicate')
  })

  it('exposes usable operations through the real Loader and removes them on plugin disposal', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    ctx.baseUrl = import.meta.url
    await ctx.plugin(Loader).await()
    ctx.loader.builtins.prompt = SystemPrompt
    ctx.loader.builtins.tools = ToolRuntime
    ctx.loader.builtins.sessions = SessionStore
    ctx.loader.builtins.aipm = Aipm
    const core = [{ id: 'prompt', name: 'cordis:prompt' }, { id: 'tools', name: 'cordis:tools' }, { id: 'sessions', name: 'cordis:sessions' }]
    await ctx.loader.root.update([...core, { id: 'aipm', name: 'cordis:aipm', config: { review: { maxInputBytes: 120000, maxOutputTokens: 6000, timeoutMs: 120000 } } }])
    await ctx.loader.await()
    const path = await root()
    const session = ctx.sessions.create(SessionId('workshop-test'), { meta: { cwd: path } })
    const agent = { id: session.id, session } as Agent
    const get = await ctx.tools.execute({ callId: ToolCallId('workshop-get'), name: 'aipm_workshop', arguments: { action: 'get' },
      agent, signal: new AbortController().signal })
    expect(get.isError).toBe(false)
    expect(JSON.stringify(get.content)).toContain('尚无工坊保存记录')
    const plan = await ctx.tools.execute({ callId: ToolCallId('workshop-plan'), name: 'aipm_workshop',
      arguments: { action: 'save', proposal: proposal(), deliverables: ['plan'], expectedVersion: 0, change: '只生成方案', targets: [{ kind: 'plan', expectedVersion: 0 }] },
      agent, signal: new AbortController().signal })
    expect(plan.isError).toBe(false)
    expect((await readProject(path))?.stages['03-PRD']?.status).toBe('not_started')
    const saved = await ctx.tools.execute({ callId: ToolCallId('workshop-save'), name: 'aipm_workshop',
      arguments: { action: 'save', proposal: proposal(), deliverables: ['prd'], expectedVersion: 1, change: '生成初稿', targets: [{ kind: 'prd', expectedVersion: 0 }] },
      agent, signal: new AbortController().signal })
    expect(saved.isError).toBe(false)
    expect((await readWorkshopRevision(path))?.version).toBe(2)
    const ordinary = await ctx.tools.execute({ callId: ToolCallId('ordinary-save'), name: 'aipm_document',
      arguments: { action: 'save', title: '其他需求文档', kind: 'prd', fileName: 'PRD.md', content: '# 独立文档',
        expectedVersion: 0, change: '普通对话生成' }, agent, signal: new AbortController().signal })
    expect(ordinary.isError).toBe(false)
    const catalog = await readProjectDocuments(path)
    expect(catalog.documents).toHaveLength(3)
    expect(catalog.documents.every(document => document.revisions[0]?.sessionId === session.id)).toBe(true)
    await ctx.loader.root.update(core)
    await ctx.loader.await()
    expect(ctx.tools.get('aipm_workshop')).toBeUndefined()
    expect(ctx.tools.get('aipm_document')).toBeUndefined()
  })
})
