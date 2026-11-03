import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, readFileSync, writeFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import WorkspaceRegistry from '@deepseek-ai/dsh-workspace'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import WorkspaceController from '../src/index.ts'
import { DEFAULT_WORKSPACE_DIRECTORY } from '../src/default-workspace.ts'
import { prepareIdeaDirectory } from '../src/idea-workspace.ts'
import { WorkspaceFeed } from '../src/feed.ts'
import type { WorkspaceFollowFrame } from '../src/types.ts'
import { MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'

// The controller relays whatever families the providers report; this suite merges its own.
declare module '@deepseek-ai/dsh-workspace/types' {
  interface SessionActivityKindMap {
    probe: true
    'probe-items': true
  }
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    'fixture/failure': {}
  }
}

const roots: Context[] = []

/** Workspace roots created per test, removed after their context settles. */
const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(ctx => ctx.fiber.dispose()))
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => { resolve = settle })
  return { promise, resolve }
}

async function harness(options: { systemDocuments?: boolean } = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-workspace-controller-')))
  tempDirs.push(root)
  const ctx = new Context()
  roots.push(ctx)
  await ctx.plugin(SessionStore)
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend())
  const storageDomain = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', storageDomain)
  ctx.provide('storageDomain', storageDomain)
  ctx.provide('sessionPersistence', { list: () => Promise.resolve([]) } as never)
  await ctx.plugin(WorkspaceRegistry)
  const dispose = (): void => {}
  ctx.provide('typert', {
    lookups: { configure: () => dispose },
    contexts: { configureHost: () => dispose },
  } as never)
  const controller = new WorkspaceController(ctx, options.systemDocuments === true ? {} : { documentsDirectory: root })
  return { controller, ctx, root, storageDomain }
}

function stageDir(root: string, name: string): string {
  const path = join(root, name)
  mkdirSync(path, { recursive: true })
  return path
}

async function nextFrame(
  iterator: AsyncIterator<WorkspaceFollowFrame>,
): Promise<WorkspaceFollowFrame> {
  const next = await iterator.next()
  if (next.done === true) throw new Error('Workspace stream ended before the expected frame')
  return next.value
}

describe('WorkspaceController commands', () => {
  it('renames saved project metadata and Workspace title while retaining unrelated content', async () => {
    const { controller, root } = await harness()
    const path = stageDir(root, 'saved-project')
    stageDir(path, '.aipm')
    const state = { schemaVersion: 1, name: '自动项目名', summary: '保留简介', createdAt: 'original',
      stages: { '03-PRD': { status: 'done', note: '保留进度' } }, extra: { keep: true } }
    writeFileSync(join(path, '.aipm/project.json'), JSON.stringify(state))
    writeFileSync(join(path, '方案.md'), '# 原始方案')
    const created = await controller.create({ path })
    await expect(controller.renameProject({ workspaceId: created.workspace.workspaceId, title: '  我的记账本  ' }))
      .resolves.toMatchObject({ workspace: { title: '我的记账本', path } })
    expect(JSON.parse(readFileSync(join(path, '.aipm/project.json'), 'utf8'))).toEqual({ ...state, name: '我的记账本' })
    expect(readFileSync(join(path, '方案.md'), 'utf8')).toBe('# 原始方案')
    await expect(controller.create({ path })).resolves.toMatchObject({ workspace: { title: '我的记账本' }, created: false })
  })

  it('restores the exact metadata bytes when Workspace title persistence rejects a project rename', async () => {
    const { controller, ctx, root } = await harness()
    const path = stageDir(root, 'saved-project')
    stageDir(path, '.aipm')
    const original = '{"schemaVersion":1, "name":"原名称", "stages":{}}\n'
    writeFileSync(join(path, '.aipm/project.json'), original)
    const created = await controller.create({ path })
    const workspace = ctx.workspaceRegistry.get(created.workspace.workspaceId)!
    vi.spyOn(workspace, 'setTitle').mockRejectedValueOnce(new Error('storage failed'))
    await expect(controller.renameProject({ workspaceId: workspace.id, title: '新名称' })).rejects.toThrow('storage failed')
    expect(readFileSync(join(path, '.aipm/project.json'), 'utf8')).toBe(original)
    expect(workspace.title).toBe('saved-project')
  })

  it('refuses blank, conflicting, invalid and redirected project metadata without changing titles', async () => {
    const { controller, root } = await harness()
    const path = stageDir(root, 'saved-project')
    const created = await controller.create({ path })
    await expect(controller.renameProject({ workspaceId: created.workspace.workspaceId, title: '  ' }))
      .rejects.toMatchObject({ code: 'gateway/bad-request' })
    const occupied = await controller.create({ path: stageDir(root, 'occupied') })
    await expect(controller.renameProject({ workspaceId: created.workspace.workspaceId, title: occupied.workspace.title }))
      .rejects.toMatchObject({ code: 'workspace/name-conflict' })
    stageDir(path, '.aipm')
    writeFileSync(join(path, '.aipm/project.json'), '{invalid')
    await expect(controller.renameProject({ workspaceId: created.workspace.workspaceId, title: '新名称' })).rejects.toThrow()
    expect(readFileSync(join(path, '.aipm/project.json'), 'utf8')).toBe('{invalid')
    const redirected = stageDir(root, 'redirected-project')
    const outside = stageDir(root, 'outside-metadata')
    const metadata = JSON.stringify({ schemaVersion: 1, name: '保留', stages: {} })
    writeFileSync(join(outside, 'project.json'), metadata)
    symlinkSync(outside, join(redirected, '.aipm'), process.platform === 'win32' ? 'junction' : 'dir')
    const other = await controller.create({ path: redirected })
    await expect(controller.renameProject({ workspaceId: other.workspace.workspaceId, title: '不得写入' })).rejects.toThrow('outside')
    expect(readFileSync(join(outside, 'project.json'), 'utf8')).toBe(metadata)
    await expect(controller.create({ path })).resolves.toMatchObject({ workspace: { title: 'saved-project' } })
  })

  it('creates independent ideas without inheriting or changing an existing project', async () => {
    const { controller, ctx, root } = await harness()
    const existing = stageDir(root, 'deepseek-harness/default-workspace')
    stageDir(existing, '.aipm')
    const metadata = JSON.stringify({ name: '轻颜相机' })
    writeFileSync(join(existing, '.aipm/project.json'), metadata)
    writeFileSync(join(existing, 'AGENTS.md'), '# 轻颜相机')
    await controller.create({ path: existing })
    const [first, second] = await Promise.all([
      controller.createIdea(new AbortController().signal),
      controller.createIdea(new AbortController().signal),
    ])
    expect(first.path).not.toBe(second.path)

    for (const value of [first, second]) {
      expect(value.path).toMatch(/deepseek-harness[/\\]ideas[/\\]idea-/)
      expect(existsSync(join(value.path, 'AGENTS.md'))).toBe(false)
      expect(existsSync(join(value.path, '.aipm/project.json'))).toBe(false)
    }
    expect(ctx.workspaceRegistry.list()).toHaveLength(1)
    expect(readFileSync(join(existing, '.aipm/project.json'), 'utf8')).toBe(metadata)
    expect(readFileSync(join(existing, 'AGENTS.md'), 'utf8')).toBe('# 轻颜相机')
  })

  it('rejects an ideas root nested inside an existing Workspace before creating it', async () => {
    const { controller, ctx, root } = await harness()
    const existing = stageDir(root, 'existing')
    await controller.create({ path: existing })
    const nested = join(existing, 'ideas')
    await expect(prepareIdeaDirectory(ctx, nested)).rejects.toMatchObject({ code: 'workspace/invalid-path' })
    expect(existsSync(nested)).toBe(false)
  })

  it('reports a failed idea directory creation without selecting an existing project', async () => {
    const { ctx, root } = await harness()
    const blocked = join(root, 'blocked')
    writeFileSync(blocked, 'keep')
    await expect(prepareIdeaDirectory(ctx, join(blocked, 'ideas'))).rejects.toMatchObject({ code: 'workspace/invalid-path' })
    expect(ctx.workspaceRegistry.list()).toHaveLength(0)
    expect(readFileSync(blocked, 'utf8')).toBe('keep')
  })

  it('serializes concurrent path adoption and preserves an existing title', async () => {
    const { controller, root } = await harness()
    const path = stageDir(root, 'alpha')
    const results = await Promise.all([
      controller.create({ path }),
      controller.create({ path }),
    ])
    const created = results.find(result => result.created)
    const resolved = results.find(result => !result.created)
    expect(created).toMatchObject({ workspace: { path, title: 'alpha' } })
    expect(resolved?.workspace.workspaceId).toBe(created?.workspace.workspaceId)

    const workspaceId = created?.workspace.workspaceId
    if (workspaceId === undefined) throw new Error('fixture did not create a Workspace')
    await controller.rename({ workspaceId, title: 'renamed' })
    await expect(controller.create({ path })).resolves.toMatchObject({
      created: false,
      workspace: { workspaceId, title: 'renamed' },
    })
  })

  it('maps invalid paths, blank names, conflicts, and unknown ids to stable failures', async () => {
    const { controller, root } = await harness()
    const first = await controller.create({ path: stageDir(root, 'first') })
    const second = await controller.create({ path: stageDir(root, 'second') })

    await expect(controller.create({ path: join(root, 'missing') })).rejects.toMatchObject({
      code: 'workspace/invalid-path',
      details: { path: join(root, 'missing') },
    })
    expect(existsSync(join(root, 'missing'))).toBe(false)
    await expect(controller.rename({ workspaceId: first.workspace.workspaceId, title: '  ' }))
      .rejects.toMatchObject({ code: 'gateway/bad-request' })
    await controller.rename({ workspaceId: first.workspace.workspaceId, title: 'occupied' })
    await expect(controller.rename({ workspaceId: second.workspace.workspaceId, title: ' occupied ' }))
      .rejects.toMatchObject({ code: 'workspace/name-conflict' })
    await expect(controller.delete({ workspaceId: 'missing' as WorkspaceId }))
      .rejects.toMatchObject({ code: 'workspace/not-found' })
  })

  it('preserves Remote failures and propagates unexpected registry failures', async () => {
    const { controller, ctx, root } = await harness()
    const remoteFailure = new RemoteError('fixture/failure', 'already mapped', {})
    const resolveByPath = vi.spyOn(ctx.workspaceRegistry, 'resolveByPath')
      .mockRejectedValueOnce(remoteFailure)
      .mockRejectedValueOnce('plain failure')
    await expect(controller.create({ path: stageDir(root, 'remote-failure') }))
      .rejects.toBe(remoteFailure)
    const plainFailure = controller.create({ path: stageDir(root, 'plain-failure') })
    await expect(plainFailure).rejects.toMatchObject({ code: 'workspace/invalid-path' })
    await expect(plainFailure).rejects.toThrow('plain failure')
    resolveByPath.mockRestore()

    const created = await controller.create({ path: stageDir(root, 'created') })
    const workspace = ctx.workspaceRegistry.get(created.workspace.workspaceId)
    if (workspace === undefined) throw new Error('fixture Workspace disappeared')

    const orderFailure = new Error('order storage failed')
    vi.spyOn(ctx.workspaceRegistry, 'insertBefore').mockRejectedValueOnce(orderFailure)
    await expect(controller.insertBefore({ workspaceId: created.workspace.workspaceId }))
      .rejects.toBe(orderFailure)

    const moveFailure = new Error('membership storage failed')
    vi.spyOn(workspace, 'insertSessionBefore').mockRejectedValueOnce(moveFailure)
    await expect(controller.insertSessionBefore({
      workspaceId: created.workspace.workspaceId,
      sessionId: SessionId('session'),
    })).rejects.toBe(moveFailure)

    const archiveFailure = new Error('archive storage failed')
    vi.spyOn(ctx.workspaceRegistry, 'archiveSession').mockRejectedValueOnce(archiveFailure)
    await expect(controller.archiveSession({ sessionId: SessionId('session') }))
      .rejects.toBe(archiveFailure)

    const unarchiveFailure = new Error('unarchive storage failed')
    vi.spyOn(ctx.workspaceRegistry, 'unarchiveSession').mockRejectedValueOnce(unarchiveFailure)
    await expect(controller.unarchiveSession({ sessionId: SessionId('session') }))
      .rejects.toBe(unarchiveFailure)

    const pinFailure = new Error('pin storage failed')
    vi.spyOn(ctx.workspaceRegistry, 'pinSession').mockRejectedValueOnce(pinFailure)
    await expect(controller.pinSession({ sessionId: SessionId('session') }))
      .rejects.toBe(pinFailure)

    const unpinFailure = new Error('unpin storage failed')
    vi.spyOn(ctx.workspaceRegistry, 'unpinSession').mockRejectedValueOnce(unpinFailure)
    await expect(controller.unpinSession({ sessionId: SessionId('session') }))
      .rejects.toBe(unpinFailure)
  })

  it('resolves queued Workspace identities when their operation starts', async () => {
    const { controller, ctx, root } = await harness()
    const target = await controller.create({ path: stageDir(root, 'target') })
    const blockerPath = stageDir(root, 'blocker')
    const gate = deferred<undefined>()
    const originalResolveByPath = ctx.workspaceRegistry.resolveByPath.bind(ctx.workspaceRegistry)
    const resolveByPath = vi.spyOn(ctx.workspaceRegistry, 'resolveByPath')
    resolveByPath.mockImplementationOnce(async (path) => {
      await gate.promise
      return originalResolveByPath(path)
    })

    const blocker = controller.create({ path: blockerPath })
    const deletion = controller.delete({ workspaceId: target.workspace.workspaceId })
    const staleRename = controller.rename({
      workspaceId: target.workspace.workspaceId,
      title: 'must-not-land',
    })
    gate.resolve(undefined)
    await blocker
    await expect(deletion).resolves.toEqual({ deleted: true })
    await expect(staleRename).rejects.toMatchObject({ code: 'workspace/not-found' })
  })

  it('reorders Workspaces and Sessions and archives only known Sessions', async () => {
    const { controller, ctx, root } = await harness()
    const first = await controller.create({ path: stageDir(root, 'first') })
    const second = await controller.create({ path: stageDir(root, 'second') })
    await expect(controller.insertBefore({
      workspaceId: first.workspace.workspaceId,
      beforeWorkspaceId: second.workspace.workspaceId,
    })).resolves.toEqual({
      workspaceIds: [first.workspace.workspaceId, second.workspace.workspaceId],
    })
    await expect(controller.insertBefore({ workspaceId: 'missing' as WorkspaceId }))
      .rejects.toMatchObject({ code: 'workspace/not-found' })

    const session = ctx.sessions.create(SessionId('session-one'), {
      meta: { cwd: first.workspace.path },
    })
    const workspace = ctx.workspaceRegistry.get(first.workspace.workspaceId)
    if (workspace === undefined) throw new Error('fixture Workspace disappeared')
    await workspace.attachSession(session.id)
    await expect(controller.insertSessionBefore({
      workspaceId: first.workspace.workspaceId,
      sessionId: session.id,
    })).resolves.toMatchObject({ workspace: { sessionIds: [session.id] } })
    await expect(controller.insertSessionBefore({
      workspaceId: first.workspace.workspaceId,
      sessionId: SessionId('missing-session'),
    })).rejects.toMatchObject({ code: 'workspace/move-invalid' })
    await expect(controller.insertSessionBefore({
      workspaceId: first.workspace.workspaceId,
      sessionId: session.id,
      beforeSessionId: SessionId('missing-anchor'),
    })).rejects.toMatchObject({
      code: 'workspace/move-invalid',
      details: { beforeSessionId: 'missing-anchor' },
    })
    await expect(controller.insertSessionBefore({
      workspaceId: 'missing' as WorkspaceId,
      sessionId: session.id,
    })).rejects.toMatchObject({ code: 'workspace/not-found' })

    // A session reported active by the registry's activity waterfall is a
    // stable business failure carrying what still runs, and nothing is written.
    const activity = [{ kind: 'probe' as const }, { kind: 'probe-items' as const, items: [{ id: 'item-1', label: 'build' }] }]
    const stopReporting = ctx.on('workspace/session-activity', async ({ sessionId }, next) =>
      sessionId === session.id ? [...activity, ...(await next())] : next())
    await expect(controller.archiveSession({ sessionId: session.id })).rejects.toMatchObject({
      code: 'workspace/session-active',
      details: { sessionId: session.id, activity },
    })
    expect([...ctx.workspaceRegistry.archivedSessionIds]).toEqual([])
    // Asking to stop the work archives the still-active Session and reaches
    // the stop providers first.
    const stops: string[] = []
    const stopListening = ctx.on('workspace/session-stop', ({ sessionId }) => { stops.push(String(sessionId)) })
    await expect(controller.archiveSession({ sessionId: session.id, stopActivity: true }))
      .resolves.toEqual({ archivedSessionIds: [session.id] })
    expect(stops).toEqual([String(session.id)])
    stopListening()
    await expect(controller.unarchiveSession({ sessionId: session.id }))
      .resolves.toEqual({ archivedSessionIds: [] })
    stopReporting()

    await expect(controller.archiveSession({ sessionId: session.id }))
      .resolves.toEqual({ archivedSessionIds: [session.id] })
    await expect(controller.archiveSession({ sessionId: SessionId('unknown') }))
      .rejects.toMatchObject({ code: 'session/not-found' })
    await expect(controller.unarchiveSession({ sessionId: session.id }))
      .resolves.toEqual({ archivedSessionIds: [] })
    // Unarchive is idempotent: an id that is not archived is not an error.
    await expect(controller.unarchiveSession({ sessionId: session.id }))
      .resolves.toEqual({ archivedSessionIds: [] })
  })

  it('pins only known unarchived Sessions and unpins idempotently', async () => {
    const { controller, ctx, root } = await harness()
    const created = await controller.create({ path: stageDir(root, 'pins') })
    const session = ctx.sessions.create(SessionId('pin-me'), {
      meta: { cwd: created.workspace.path },
    })

    await expect(controller.pinSession({ sessionId: session.id }))
      .resolves.toEqual({ pinnedSessionIds: [session.id] })
    await expect(controller.pinSession({ sessionId: SessionId('unknown') }))
      .rejects.toMatchObject({ code: 'session/not-found' })

    // Pinning an archived Session is a caller error, not a missing session.
    const archived = ctx.sessions.create(SessionId('stored'), {
      meta: { cwd: created.workspace.path },
    })
    await controller.archiveSession({ sessionId: archived.id })
    await expect(controller.pinSession({ sessionId: archived.id }))
      .rejects.toMatchObject({ code: 'gateway/bad-request' })

    await expect(controller.unpinSession({ sessionId: session.id }))
      .resolves.toEqual({ pinnedSessionIds: [] })
    // Unpin is idempotent: an id that is not pinned is not an error.
    await expect(controller.unpinSession({ sessionId: session.id }))
      .resolves.toEqual({ pinnedSessionIds: [] })
  })
})

describe('WorkspaceController follow', () => {
  it('seeds a new feed from existing rows and rejects an inconsistent registry commit', async () => {
    const { ctx, root } = await harness()
    const existing = await ctx.workspaceRegistry.create(stageDir(root, 'existing'))
    const feed = new WorkspaceFeed(ctx)
    expect(feed.baseline()).toMatchObject({
      items: [{ workspaceId: existing.id }],
    })

    expect(() => {
      ctx.emit('domain/changed', {
        domain: 'workspace',
        table: '',
        key: '',
        operation: 'put',
        value: {
          initialized: true,
          workspaceIds: ['missing'],
          archivedSessionIds: [],
          pinnedSessionIds: [],
        },
      })
    }).toThrow('references missing Workspace "missing"')
  })

  it('starts a fresh feed with existing pins and follows their removal', async () => {
    const { controller, ctx, root } = await harness()
    const session = ctx.sessions.create(SessionId('already-pinned'), { meta: { cwd: root } })
    await controller.pinSession({ sessionId: session.id })
    const feed = new WorkspaceFeed(ctx)
    const abort = new AbortController()
    const iterator = feed.follow(abort.signal)[Symbol.asyncIterator]()
    try {
      await expect(nextFrame(iterator)).resolves.toMatchObject({
        type: 'baseline', value: { pinnedSessionIds: [session.id] },
      })
      await controller.unpinSession({ sessionId: session.id })
      await expect(nextFrame(iterator)).resolves.toEqual({ type: 'pinned', pinnedSessionIds: [] })
    } finally {
      abort.abort()
      await iterator.return?.()
    }
  })

  it('starts with a complete baseline and emits committed increments in domain order', async () => {
    const { controller, ctx, root } = await harness()
    const abort = new AbortController()
    const iterator = controller.follow(abort.signal)[Symbol.asyncIterator]()
    await expect(nextFrame(iterator)).resolves.toEqual({
      type: 'baseline',
      value: { items: [], archivedSessionIds: [], pinnedSessionIds: [] },
    })

    const first = await controller.create({ path: stageDir(root, 'first') })
    await expect(nextFrame(iterator)).resolves.toMatchObject({
      type: 'upsert', workspace: { workspaceId: first.workspace.workspaceId },
    })
    await expect(nextFrame(iterator)).resolves.toEqual({
      type: 'order', workspaceIds: [first.workspace.workspaceId],
    })
    await controller.rename({ workspaceId: first.workspace.workspaceId, title: 'renamed' })
    await expect(nextFrame(iterator)).resolves.toMatchObject({
      type: 'upsert', workspace: { title: 'renamed' },
    })

    const second = await controller.create({ path: stageDir(root, 'second') })
    await expect(nextFrame(iterator)).resolves.toMatchObject({
      type: 'upsert', workspace: { workspaceId: second.workspace.workspaceId },
    })
    await expect(nextFrame(iterator)).resolves.toEqual({
      type: 'order', workspaceIds: [second.workspace.workspaceId, first.workspace.workspaceId],
    })
    await controller.insertBefore({
      workspaceId: first.workspace.workspaceId,
      beforeWorkspaceId: second.workspace.workspaceId,
    })
    await expect(nextFrame(iterator)).resolves.toEqual({
      type: 'order',
      workspaceIds: [first.workspace.workspaceId, second.workspace.workspaceId],
    })

    const session = ctx.sessions.create(SessionId('archived'), {
      meta: { cwd: first.workspace.path },
    })
    await controller.archiveSession({ sessionId: session.id })
    await expect(nextFrame(iterator)).resolves.toEqual({
      type: 'archived', archivedSessionIds: [session.id],
    })
    // Unarchive rides the same complete-set increment: no new frame type.
    await controller.unarchiveSession({ sessionId: session.id })
    await expect(nextFrame(iterator)).resolves.toEqual({
      type: 'archived', archivedSessionIds: [],
    })
    await controller.pinSession({ sessionId: session.id })
    await expect(nextFrame(iterator)).resolves.toEqual({
      type: 'pinned', pinnedSessionIds: [session.id],
    })
    // Unpin rides the same complete-set increment: no new frame type.
    await controller.unpinSession({ sessionId: session.id })
    await expect(nextFrame(iterator)).resolves.toEqual({
      type: 'pinned', pinnedSessionIds: [],
    })
    await controller.delete({ workspaceId: second.workspace.workspaceId })
    await expect(nextFrame(iterator)).resolves.toEqual({
      type: 'order', workspaceIds: [first.workspace.workspaceId],
    })
    await expect(nextFrame(iterator)).resolves.toEqual({
      type: 'remove', workspaceId: second.workspace.workspaceId,
    })

    abort.abort()
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined })
  })

  it('ignores unrelated domain writes and closes active followers on disposal', async () => {
    const { controller, ctx, root } = await harness()
    const abort = new AbortController()
    const iterator = controller.follow(abort.signal)[Symbol.asyncIterator]()
    await nextFrame(iterator)
    ctx.emit('domain/changed', {
      domain: 'other', table: 'records', key: 'x', operation: 'put', value: {},
    })
    ctx.emit('domain/changed', {
      domain: 'workspace', table: '', key: '', operation: 'deleted',
    })
    ctx.emit('domain/changed', {
      domain: 'workspace', table: 'other', key: 'x', operation: 'put', value: {},
    })
    ctx.emit('domain/changed', {
      domain: 'workspace', table: 'workspaces', key: 'unknown', operation: 'deleted',
    })
    const pending = iterator.next()
    const created = await controller.create({ path: stageDir(root, 'visible') })
    await expect(pending).resolves.toMatchObject({ value: { type: 'upsert' } })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { type: 'order', workspaceIds: [created.workspace.workspaceId] },
    })

    const closing = iterator.next()
    await ctx.fiber.dispose()
    roots.splice(roots.indexOf(ctx), 1)
    await expect(closing).resolves.toEqual({ done: true, value: undefined })
  })
})

describe('first-use Remote', () => {
  it('reuses an initialized Workspace without looking up system Documents', async () => {
    const { controller, ctx, root } = await harness({ systemDocuments: true })
    const workspace = await ctx.workspaceRegistry.initializeDefault(async () => root)
    const signal = AbortSignal.abort()
    await expect(controller.initializeDefault(signal))
      .resolves.toMatchObject({ workspace: { workspaceId: workspace!.id, path: root, title: basename(root) } })
  })

  it('returns a durable Workspace named after its fixed directory without allocating a Session', async () => {
    const { controller, ctx, root } = await harness()
    const signal = new AbortController().signal
    const result = await controller.initializeDefault(signal)
    expect(result!.workspace.path).toBe(join(root, 'deepseek-harness', DEFAULT_WORKSPACE_DIRECTORY))
    expect(result!.workspace.title).toBe(DEFAULT_WORKSPACE_DIRECTORY)
    expect(existsSync(result!.workspace.path)).toBe(true)
    expect(ctx.sessions.list()).toEqual([])
    expect(await controller.initializeDefault(signal)).toEqual(result)
  })

  it('skips ineligible first use and propagates preparation failures', async () => {
    const { controller, ctx, root } = await harness()
    await ctx.workspaceRegistry.create(root)
    await expect(controller.initializeDefault(new AbortController().signal))
      .resolves.toBeUndefined()
    vi.spyOn(ctx.workspaceRegistry, 'initializeDefault').mockRejectedValueOnce(new Error('permission denied'))
    await expect(controller.initializeDefault(new AbortController().signal))
      .rejects.toThrow('permission denied')
  })
})
