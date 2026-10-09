import type { WorkspaceId, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { WorkspaceDirectoryListing } from '@deepseek-ai/dsh-api-workspace-files/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { describe, expect, it, vi } from 'vitest'
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

  it('keeps an unread project visible until it has a Session', async () => {
    const list = vi.fn<ProjectFilesRemote['list']>()
    const read = vi.fn<ProjectFilesRemote['read']>()

    const project = await readProjectView({ list, read }, WORKSPACE, undefined, new AbortController().signal)

    expect(project).toMatchObject({ name: 'Workspace title', initialized: false, outputs: [], materials: [] })
    expect(project.issues).toEqual([expect.objectContaining({ code: 'session-required' })])
    expect(list).not.toHaveBeenCalled()
    expect(read).not.toHaveBeenCalled()
  })

  it('rejects an unrelated JSON document as project state', () => {
    expect(() => parseProjectStateView('{"schemaVersion":2,"name":"old"}'))
      .toThrow('project.json')
  })
})
