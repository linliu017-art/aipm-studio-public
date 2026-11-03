/** Project documents: immutable files and a single atomic catalog for all save entry points. */
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, relative, sep } from 'node:path'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { readProject } from './store.ts'
import { STAGE_IDS } from './stages.ts'

/** Supported product document categories; source is recorded separately. */
export type DocumentKind = 'prd' | 'plan' | 'prototype' | 'research' | 'review' | 'other'
/** Stable kind identifiers accepted by the ordinary save tool. */
export const DOCUMENT_KINDS: readonly DocumentKind[] = ['prd', 'plan', 'prototype', 'research', 'review', 'other']
/** Internal catalog; never displayed as a user document. */
export const DOCUMENT_CATALOG = '.aipm/documents.json'
/** Immutable revision; originalPath is retained only for an imported file. */
export interface DocumentRevision {
  version: number
  path: string
  fileName: string
  createdAt: string
  source: 'conversation' | 'workshop' | 'import'
  change: string
  sessionId?: string
  originalPath?: string
}
/** One independently versioned document. Matching titles do not imply matching identities. */
export interface ProjectDocument {
  id: string
  title: string
  kind: DocumentKind
  revisions: DocumentRevision[]
}
/** The catalog replacement is the commit point for files and optional Workshop metadata. */
export interface DocumentCatalog {
  schemaVersion: 1
  documents: ProjectDocument[]
  workshop?: { version: number; path: string }
}
/** One save in a batch; id updates an existing document, newId is private to trusted adapters. */
export interface DocumentSave {
  id?: string
  newId?: string
  title: string
  kind: DocumentKind
  fileName: string
  content: string | Uint8Array
  expectedVersion: number
  change: string
  source: DocumentRevision['source']
  sessionId?: string
  /** Existing artifact being registered; its original file stays in place. */
  originalPath?: string
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function safePath(value: unknown): value is string {
  return typeof value === 'string' && value !== '' && !isAbsolute(value)
    && !value.includes('\\') && !value.includes('\0') && !value.split('/').some(part => part === '' || part === '.' || part === '..')
}
function inside(root: string, path: string): void {
  const child = relative(root, path)
  if (isAbsolute(child) || child === '..' || child.startsWith('..' + sep)) throw new Error('Document path leaves the project')
}
async function verified(root: string, path: string): Promise<string> {
  if (!safePath(path)) throw new Error('Invalid document path')
  let current = root
  for (const part of path.split('/')) {
    current = join(current, part)
    if ((await lstat(current)).isSymbolicLink()) throw new Error('Document paths cannot use symlinks')
  }
  inside(root, await realpath(current))
  return current
}
async function directory(root: string, path: string): Promise<string> {
  let current = root
  for (const part of path.split('/')) {
    current = join(current, part)
    try { await mkdir(current, { mode: 0o700 }) }
    catch (error) { if (!record(error) || error.code !== 'EEXIST') throw error }
    if (!(await lstat(current)).isDirectory()) throw new Error('Document directory is redirected or unavailable')
  }
  inside(root, await realpath(current))
  return current
}
function missing(error: unknown): boolean { return record(error) && error.code === 'ENOENT' }
function latest(document: ProjectDocument): number { return document.revisions.at(-1)?.version ?? 0 }

/**
 * Parse a durable catalog, rejecting invalid identities, revision order and file locations.
 * @param text - complete catalog JSON.
 * @returns validated document metadata; no file writes occur.
 */
export function parseDocumentCatalog(text: string): DocumentCatalog {
  const value: unknown = JSON.parse(text)
  if (!record(value) || value.schemaVersion !== 1 || !Array.isArray(value.documents)) throw new Error('Invalid document catalog')
  const documents: ProjectDocument[] = []
  const ids = new Set<string>()
  const paths = new Set<string>()
  for (const row of value.documents) {
    if (!record(row) || typeof row.id !== 'string' || row.id === '' || ids.has(row.id)
      || typeof row.title !== 'string' || !row.title.trim() || !DOCUMENT_KINDS.includes(row.kind as DocumentKind)
      || !Array.isArray(row.revisions) || row.revisions.length === 0) throw new Error('Invalid document identity')
    ids.add(row.id)
    const revisions: DocumentRevision[] = []
    for (const item of row.revisions) {
      if (!record(item) || !Number.isSafeInteger(item.version) || typeof item.version !== 'number'
        || item.version <= (revisions.at(-1)?.version ?? 0) || !safePath(item.path) || !item.path.startsWith('文档/')
        || paths.has(item.path) || !safePath(item.fileName) || item.fileName.includes('/')
        || typeof item.createdAt !== 'string' || typeof item.change !== 'string'
        || !['conversation', 'workshop', 'import'].includes(String(item.source))
        || (item.sessionId !== undefined && typeof item.sessionId !== 'string')
        || (item.originalPath !== undefined && !safePath(item.originalPath))) throw new Error('Invalid document revision')
      paths.add(item.path)
      revisions.push({ version: item.version, path: item.path, fileName: item.fileName, createdAt: item.createdAt,
        source: item.source as DocumentRevision['source'], change: item.change,
        ...typeof item.sessionId === 'string' ? { sessionId: item.sessionId } : {},
        ...typeof item.originalPath === 'string' ? { originalPath: item.originalPath } : {} })
    }
    documents.push({ id: row.id, title: row.title, kind: row.kind as DocumentKind, revisions })
  }
  const result: DocumentCatalog = { schemaVersion: 1, documents }
  if (value.workshop !== undefined) {
    const pointer = value.workshop
    if (!record(pointer) || typeof pointer.version !== 'number' || !Number.isSafeInteger(pointer.version) || pointer.version < 1
      || !safePath(pointer.path) || !pointer.path.startsWith('.aipm/workshop/')) throw new Error('Invalid Workshop document pointer')
    result.workshop = { version: pointer.version, path: pointer.path }
  }
  return result
}

/**
 * Read committed metadata, or undefined before the first organized save.
 * @param root - current project directory.
 * @returns validated catalog; a malformed or redirected catalog fails rather than resetting history.
 */
export async function readDocumentCatalog(root: string): Promise<DocumentCatalog | undefined> {
  const canonical = await realpath(root)
  let path: string
  try { path = await verified(canonical, DOCUMENT_CATALOG) }
  catch (error) { if (missing(error)) return undefined; throw error }
  return parseDocumentCatalog(await readFile(path, 'utf8'))
}

/**
 * Read a locally generated artifact for a unified save, including binary formats.
 * @param root - current project directory.
 * @param path - relative source file; every ancestor must stay inside the project without symlinks.
 * @param maxBytes - optional upper bound checked before and after reading.
 * @returns source bytes; no source file is changed.
 */
export async function readDocumentSource(root: string, path: string, maxBytes?: number): Promise<Uint8Array> {
  const file = await verified(await realpath(root), path)
  if (maxBytes !== undefined && (await stat(file)).size > maxBytes) throw new Error('Document exceeds the byte limit')
  const bytes = await readFile(file)
  if (maxBytes !== undefined && bytes.length > maxBytes) throw new Error('Document exceeds the byte limit')
  return bytes
}

function legacyKind(path: string): DocumentKind {
  const name = basename(path, extname(path))
  if (path.startsWith('04-原型/')) return 'prototype'
  if (path.startsWith('01-立项/') || path.startsWith('02-需求分析/')) return 'research'
  if (path.startsWith('05-需求评审/')) return 'review'
  if (/方案|架构|技术设计/i.test(name)) return 'plan'
  return /prd|需求文档/i.test(name) ? 'prd' : 'other'
}
async function legacyDocuments(root: string): Promise<ProjectDocument[]> {
  const groups = new Map<string, ProjectDocument>()
  let count = 0
  const visit = async (path: string, depth: number): Promise<void> => {
    for (const entry of (await readdir(join(root, path), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '文档' || entry.name === 'AGENTS.md') continue
      const child = path ? path + '/' + entry.name : entry.name
      if (entry.isDirectory()) {
        if (depth === 0 && !STAGE_IDS.includes(entry.name)) continue
        if (depth >= 4) throw new Error('Legacy documents exceed the supported scan depth')
        await visit(child, depth + 1)
      } else if (entry.isFile()) {
        if (depth === 0 && !/^(PRD|方案|需求文档|技术方案)\.(md|html|docx|pdf)$/i.test(entry.name)) continue
        if (++count > 600) throw new Error('Legacy documents exceed the supported scan size')
        const match = /^03-PRD\/Agent工坊\/V([1-9]\d*)\/(.+)$/.exec(child)
        const key = match === null ? child : child.replace(/\/V[1-9]\d*\//, '/')
        const version = match === null ? 1 : Number(match[1])
        if (!Number.isSafeInteger(version)) throw new Error('Invalid legacy document version')
        const id = 'legacy:' + key
        const document = groups.get(id) ?? { id, title: basename(entry.name, extname(entry.name)), kind: legacyKind(child), revisions: [] }
        const details = await stat(await verified(root, child))
        document.revisions.push({ version, path: child, fileName: entry.name,
          createdAt: details.mtime.toISOString(), source: match === null ? 'import' : 'workshop', change: '', originalPath: child })
        groups.set(id, document)
      }
    }
  }
  await visit('', 0)
  for (const document of groups.values()) document.revisions.sort((a, b) => a.version - b.version)
  return [...groups.values()]
}

/**
 * List indexed documents and recognized legacy stage outputs without changing any files.
 * @param root - current project directory.
 * @returns logical documents; legacy references are snapshotted when organized or updated.
 */
export async function readProjectDocuments(root: string): Promise<DocumentCatalog> {
  const canonical = await realpath(root)
  const catalog = await readDocumentCatalog(canonical) ?? { schemaVersion: 1, documents: [] }
  await Promise.all(catalog.documents.flatMap(document => document.revisions.map(revision => verified(canonical, revision.path))))
  if (catalog.workshop !== undefined) await verified(canonical, catalog.workshop.path)
  const ids = new Set(catalog.documents.map(document => document.id))
  const originals = new Set(catalog.documents.flatMap(document => document.revisions.map(revision => revision.originalPath)))
  const legacy = await legacyDocuments(canonical)
  const unindexed = legacy.filter(document => !ids.has(document.id)
    && !document.revisions.every(revision => originals.has(revision.path)))
  return { ...catalog, documents: [...catalog.documents, ...unindexed] }
}

/**
 * Commit independent document revisions together through the shared catalog writer.
 * @param root - initialized project directory.
 * @param inputs - ordinary or Workshop saves; an empty batch organizes existing files only.
 * @param workshop - trusted adapter's validated proposal snapshot and sequential workflow version.
 * @param signal - optional cancellation checked inside the writer lock and before publication.
 * @param observed - source document versions that must still be current at the commit point.
 * @returns saved documents; an empty input returns the organized catalog's documents.
 */
export async function saveProjectDocuments(
  root: string, inputs: readonly DocumentSave[], workshop?: { version: number; text: string },
  observed: readonly { id: string; version: number; hash?: string; byteLength?: number }[] = [],
  signal?: AbortSignal,
): Promise<ProjectDocument[]> {
  const canonical = await realpath(root)
  if (await readProject(canonical) === undefined) throw new Error('Initialize the project before saving documents')
  await verified(canonical, '.aipm')
  return withFileLock(join(canonical, DOCUMENT_CATALOG), async () => {
    signal?.throwIfAborted()
    const catalog = await readProjectDocuments(canonical)
    for (const expected of observed) {
      const document = catalog.documents.find(row => row.id === expected.id)
      if (document === undefined || latest(document) !== expected.version) throw new Error('Source document version changed; reload before saving')
      const revision = document.revisions.at(-1)
      if (expected.hash !== undefined && revision !== undefined
        && createHash('sha256').update(await readDocumentSource(canonical, revision.path, expected.byteLength)).digest('hex') !== expected.hash) {
        throw new Error('Source document bytes changed; reload before saving')
      }
    }
    const created: string[] = []
    const seen = new Set<string>()
    const saved: ProjectDocument[] = []
    const writeRevision = async (id: string, revision: DocumentRevision, content: string | Uint8Array): Promise<DocumentRevision> => {
      const parent = await directory(canonical, '文档/d-' + createHash('sha256').update(id).digest('hex').slice(0, 24))
      const target = await mkdtemp(join(parent, 'V' + String(revision.version) + '-'))
      created.push(target)
      await writeFile(join(target, revision.fileName), content, { flag: 'wx', mode: 0o600 })
      return { ...revision, path: relative(canonical, join(target, revision.fileName)).split(sep).join('/') }
    }
    try {
      for (const input of inputs) {
        const current = input.id === undefined ? undefined : catalog.documents.find(document => document.id === input.id)
        if (input.id !== undefined && current === undefined) throw new Error('Document not found; list documents before saving')
        const id = current?.id ?? input.newId ?? 'doc-' + randomUUID()
        if (seen.has(id) || (current === undefined && catalog.documents.some(document => document.id === id))) throw new Error('Duplicate document save')
        seen.add(id)
        if (!Number.isSafeInteger(input.expectedVersion + 1) || input.expectedVersion !== (current === undefined ? 0 : latest(current))) {
          throw new Error('Document version changed; read the current document before saving')
        }
        if (!input.title.trim() || !input.change.trim() || !DOCUMENT_KINDS.includes(input.kind)
          || !safePath(input.fileName) || input.fileName.includes('/') || input.fileName.startsWith('.')
          || (input.originalPath !== undefined && !safePath(input.originalPath)) || input.content.length === 0) {
          throw new Error('A title, file name, content and change description are required')
        }
        const next: ProjectDocument = { id, title: input.title.trim(), kind: input.kind, revisions: [...current?.revisions ?? []] }
        next.revisions.push(await writeRevision(id, { version: input.expectedVersion + 1, path: '', fileName: input.fileName,
          createdAt: new Date().toISOString(), source: input.source, change: input.change.trim(),
          ...input.sessionId === undefined ? {} : { sessionId: input.sessionId },
          ...input.originalPath === undefined ? {} : { originalPath: input.originalPath } }, input.content))
        catalog.documents = [...catalog.documents.filter(document => document.id !== id), next]
        saved.push(next)
      }
      const registeredSources = new Set(inputs.map(input => input.originalPath).filter(path => path !== undefined))
      catalog.documents = catalog.documents.filter(document => saved.includes(document)
        || !document.revisions.every(revision => !revision.path.startsWith('文档/') && registeredSources.has(revision.path)))
      // Legacy bytes enter the same immutable history before its first catalog publication.
      for (const document of catalog.documents) {
        for (const [index, revision] of document.revisions.entries()) {
          if (revision.path.startsWith('文档/')) continue
          const content = await readFile(await verified(canonical, revision.path))
          document.revisions[index] = await writeRevision(document.id, revision, content)
        }
      }
      if (workshop !== undefined) {
        if (!Number.isSafeInteger(workshop.version) || workshop.version < 1) throw new Error('Invalid Workshop version')
        if (catalog.workshop !== undefined && workshop.version !== catalog.workshop.version + 1) throw new Error('Workshop version changed')
        const parent = await directory(canonical, '.aipm/workshop')
        const path = join(parent, randomUUID() + '.json')
        created.push(path)
        await writeFile(path, workshop.text, { flag: 'wx', mode: 0o600 })
        catalog.workshop = { version: workshop.version, path: relative(canonical, path).split(sep).join('/') }
      }
      signal?.throwIfAborted()
      await writeFileAtomic(join(canonical, DOCUMENT_CATALOG), JSON.stringify(catalog, null, 2) + '\n', { mode: 0o600 })
      return inputs.length === 0 ? catalog.documents : saved
    } catch (error) {
      await Promise.all(created.map(path => rm(path, { recursive: true, force: true })))
      throw error
    }
  })
}
