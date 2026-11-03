// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { WorkspaceId, WorkspaceSnapshot, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { ProjectsPanel } from '../src/client/AipmPanels.tsx'
import { zh } from '../src/client/locales.ts'
import type { ProjectView } from '../src/client/project-reader.ts'

afterEach(cleanup)

function project(id: string, name: string, initialized: boolean): ProjectView {
  const workspace: WorkspaceView = {
    workspaceId: id as WorkspaceId, path: `/work/${id}`, title: name,
    sessionIds: [], createdAt: '', updatedAt: '',
  }
  return { workspace, name, summary: '', initialized, materials: [], outputs: [], issues: [] }
}

function catalog(initial: readonly ProjectView[]) {
  let rows = initial
  const snapshot = (): WorkspaceSnapshot => ({
    items: rows.map(row => row.workspace), archivedSessionIds: [], pinnedSessionIds: [],
    state: 'idle', phase: 'ready', error: null,
  })
  let workspaces = snapshot()
  const sessions: SessionListState = { ids: [], byId: {}, phase: 'ready', projectionsBySession: {} }
  const unused = (() => { throw new Error('unused hook') }) as never
  const props: Parameters<typeof ProjectsPanel>[0] = {
    useWorkspaces: selector => selector(workspaces), useSessions: selector => selector(sessions),
    useSessionRetainInfo: unused, useSessionStatus: unused, useResource: unused, usePanelInfo: unused,
    readProject: vi.fn(async (workspace: WorkspaceView) => {
      const row = rows.find(item => item.workspace.workspaceId === workspace.workspaceId)
      if (row === undefined) throw new Error('fixture Workspace missing')
      return row
    }),
    renameProject: vi.fn(async (id: WorkspaceId, name: string) => {
      rows = rows.map(row => row.workspace.workspaceId !== id ? row : { ...row, name,
        workspace: { ...row.workspace, title: name },
        ...(row.state === undefined ? {} : { state: { ...row.state, name } }),
      })
      workspaces = snapshot()
    }),
    startWorkspaceSession: vi.fn(), openProjectFile: vi.fn(), downloadHandoff: vi.fn(async () => {}),
    reviewProjectPlan: vi.fn(async () => {}),
    openProjectSession: vi.fn(), t: makeTranslate(zh),
  }
  const view = render(<ProjectsPanel {...props} />)
  return {
    renameProject: props.renameProject,
    update(next: readonly ProjectView[]) {
      rows = next
      workspaces = snapshot()
      view.rerender(<ProjectsPanel {...props} />)
    },
  }
}

describe('saved project catalog', () => {
  it('edits the generated name, persists it through refresh and updates its project card', async () => {
    const saved = { ...project('saved', '自动项目名', true), state: { name: '自动项目名', summary: '', createdAt: '', stages: {} } }
    const view = catalog([saved])
    fireEvent.click(await screen.findByRole('button', { name: '打开项目 自动项目名' }))
    fireEvent.click(screen.getByRole('button', { name: '修改项目名称' }))
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: '项目名称' })
    expect(input.value).toBe('自动项目名')
    fireEvent.change(input, { target: { value: '  我的记账本  ' } })
    fireEvent.submit(input.closest('form')!)
    await screen.findByRole('heading', { name: '我的记账本' })
    expect(view.renameProject).toHaveBeenCalledExactlyOnceWith('saved', '我的记账本')
    fireEvent.click(screen.getByRole('button', { name: '返回项目' }))
    await screen.findByRole('button', { name: '打开项目 我的记账本' })
    expect(screen.queryByRole('button', { name: '打开项目 自动项目名' })).toBeNull()
    expect(screen.getAllByRole('button').map(button => button.getAttribute('aria-label')).filter(Boolean))
      .toMatchInlineSnapshot(`
        [
          "刷新项目数据",
          "打开项目 我的记账本",
        ]
      `)
  })

  it('cancels with Escape and refuses blank names without saving', async () => {
    const view = catalog([{ ...project('saved', '原名称', true), state: { name: '原名称', summary: '', createdAt: '', stages: {} } }])
    fireEvent.click(await screen.findByRole('button', { name: '打开项目 原名称' }))
    fireEvent.click(screen.getByRole('button', { name: '修改项目名称' }))
    const input = screen.getByRole('textbox', { name: '项目名称' })
    fireEvent.change(input, { target: { value: '   ' } })
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '保存' }).disabled).toBe(true)
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.getByRole('heading', { name: '原名称' })).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(view.renameProject).not.toHaveBeenCalled()
  })

  it('retains the entered name after a failed save and allows retry', async () => {
    const view = catalog([{ ...project('saved', '原名称', true), state: { name: '原名称', summary: '', createdAt: '', stages: {} } }])
    vi.mocked(view.renameProject).mockRejectedValueOnce(new Error('这个名称已被使用，请换一个'))
    fireEvent.click(await screen.findByRole('button', { name: '打开项目 原名称' }))
    fireEvent.click(screen.getByRole('button', { name: '修改项目名称' }))
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: '项目名称' })
    fireEvent.change(input, { target: { value: '新名称' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', '这个名称已被使用，请换一个')
    expect(input.value).toBe('新名称')
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '保存' }).disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await screen.findByRole('heading', { name: '新名称' })
  })

  it('keeps project cards unchanged when new conversations add draft Workspaces', async () => {
    const saved = project('saved', '收入记账', true)
    const draft = project('draft', '新想法 · abc', false)
    const other = project('another', '随便起的名字', false)
    const view = catalog([saved])
    await screen.findByRole('button', { name: '打开项目 收入记账' })
    view.update([saved, draft, other])
    await screen.findByRole('button', { name: '打开项目 收入记账' })
    expect(screen.getAllByRole('button', { name: /^打开项目 / }).map(button => button.getAttribute('aria-label')))
      .toMatchInlineSnapshot(`
        [
          "打开项目 收入记账",
        ]
      `)
    expect(screen.queryByRole('button', { name: '打开项目 新想法 · abc' })).toBeNull()
    expect(screen.queryByRole('button', { name: '打开项目 随便起的名字' })).toBeNull()
  })

  it('adds a project only after its draft is registered, regardless of its name', async () => {
    const draft = project('draft', '新想法 · abc', false)
    const view = catalog([draft])
    await screen.findByText(zh['projects.empty'])
    view.update([{ ...draft, initialized: true }])
    await screen.findByRole('button', { name: '打开项目 新想法 · abc' })
    expect(screen.getAllByRole('button', { name: /^打开项目 / })).toHaveLength(1)
  })

  it('keeps a registered project with invalid metadata available for inspection', async () => {
    const invalid = { ...project('invalid', '已有项目', true), issues: [{ code: 'state-invalid' as const, message: 'Invalid JSON' }] }
    catalog([invalid, project('draft', '草稿', false)])
    await screen.findByRole('button', { name: '打开项目 已有项目' })
    expect(screen.queryByRole('button', { name: '打开项目 草稿' })).toBeNull()
  })
})
