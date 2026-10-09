import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { initProject } from '../src/store.ts'
import {
  readAipmProjectView,
  readAipmProjectViews,
  type ProjectScanOptions,
  type WorkspaceProjectSource,
} from '../src/project-view.ts'

const roots: string[] = []
const options: ProjectScanOptions = { maxDepth: 4, maxFiles: 100 }

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'aipm-project-view-'))
  roots.push(root)
  return root
}

function workspace(path: string, id = '00000000-0000-4000-8000-000000000001'): WorkspaceProjectSource {
  return {
    id: WorkspaceId(id),
    path,
    title: 'folder-name',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
    sessionIds: [SessionId('session-one')],
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('AIPM unified project view', () => {
  it('prefers the AIPM name and separates materials from stage outputs', async () => {
    const root = await temporaryRoot()
    await initProject(root, { name: '轻颜相机', summary: 'AI 美颜产品' }, new Date('2026-10-03T00:00:00.000Z'))
    await mkdir(join(root, '资料'), { recursive: true })
    await writeFile(join(root, '资料', '用户访谈.md'), 'material')
    await writeFile(join(root, '01-立项', '竞品分析.md'), 'output')
    await mkdir(join(root, '.git'), { recursive: true })
    await writeFile(join(root, '.git', 'config'), 'internal')
    await writeFile(join(root, 'AGENTS.md'), 'internal instructions')

    const view = await readAipmProjectView(workspace(root), options)

    expect(view.name).toBe('轻颜相机')
    expect(view.nameSource).toBe('aipm')
    expect(view.summary).toBe('AI 美颜产品')
    expect(view.initialized).toBe(true)
    expect(view.health).toBe('ok')
    expect(view.materials.map(file => file.relativePath)).toEqual([join('资料', '用户访谈.md')])
    expect(view.outputs.map(file => [file.relativePath, file.stage])).toEqual([
      [join('01-立项', '竞品分析.md'), '01-立项'],
    ])
  })

  it('keeps an ordinary Workspace visible without inventing AIPM state', async () => {
    const root = await temporaryRoot()
    await writeFile(join(root, 'brief.md'), 'brief')

    const view = await readAipmProjectView(workspace(root), options)

    expect(view.name).toBe('folder-name')
    expect(view.nameSource).toBe('workspace')
    expect(view.initialized).toBe(false)
    expect(view.state).toBeUndefined()
    expect(view.materials.map(file => file.name)).toEqual(['brief.md'])
  })

  it('reports a missing directory without dropping the durable Workspace', async () => {
    const root = await temporaryRoot()
    await rm(root, { recursive: true })

    const view = await readAipmProjectView(workspace(root), options)

    expect(view.health).toBe('error')
    expect(view.issues.map(issue => issue.code)).toEqual(['missing-directory'])
    expect(view.sessionIds).toEqual([SessionId('session-one')])
  })

  it('falls back to the Workspace name and still scans files when AIPM state is invalid', async () => {
    const root = await temporaryRoot()
    await mkdir(join(root, '.aipm'))
    await writeFile(join(root, '.aipm', 'project.json'), '{broken')
    await writeFile(join(root, '材料.md'), 'material')

    const view = await readAipmProjectView(workspace(root), options)

    expect(view.name).toBe('folder-name')
    expect(view.initialized).toBe(true)
    expect(view.health).toBe('error')
    expect(view.issues.map(issue => issue.code)).toEqual(['invalid-state'])
    expect(view.materials.map(file => file.name)).toEqual(['材料.md'])
  })

  it('preserves Workspace order and identity when display names match', async () => {
    const first = await temporaryRoot()
    const second = await temporaryRoot()
    const sources = [
      workspace(first, '00000000-0000-4000-8000-000000000001'),
      workspace(second, '00000000-0000-4000-8000-000000000002'),
    ]

    const views = await readAipmProjectViews(sources, options)

    expect(views.map(view => view.id)).toEqual(sources.map(source => source.id))
    expect(views.map(view => view.name)).toEqual(['folder-name', 'folder-name'])
  })

  it('reports bounded scans without treating them as a project failure', async () => {
    const root = await temporaryRoot()
    await writeFile(join(root, 'a.md'), 'a')
    await writeFile(join(root, 'b.md'), 'b')

    const view = await readAipmProjectView(workspace(root), { maxDepth: 1, maxFiles: 1 })

    expect(view.health).toBe('warning')
    expect(view.issues.map(issue => issue.code)).toEqual(['scan-limit-reached'])
    expect(view.materials).toHaveLength(1)
  })
})
