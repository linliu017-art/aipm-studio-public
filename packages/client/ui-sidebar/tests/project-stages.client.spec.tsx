// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { WorkspaceId, WorkspaceSnapshot, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { ProjectsPanel } from '../src/client/AipmPanels.tsx'
import { en, zh } from '../src/client/locales.ts'
import { PROJECT_STAGES, type ProjectView } from '../src/client/project-reader.ts'

afterEach(cleanup)

async function mountProject(overrides: Partial<ProjectView> = {}, dictionary = zh) {
  const workspace: WorkspaceView = {
    workspaceId: 'stages-test' as WorkspaceId, title: '阶段测试', path: '/work/stages',
    sessionIds: [], createdAt: '', updatedAt: '',
  }
  const project: ProjectView = {
    workspace, name: '阶段测试', summary: '', initialized: true, materials: [], issues: [],
    state: {
      name: '阶段测试', summary: '', createdAt: '',
      stages: { '02-需求分析': { status: 'in_progress' }, '03-PRD': { status: 'done' } },
    },
    outputs: [{ name: '方案.md', relativePath: '01-立项/方案.md', extension: 'md', kind: 'output', stage: PROJECT_STAGES[0]! }],
    ...overrides,
  }
  const workspaces: WorkspaceSnapshot = {
    items: [workspace], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
  }
  const sessions: SessionListState = { ids: [], byId: {}, phase: 'ready', projectionsBySession: {} }
  const unused = (() => { throw new Error('unused hook') }) as never
  const props: Parameters<typeof ProjectsPanel>[0] = {
    useWorkspaces: selector => selector(workspaces), useSessions: selector => selector(sessions),
    useSessionRetainInfo: unused, useSessionStatus: unused, useResource: unused, usePanelInfo: unused,
    readProject: vi.fn(async () => project), startWorkspaceSession: vi.fn(), openProjectFile: vi.fn(),
    t: makeTranslate(dictionary),
  }
  render(<ProjectsPanel {...props} />)
  fireEvent.click(await screen.findByRole('button', { name: makeTranslate(dictionary)('projects.open', { name: project.name }) }))
  return props
}

describe('project stage status numbers', () => {
  it('puts localized status on the numbered controls without a trailing status column', async () => {
    await mountProject()
    const list = screen.getByRole('list')
    const rows = within(list).getAllByRole('listitem')
    expect(rows.map((row) => {
      const number = within(row).getByRole('button')
      return `${number.textContent}: ${number.getAttribute('aria-label')}`
    }).join('\n')).toMatchInlineSnapshot(`
      "01: 立项 · 已有产出
      02: 需求分析 · 进行中
      03: PRD · 已有产出"
    `)
    expect(within(list).queryByText('未开始')).toBeNull()
    expect(within(list).queryByText('进行中')).toBeNull()
    expect(within(list).queryByText('已有产出')).toBeNull()
    expect(within(rows[0]!).getByRole('button').querySelector('svg')).not.toBeNull()
    expect(within(rows[1]!).getByRole('button').getAttribute('data-status')).toBe('in_progress')
    expect(screen.queryByRole('button', { name: '原型 · 未开始' })).toBeNull()
    expect(screen.getByText('已开展 3 个阶段')).toBeDefined()
    expect(rows[2]?.textContent).toContain('0 个文件')
  })

  it('shows the status hint on hover and removes it when the pointer leaves', async () => {
    await mountProject()
    const list = screen.getByRole('list')
    const number = within(list).getByRole('button', { name: '需求分析 · 进行中' })
    fireEvent.mouseEnter(number)
    expect(await screen.findByRole('tooltip')).toHaveProperty('textContent', '进行中')
    fireEvent.mouseLeave(number)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('omits the stage section when every stage is unstarted and there are no outputs', async () => {
    await mountProject({ outputs: [], state: { name: '', summary: '', createdAt: '', stages: {} } })
    expect(screen.queryByRole('region', { name: '项目阶段' })).toBeNull()
    expect(screen.getByRole('region', { name: '项目文档' }).textContent).toContain('这个项目还没有文件')
  })

  it('keeps stages with files even when their saved state says not started', async () => {
    await mountProject({ state: { name: '', summary: '', createdAt: '', stages: { '01-立项': { status: 'not_started' } } } })
    const list = screen.getByRole('list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    expect(within(list).getByRole('button', { name: '立项 · 已有产出' })).toBeDefined()
  })
})

describe('unified project document tree', () => {
  it('shows all outputs and materials once, without the redundant tabs or output column', async () => {
    const outputs = Array.from({ length: 7 }, (_, index) => ({
      name: `report-${index}.md`, relativePath: `01-立项/reports/report-${index}.md`,
      extension: 'md', kind: 'output' as const, stage: PROJECT_STAGES[0]!,
    }))
    await mountProject({ outputs, materials: [
      { name: '访谈.md', relativePath: 'materials/访谈.md', extension: 'md', kind: 'material' },
      { name: '参考.pdf', relativePath: '参考.pdf', extension: 'pdf', kind: 'material' },
    ] })
    const tree = screen.getByRole('region', { name: '项目文档' })
    expect(within(tree).getAllByRole('button')).toHaveLength(9)
    expect(tree.textContent).toContain('9 个文件')
    for (const file of [...outputs, { name: '访谈.md' }, { name: '参考.pdf' }]) {
      expect(within(tree).getAllByText(file.name)).toHaveLength(1)
    }
    expect([...tree.querySelectorAll('details')].every(folder => folder.open)).toBe(true)
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.queryByRole('heading', { name: '项目产出' })).toBeNull()
    const markdown = within(tree).getByRole('button', { name: '打开 阶段测试 中的 report-0.md' }).querySelector('svg')
    expect(markdown?.getAttribute('fill')).toBe('none')
    expect(markdown?.querySelector('path')?.getAttribute('stroke')).toBe('currentColor')
  })

  it('preserves producing-session and reader-session file opening', async () => {
    const producing = SessionId('producing-session')
    const reader = SessionId('reader-session')
    const props = await mountProject({ readerSessionId: reader,
      outputs: [{ name: '方案.md', relativePath: '01-立项/方案.md', extension: 'md', kind: 'output', stage: PROJECT_STAGES[0]!, sessionId: producing }],
      materials: [{ name: '材料.md', relativePath: 'materials/材料.md', extension: 'md', kind: 'material' }],
    })
    fireEvent.click(screen.getByRole('button', { name: '打开 阶段测试 中的 方案.md' }))
    expect(props.openProjectFile).toHaveBeenCalledWith(producing, '/work/stages', '01-立项/方案.md')
    fireEvent.click(screen.getByRole('button', { name: '打开 阶段测试 中的 材料.md' }))
    expect(props.openProjectFile).toHaveBeenCalledWith(reader, '/work/stages', 'materials/材料.md')
    expect(screen.getByRole('heading', { name: '项目文档' })).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '在此项目中新建对话' }))
    expect(props.startWorkspaceSession).toHaveBeenCalledWith('stages-test')
  })

  it('does not open a file without an available session', async () => {
    const props = await mountProject()
    fireEvent.click(screen.getByRole('button', { name: '打开 阶段测试 中的 方案.md' }))
    expect(props.openProjectFile).not.toHaveBeenCalled()
  })

  it('localizes the merged document section and active stage count', async () => {
    await mountProject({}, en)
    expect(screen.getByRole('region', { name: 'Project documents' })).toBeDefined()
    expect(screen.getByText('3 active stages')).toBeDefined()
  })
})
