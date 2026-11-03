/** Unified document saves retain original bytes and independent histories across entry points. */
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { initProject } from '../src/store.ts'
import { parseDocumentCatalog, readDocumentSource, readProjectDocuments, saveProjectDocuments, type DocumentSave } from '../src/documents.ts'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
async function project(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'aipm-documents-'))
  roots.push(path)
  await initProject(path, { name: '文档测试', summary: '保持独立历史' })
  return path
}
function input(overrides: Partial<DocumentSave> = {}): DocumentSave {
  return { title: '收入需求', kind: 'prd', fileName: 'PRD.md', content: '# 第一版', expectedVersion: 0,
    change: '创建需求文档', source: 'conversation', sessionId: 'producing-session', ...overrides }
}

describe('project document catalog', () => {
  it('initializes progress metadata without forcing empty stage directories', async () => {
    const path = await project()
    expect((await readdir(path)).sort()).toEqual(['.aipm', 'AGENTS.md'])
    expect(await readProjectDocuments(path)).toEqual({ schemaVersion: 1, documents: [] })
  })

  it('organizes legacy PRD and Workshop files without changing originals or assuming paired versions', async () => {
    const path = await project()
    await mkdir(join(path, '03-PRD/Agent工坊/V1'), { recursive: true })
    await writeFile(join(path, '03-PRD/PRD.md'), '# 单独的需求')
    await writeFile(join(path, '03-PRD/Agent工坊/V1/方案.md'), '# 第一版方案')
    const discovered = await readProjectDocuments(path)
    expect(discovered.documents.map(doc => [doc.kind, doc.revisions.at(-1)?.version]).sort())
      .toEqual([['plan', 1], ['prd', 1]])
    await saveProjectDocuments(path, [])
    expect(await readFile(join(path, '03-PRD/PRD.md'), 'utf8')).toBe('# 单独的需求')
    expect(await readFile(join(path, '03-PRD/Agent工坊/V1/方案.md'), 'utf8')).toBe('# 第一版方案')
    const catalog = await readProjectDocuments(path)
    expect(catalog.documents).toHaveLength(2)
    const prd = catalog.documents.find(doc => doc.kind === 'prd')!
    expect(prd.revisions[0]?.path).toMatch(/^文档\/.+\/V1-.+\/PRD\.md$/)
    const [updated] = await saveProjectDocuments(path, [input({ id: prd.id, expectedVersion: 1, content: '# 第二版' })])
    expect(updated?.revisions.map(revision => revision.version)).toEqual([1, 2])
    expect(await readFile(join(path, prd.revisions[0]!.path), 'utf8')).toBe('# 单独的需求')
    expect((await readProjectDocuments(path)).documents.find(doc => doc.kind === 'plan')?.revisions).toHaveLength(1)
  })

  it('snapshots binary artifacts byte-for-byte through project-relative source reads', async () => {
    const path = await project()
    const content = Uint8Array.from([0, 255, 1, 128, 80, 75])
    await writeFile(join(path, 'prototype.bin'), content)
    const source = await readDocumentSource(path, 'prototype.bin')
    const [document] = await saveProjectDocuments(path, [input({ fileName: 'prototype.bin', kind: 'prototype', content: source })])
    expect(await readFile(join(path, document!.revisions[0]!.path))).toEqual(Buffer.from(content))
    expect(await readFile(join(path, 'prototype.bin'))).toEqual(Buffer.from(content))
    await expect(readDocumentSource(path, '../outside.bin')).rejects.toThrow('Invalid document path')
  })

  it('registers a generated legacy-path file once and retains the source bytes', async () => {
    const path = await project()
    await mkdir(join(path, '03-PRD'))
    await writeFile(join(path, '03-PRD/PRD.md'), '# 新生成的文档')
    const source = await readDocumentSource(path, '03-PRD/PRD.md')
    await saveProjectDocuments(path, [input({ content: source, originalPath: '03-PRD/PRD.md' })])
    const documents = (await readProjectDocuments(path)).documents
    expect(documents).toHaveLength(1)
    expect(documents[0]?.revisions).toHaveLength(1)
    expect(await readFile(join(path, '03-PRD/PRD.md'), 'utf8')).toBe('# 新生成的文档')
  })

  it('keeps distinct documents even when their titles and file names match', async () => {
    const path = await project()
    const saved = await saveProjectDocuments(path, [input(), input()])
    expect(new Set(saved.map(doc => doc.id)).size).toBe(2)
    expect(saved.map(doc => doc.revisions.at(-1)?.version)).toEqual([1, 1])
  })

  it('accepts one concurrent update and refuses a stale writer without losing history', async () => {
    const path = await project()
    const [first] = await saveProjectDocuments(path, [input()])
    const results = await Promise.allSettled([
      saveProjectDocuments(path, [input({ id: first!.id, expectedVersion: 1, content: '# 更新 A' })]),
      saveProjectDocuments(path, [input({ id: first!.id, expectedVersion: 1, content: '# 更新 B' })]),
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const current = (await readProjectDocuments(path)).documents[0]!
    expect(current.revisions.map(revision => revision.version)).toEqual([1, 2])
    expect(await readFile(join(path, current.revisions[0]!.path), 'utf8')).toBe('# 第一版')
  })

  it('does not publish a partial batch or replace a corrupted catalog', async () => {
    const path = await project()
    await expect(saveProjectDocuments(path, [input(), input({ fileName: '../outside.md' })])).rejects.toThrow()
    expect((await readProjectDocuments(path)).documents).toEqual([])
    await saveProjectDocuments(path, [input()])
    const target = join(path, '.aipm/documents.json')
    await writeFile(target, '{broken')
    await expect(saveProjectDocuments(path, [input()])).rejects.toThrow()
    expect(await readFile(target, 'utf8')).toBe('{broken')
    expect(() => parseDocumentCatalog('{"schemaVersion":1,"documents":[{"id":"x"}]}')).toThrow()
  })

  it('refuses redirected document output and traversal in persisted revision paths', async () => {
    const path = await project()
    const outside = await project()
    await symlink(outside, join(path, '文档'), process.platform === 'win32' ? 'junction' : 'dir')
    await expect(saveProjectDocuments(path, [input()])).rejects.toThrow('redirected')
    expect((await readdir(outside)).sort()).toEqual(['.aipm', 'AGENTS.md'])
    const revision = { version: 1, path: '../outside.md', fileName: 'x.md', createdAt: '', source: 'import', change: '' }
    expect(() => parseDocumentCatalog(JSON.stringify({ schemaVersion: 1,
      documents: [{ id: 'x', title: 'x', kind: 'prd', revisions: [revision] }] }))).toThrow()
  })
})
