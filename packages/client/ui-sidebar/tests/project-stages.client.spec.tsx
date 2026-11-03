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
      stages: { '01-立项': { status: 'done' }, '02-需求分析': { status: 'in_progress' }, '03-PRD': { status: 'done' } },
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
    readProject: vi.fn(async () => project), renameProject: vi.fn(async () => {}), startWorkspaceSession: vi.fn(),
    openProjectFile: vi.fn(), downloadHandoff: vi.fn(async () => {}), reviewProjectPlan: vi.fn(async () => {}), openProjectSession: vi.fn(),
    t: makeTranslate(dictionary),
  }
  render(<ProjectsPanel {...props} />)
  fireEvent.click(await screen.findByRole('button', { name: makeTranslate(dictionary)('projects.open', { name: project.name }) }))
  return props
}

describe('project stage progress', () => {
  it('shows stage names and recorded status without directory numbering', async () => {
    await mountProject()
    const list = screen.getByRole('list')
    const rows = within(list).getAllByRole('listitem')
    expect(rows.map(row => within(row).getByRole('button').getAttribute('aria-label'))).toMatchInlineSnapshot(`
      [
        "立项 · 已有产出",
        "需求分析 · 进行中",
        "PRD · 已有产出",
      ]
    `)
    expect(within(list).queryByText('01')).toBeNull()
    expect(within(list).getByText('进行中')).toBeDefined()
    expect(within(rows[0]!).getByRole('button').querySelector('svg')).not.toBeNull()
    expect(within(rows[1]!).getByRole('button').getAttribute('data-status')).toBe('in_progress')
    expect(screen.queryByRole('button', { name: '原型 · 未开始' })).toBeNull()
    expect(screen.getByText('已开展 3 个阶段')).toBeDefined()
    expect(rows[2]?.textContent).toContain('已有产出')
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

  it('keeps recorded progress separate from legacy document folders', async () => {
    await mountProject({ state: { name: '', summary: '', createdAt: '', stages: { '01-立项': { status: 'not_started' } } } })
    expect(screen.queryByRole('region', { name: '项目阶段' })).toBeNull()
    expect(screen.getByRole('region', { name: '项目文档' })).toBeDefined()
  })
})

describe('logical project documents', () => {
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
    expect(tree.textContent).toContain('9 份文档')
    for (const file of [...outputs, { name: '访谈.md' }, { name: '参考.pdf' }]) {
      expect(within(tree).getAllByText(file.name.replace(/\.[^.]+$/, ''))).toHaveLength(1)
    }
    expect([...tree.querySelectorAll('details')].every(history => !history.open)).toBe(true)
    expect(tree.textContent).not.toContain('01-立项')
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

  it('opens the current document and an older revision without exposing storage folders', async () => {
    const reader = SessionId('reader')
    const outputs = [1, 2].map(version => ({ name: '方案.md', relativePath: `03-PRD/Agent工坊/V${version}/方案.md`,
      extension: 'md', kind: 'output' as const }))
    const props = await mountProject({ readerSessionId: reader, outputs })
    const region = screen.getByRole('region', { name: '项目文档' })
    expect(region.textContent).toContain('1 份文档')
    expect(region.textContent).toContain('当前版本 V2')
    expect(region.textContent).not.toContain('Agent工坊')
    fireEvent.click(within(region).getByRole('button', { name: '打开 阶段测试 中的 方案.md' }))
    expect(props.openProjectFile).toHaveBeenLastCalledWith(reader, '/work/stages', '03-PRD/Agent工坊/V2/方案.md')
    fireEvent.click(within(region).getByText('历史版本（2）'))
    fireEvent.click(within(region).getByRole('button', { name: '打开 技术方案 的 V1 版本' }))
    expect(props.openProjectFile).toHaveBeenLastCalledWith(reader, '/work/stages', '03-PRD/Agent工坊/V1/方案.md')
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


describe('manual plan review', () => {
  it('starts a review for the exact plan identity without opening or rewriting a file', async () => {
    const props = await mountProject({ outputs: [], documents: [{ id: 'plan-exact', title: '账本方案', kind: 'plan', material: false,
      revisions: [{ version: 3, file: { name: '方案.md', relativePath: '文档/plan/V3/方案.md', extension: 'md', kind: 'output' },
        source: 'conversation', change: '', createdAt: '' }] }] })
    fireEvent.click(screen.getByRole('button', { name: '审查方案' }))
    expect(props.reviewProjectPlan).toHaveBeenCalledWith('stages-test', 'plan-exact', '账本方案', 3)
    expect(props.openProjectFile).not.toHaveBeenCalled()
    expect(props.startWorkspaceSession).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Review plan' })).toBeNull()
  })
})
