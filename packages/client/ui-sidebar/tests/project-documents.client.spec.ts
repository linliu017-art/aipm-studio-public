/** Logical identities preserve ordinary documents and exact legacy Workshop history. */
import { describe, expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { projectDocuments } from '../src/client/project-documents.ts'
import type { ProjectFileView } from '../src/client/project-reader.ts'

function file(relativePath: string): ProjectFileView {
  return { relativePath, name: relativePath.split('/').at(-1)!, extension: 'md', kind: 'output' }
}

describe('logical project documents', () => {
  it('groups only exact Workshop revisions and keeps ordinary PRDs independent', () => {
    const files = ['03-PRD/PRD.md', '03-PRD/Agent工坊/V1/PRD.md', '03-PRD/Agent工坊/V2/PRD.md',
      '03-PRD/Agent工坊/V1/方案.md'].map(file)
    const documents = projectDocuments(files)
    expect(documents.map(document => [document.id, document.kind, document.revisions.map(revision => revision.version)]))
      .toMatchInlineSnapshot(`
        [
          [
            "legacy:03-PRD/PRD.md",
            "prd",
            [
              1,
            ],
          ],
          [
            "legacy:03-PRD/Agent工坊/PRD.md",
            "prd",
            [
              1,
              2,
            ],
          ],
          [
            "legacy:03-PRD/Agent工坊/方案.md",
            "plan",
            [
              1,
            ],
          ],
        ]
      `)
  })

  it('uses catalog identity and trace data without displaying original duplicates or uncommitted files', () => {
    const id = 'legacy:03-PRD/PRD.md'
    const session = SessionId('producer')
    const revisions = [1, 2].map(version => ({ version, path: `文档/d-one/V${version}-abc/PRD.md`, fileName: 'PRD.md',
      createdAt: '', change: '保留历史', source: 'conversation', sessionId: session }))
    const catalog = JSON.stringify({ schemaVersion: 1, documents: [{ id, title: '收入需求', kind: 'prd', revisions }] })
    const documents = projectDocuments([file('03-PRD/PRD.md'), ...revisions.map(row => file(row.path)),
      file('文档/d-orphan/V1-abc/PRD.md')], catalog, [session])
    expect(documents).toHaveLength(1)
    expect(documents[0]?.revisions.at(-1)?.file.sessionId).toBe(session)
    expect(projectDocuments([], catalog)[0]?.revisions.at(-1)?.file.sessionId).toBeUndefined()
  })

  it('refuses malformed catalogs, out-of-project paths and unordered versions', () => {
    expect(() => projectDocuments([], '{broken')).toThrow()
    const revision = { version: 1, path: '../other.md', fileName: 'x.md', createdAt: '', change: '', source: 'import' }
    const text = (revisions: unknown[]) => JSON.stringify({ schemaVersion: 1,
      documents: [{ id: 'x', title: 'x', kind: 'prd', revisions }] })
    expect(() => projectDocuments([], text([revision]))).toThrow()
    const valid = { ...revision, path: '文档/x/V1-abc/x.md' }
    expect(() => projectDocuments([], text([valid, valid]))).toThrow()
  })
})
