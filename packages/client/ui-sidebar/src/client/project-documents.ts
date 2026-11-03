/** Logical documents and independent revision history, including read-only legacy discovery. */
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ProjectFileView } from './project-reader.ts'

/** Product-facing document categories, separate from stage status and generation source. */
export type DocumentKind = 'prd' | 'plan' | 'prototype' | 'research' | 'review' | 'other'
/** The immutable file and trace information for one revision. */
export interface DocumentRevisionView {
  readonly version: number
  readonly file: ProjectFileView
  readonly source: 'conversation' | 'workshop' | 'import'
  readonly change: string
  readonly createdAt: string
}
/** One logical document; its latest revision is the normal reading action. */
export interface ProjectDocumentView {
  readonly id: string
  readonly title: string
  readonly kind: DocumentKind
  readonly material: boolean
  readonly revisions: readonly DocumentRevisionView[]
}

/**
 * Identify the writer-owned revision namespace without hiding a user's ordinary 文档 folder.
 * @param path - project-relative file path.
 * @returns whether the path belongs to a managed document revision directory.
 */
export function isManagedDocumentPath(path: string): boolean {
  return /^文档\/d-[^/]+\/V[1-9]\d*-[^/]+\//.test(path)
}

const KINDS = ['prd', 'plan', 'prototype', 'research', 'review', 'other'] as const
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function safePath(value: unknown): value is string {
  return typeof value === 'string' && value !== '' && !value.includes('\\') && !value.includes('\0')
    && !value.split('/').some(part => part === '' || part === '.' || part === '..')
}
function kindOf(file: ProjectFileView): DocumentKind {
  if (file.relativePath.startsWith('04-原型/')) return 'prototype'
  if (/^(01-立项|02-需求分析)\//.test(file.relativePath)) return 'research'
  if (file.relativePath.startsWith('05-需求评审/')) return 'review'
  if (/方案|架构|技术设计/i.test(file.name)) return 'plan'
  return /prd|需求文档/i.test(file.name) ? 'prd' : 'other'
}

/**
 * Derive documents from committed metadata and recognized legacy files without merging unrelated matching titles.
 * @param files - bounded project scan, including original files retained after organizing.
 * @param catalogText - optional internal catalog, read only when canonical files exist.
 * @param sessionIds - producing Session identities authorized by this Workspace.
 * @returns current documents with ordered history; internal paths and JSON are not presentation groups.
 */
export function projectDocuments(
  files: readonly ProjectFileView[], catalogText?: string, sessionIds: readonly SessionId[] = [],
): readonly ProjectDocumentView[] {
  const documents = new Map<string, ProjectDocumentView>()
  const usedPaths = new Set<string>()
  const originals = new Set<string>()
  const byPath = new Map(files.map(file => [file.relativePath, file]))
  if (catalogText !== undefined) {
    const catalog: unknown = JSON.parse(catalogText)
    if (!record(catalog) || catalog.schemaVersion !== 1 || !Array.isArray(catalog.documents)) throw new Error('Invalid project documents')
    for (const row of catalog.documents) {
      if (!record(row) || typeof row.id !== 'string' || (row.id === '' || documents.has(row.id)) || typeof row.title !== 'string'
        || !row.title.trim() || !KINDS.includes(row.kind as DocumentKind) || !Array.isArray(row.revisions)
        || row.revisions.length === 0) throw new Error('Invalid document identity')
      const revisions: DocumentRevisionView[] = []
      for (const value of row.revisions) {
        if (!record(value) || typeof value.version !== 'number' || !Number.isSafeInteger(value.version)
          || value.version <= (revisions.at(-1)?.version ?? 0) || !safePath(value.path) || !value.path.startsWith('文档/')
          || usedPaths.has(value.path) || !safePath(value.fileName) || value.fileName.includes('/') || typeof value.change !== 'string'
          || typeof value.createdAt !== 'string' || !['conversation', 'workshop', 'import'].includes(String(value.source))) {
          throw new Error('Invalid document revision')
        }
        if (safePath(value.originalPath)) originals.add(value.originalPath)
        usedPaths.add(value.path)
        const producer = typeof value.sessionId === 'string' ? SessionId(value.sessionId) : undefined
        const scanned = byPath.get(value.path)
        const file: ProjectFileView = { name: value.fileName, relativePath: value.path,
          extension: value.fileName.split('.').at(-1)?.toLowerCase() ?? '', kind: 'output',
          ...scanned?.size === undefined ? {} : { size: scanned.size },
          ...producer === undefined || !sessionIds.includes(producer) ? {} : { sessionId: producer } }
        revisions.push({ version: value.version, file, source: value.source as DocumentRevisionView['source'],
          change: value.change, createdAt: value.createdAt })
      }
      documents.set(row.id, { id: row.id, title: row.title, kind: row.kind as DocumentKind, material: false, revisions })
    }
  }
  const indexed = new Set(documents.keys())
  for (const file of files) {
    if (isManagedDocumentPath(file.relativePath) || originals.has(file.relativePath)) continue
    const match = /^03-PRD\/Agent工坊\/V([1-9]\d*)\/(.+)$/.exec(file.relativePath)
    const key = match === null ? file.relativePath : file.relativePath.replace(/\/V[1-9]\d*\//, '/')
    const id = 'legacy:' + key
    if (indexed.has(id)) continue
    const previous = documents.get(id)
    const revision: DocumentRevisionView = { version: match === null ? 1 : Number(match[1]), file,
      source: match === null ? 'import' : 'workshop', change: '', createdAt: '' }
    documents.set(id, { id, title: file.name.replace(/\.[^.]+$/, ''), kind: kindOf(file), material: file.kind === 'material',
      revisions: [...previous?.revisions ?? [], revision].sort((a, b) => a.version - b.version) })
  }
  return [...documents.values()].sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.title.localeCompare(b.title))
}
