import type { WorkspaceId, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { WorkspaceDirectoryListing } from '@deepseek-ai/dsh-api-workspace-files/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { describe, expect, it, vi } from 'vitest'
import { RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import {
  parseProjectStateView,
  readProjectView,
  type ProjectFilesRemote,
} from '../src/client/project-reader.ts'

const SESSION = 'session-project' as SessionId
const PRODUCER_SESSION = 'session-producer' as SessionId

const WORKSPACE: WorkspaceView = {
  workspaceId: 'workspace-project' as WorkspaceId,
  path: '/work/project',
  title: 'Workspace title',
  sessionIds: [SESSION, PRODUCER_SESSION],
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
}

function listing(path: string, entries: WorkspaceDirectoryListing['entries']): WorkspaceDirectoryListing {
  return { path, entries, truncated: false }
}

describe('Nini Flow project reader', () => {
  it('uses project metadata and classifies stage files as outputs', async () => {
    const directories: Record<string, WorkspaceDirectoryListing> = {
      '.': listing('', [
        { name: '.aipm', type: 'directory' },
        { name: '01-立项', type: 'directory' },
        { name: '背景资料.pdf', type: 'file', size: 30 },
        { name: 'AGENTS.md', type: 'file', size: 10 },
      ]),
      '01-立项': listing('01-立项', [
        { name: '04-竞品分析.md', type: 'file', size: 120 },
        { name: '04-竞品分析.html', type: 'file', size: 300 },
      ]),
    }
    const list = vi.fn<ProjectFilesRemote['list']>(async (_sessionId, path) => ({
      ok: true,
      value: directories[path] ?? listing(path, []),
    }))
    const read = vi.fn<ProjectFilesRemote['read']>(async () => ({
      ok: true,
      value: {
        absolutePath: '/work/project/.aipm/project.json',
        version: 'v1',
        offset: 1,
        lines: 1,
        eof: true,
        text: JSON.stringify({
          schemaVersion: 1,
          name: '轻颜相机',
          summary: 'AI 相机产品',
          createdAt: '2026-10-01T00:00:00.000Z',
          lastStage: '01-立项',
          stages: {
            '01-立项': {
              status: 'done',
              note: '完成竞品分析',
              sessionId: PRODUCER_SESSION,
            },
          },
        }),
      },
    }))

    const project = await readProjectView({ list, read }, WORKSPACE, SESSION, new AbortController().signal)

    expect(project).toMatchObject({
      name: '轻颜相机',
      summary: 'AI 相机产品',
      initialized: true,
      readerSessionId: SESSION,
    })
    expect(project.materials.map(file => file.relativePath)).toEqual(['背景资料.pdf'])
    expect(project.outputs.map(file => file.relativePath)).toEqual([
      '01-立项/04-竞品分析.html',
      '01-立项/04-竞品分析.md',
    ])
    expect(project.outputs.every(file => file.stage?.id === '01-立项')).toBe(true)
    expect(project.outputs.every(file => file.sessionId === PRODUCER_SESSION)).toBe(true)
    expect(list.mock.calls.map(call => call[1])).toEqual(['.', '01-立项'])
    expect(read).toHaveBeenCalledWith(SESSION, '.aipm/project.json', { offset: 1, limit: 5000 }, expect.any(AbortSignal))
  })

  it('hides internal revision records from documents and counts while keeping user JSON files', async () => {
    const directories: Record<string, WorkspaceDirectoryListing> = {
      '.': listing('', [
        { name: '.aipm', type: 'directory' }, { name: '03-PRD', type: 'directory' }, { name: '用户资料.json', type: 'file' },
      ]),
      '03-PRD': listing('03-PRD', [{ name: 'Agent工坊', type: 'directory' }]),
      '03-PRD/Agent工坊': listing('03-PRD/Agent工坊', [{ name: 'V1', type: 'directory' }, { name: 'V2', type: 'directory' }]),
      '03-PRD/Agent工坊/V1': listing('03-PRD/Agent工坊/V1', [
        { name: '方案.md', type: 'file' }, { name: '.workshop.json', type: 'file' }, { name: '接口示例.json', type: 'file' },
      ]),
      '03-PRD/Agent工坊/V2': listing('03-PRD/Agent工坊/V2', [
        { name: 'PRD.md', type: 'file' }, { name: '.workshop.json', type: 'file' },
      ]),
    }
    const list = vi.fn<ProjectFilesRemote['list']>(async (_id, path) => ({ ok: true, value: directories[path] ?? listing(path, []) }))
    const read = vi.fn<ProjectFilesRemote['read']>(async () => ({ ok: true, value: {
      absolutePath: '/work/project/.aipm/project.json', version: 'v1', offset: 1, lines: 1, eof: true,
      text: JSON.stringify({ schemaVersion: 1, name: '一句话记账', createdAt: '', stages: {} }),
    } }))
    const project = await readProjectView({ list, read }, WORKSPACE, SESSION, new AbortController().signal)
    expect(project.initialized).toBe(true)
    expect(project.materials.map(file => file.name)).toEqual(['用户资料.json'])
    expect(project.outputs).toHaveLength(3)
    expect(project.outputs.map(file => file.relativePath).sort()).toEqual([
      '03-PRD/Agent工坊/V1/方案.md', '03-PRD/Agent工坊/V1/接口示例.json', '03-PRD/Agent工坊/V2/PRD.md',
    ].sort())
    expect(read).toHaveBeenCalledExactlyOnceWith(SESSION, '.aipm/project.json', { offset: 1, limit: 5000 }, expect.any(AbortSignal))
    expect(list.mock.calls.some(call => call[1] === '.aipm')).toBe(false)
  })

  it('keeps an unread project visible until it has a Session', async () => {
    const list = vi.fn<ProjectFilesRemote['list']>()
    const read = vi.fn<ProjectFilesRemote['read']>()

    const project = await readProjectView({ list, read }, WORKSPACE, undefined, new AbortController().signal)

    expect(project).toMatchObject({ name: 'Workspace title', initialized: false, outputs: [], materials: [] })
    expect(project.issues).toEqual([expect.objectContaining({ code: 'session-required' })])
    expect(list).not.toHaveBeenCalled()
    expect(read).not.toHaveBeenCalled()
  })

  it('treats an absent project marker as a draft even when other files exist', async () => {
    const list = vi.fn<ProjectFilesRemote['list']>(async () => ({
      ok: true, value: listing('', [{ name: 'note.md', type: 'file', size: 12 }]),
    }))
    const read = vi.fn<ProjectFilesRemote['read']>(async () => ({
      ok: false, error: new RemoteError('workspace-file/not-found', 'not found', { path: '.aipm/project.json' }),
    }))
    const value = await readProjectView({ list, read }, WORKSPACE, SESSION, new AbortController().signal)
    expect(value.initialized).toBe(false)
    expect(value.materials.map(file => file.name)).toEqual(['note.md'])
  })

  it('keeps existing invalid metadata distinct from an unregistered draft', async () => {
    const list = vi.fn<ProjectFilesRemote['list']>(async () => ({ ok: true, value: listing('', []) }))
    const read = vi.fn<ProjectFilesRemote['read']>(async () => ({
      ok: true, value: { absolutePath: '/work/project/.aipm/project.json', version: 'v1', offset: 1, lines: 1, eof: true, text: '{invalid' },
    }))
    const value = await readProjectView({ list, read }, WORKSPACE, SESSION, new AbortController().signal)
    expect(value.initialized).toBe(true)
    expect(value.issues).toEqual([expect.objectContaining({ code: 'state-invalid' })])
  })

  it('rejects an unrelated JSON document as project state', () => {
    expect(() => parseProjectStateView('{"schemaVersion":2,"name":"old"}'))
      .toThrow('project.json')
  })
})

describe('managed document catalog pages', () => {
  it.each([false, true])('reads within provider page limits and rejects mixed versions (changed=%s)', async (changed) => {
    const path = '文档/d-one/V1-abc/PRD.md'
    const catalog = JSON.stringify({ schemaVersion: 1, documents: [{ id: 'doc-one', title: '需求文档', kind: 'prd', revisions: [{
      version: 1, path, fileName: 'PRD.md', createdAt: '', source: 'conversation', change: '创建文档',
    }] }] })
    const tree: Record<string, WorkspaceDirectoryListing['entries']> = {
      '.': [{ name: '文档', type: 'directory' }],
      '文档': [{ name: 'd-one', type: 'directory' }],
      '文档/d-one': [{ name: 'V1-abc', type: 'directory' }],
      '文档/d-one/V1-abc': [{ name: 'PRD.md', type: 'file' }],
    }
    const list = vi.fn<ProjectFilesRemote['list']>(async (_id, path) => ({ ok: true, value: listing(path, tree[path] ?? []) }))
    const read = vi.fn<ProjectFilesRemote['read']>(async (_id, path, range) => ({ ok: true, value: {
      absolutePath: '/work/project/' + path, version: changed && range.offset === 2 ? 'v2' : 'v1',
      offset: range.offset ?? 1, lines: 1,
      eof: path === '.aipm/project.json' || range.offset === 2,
      text: path === '.aipm/project.json' ? '{"schemaVersion":1,"name":"项目","stages":{}}'
        : range.offset === 1 ? '{' : catalog.slice(1),
    } }))
    const result = await readProjectView({ list, read }, WORKSPACE, SESSION, new AbortController().signal)
    expect(read.mock.calls.filter(call => call[1] === '.aipm/documents.json').map(call => call[2])).toEqual([{ offset: 1 }, { offset: 2 }])
    if (changed) expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'documents-invalid' })]))
    else {
      expect(result.documents).toHaveLength(1)
      expect(result.documents?.[0]?.revisions[0]?.file.relativePath).toBe(path)
      expect(result.issues).toEqual([])
    }
  })
})
