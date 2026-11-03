// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { WorkspaceId, WorkspaceSnapshot, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { WorkshopPanel } from '../src/client/WorkshopPanel.tsx'
import { en, zh } from '../src/client/locales.ts'
import type { ProjectView } from '../src/client/project-reader.ts'

afterEach(cleanup)

function project(id: string, name: string, workshop = false, initialized = true): ProjectView {
  const workspace: WorkspaceView = { workspaceId: id as WorkspaceId, path: '/work/' + id, title: name,
    sessionIds: [], createdAt: '', updatedAt: '' }
  return { workspace, name, summary: '', initialized, materials: [], issues: [], outputs: workshop
    ? [{ name: 'PRD.md', relativePath: '03-PRD/Agent工坊/V1/PRD.md', extension: 'md', kind: 'output' }] : [] }
}

function mount(projects: readonly ProjectView[] = [], dictionary = zh) {
  const workspaces: WorkspaceSnapshot = { items: projects.map(item => item.workspace), archivedSessionIds: [], pinnedSessionIds: [],
    phase: 'ready', state: 'idle', error: null }
  const sessions: SessionListState = { ids: [], byId: {}, phase: 'ready', projectionsBySession: {} }
  const unused = (() => { throw new Error('unused hook') }) as never
  const props: Parameters<typeof WorkshopPanel>[0] = {
    useWorkspaces: selector => selector(workspaces), useSessions: selector => selector(sessions),
    useSessionRetainInfo: unused, useSessionStatus: unused, useResource: unused, usePanelInfo: unused,
    readProject: vi.fn(async (workspace: WorkspaceView) => {
      const row = projects.find(item => item.workspace.workspaceId === workspace.workspaceId)
      if (row === undefined) throw new Error('fixture project missing')
      return row
    }),
    startWorkshop: vi.fn(async () => {}), t: makeTranslate(dictionary),
  }
  const view = render(<WorkshopPanel {...props} />)
  return { view, props }
}

describe('Agent Workshop entry', () => {
  it('opens, changes modes and refreshes without launching a chat or registering a project', async () => {
    const { props } = mount([project('saved', '已有项目')])
    expect(screen.getByRole('heading', { name: 'Agent 工坊' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /基于已有材料/ }))
    await screen.findByRole('option', { name: '已有项目' })
    fireEvent.click(screen.getByRole('button', { name: '刷新工坊项目' }))
    fireEvent.click(screen.getByRole('button', { name: /继续迭代/ }))
    await screen.findByText(zh['workshop.project.noVersions'])
    expect(props.startWorkshop).not.toHaveBeenCalled()
    expect((screen.getByRole('button', { name: '开始工坊任务' })).hasAttribute('disabled')).toBe(true)
  })

  it('prepares only the chosen deliverable for a new idea without inferring an existing project', () => {
    const { props } = mount([project('old', '旧产品')])
    fireEvent.change(screen.getByLabelText('说说你的想法'), { target: { value: '  做一个 AI 收入助手  ' } })
    fireEvent.change(screen.getByLabelText('本次产出'), { target: { value: 'plan' } })
    fireEvent.click(screen.getByRole('button', { name: '开始工坊任务' }))
    expect(props.startWorkshop).toHaveBeenCalledExactlyOnceWith({ mode: 'idea', task: '做一个 AI 收入助手', output: 'plan' })
  })

  it('uses an explicitly selected project for its materials and never lists draft workspaces', async () => {
    const { props } = mount([project('saved', '已保存的产品'), project('draft', '新想法', false, false)])
    fireEvent.click(screen.getByRole('button', { name: /基于已有材料/ }))
    await screen.findByRole('option', { name: '已保存的产品' })
    const select = screen.getByLabelText<HTMLSelectElement>('选择项目')
    expect(select.options[0]?.disabled).toBe(true)
    expect(select.options[0]?.hidden).toBe(true)
    expect(Array.from(select.options).filter(option => !option.disabled).map(option => option.textContent)).toEqual(['已保存的产品'])
    expect(screen.queryByRole('option', { name: '新想法' })).toBeNull()
    fireEvent.change(screen.getByLabelText('选择项目'), { target: { value: 'saved' } })
    fireEvent.click(screen.getByRole('button', { name: '开始工坊任务' }))
    expect(props.startWorkshop).toHaveBeenCalledExactlyOnceWith({ mode: 'materials', task: '', output: 'both', workspaceId: 'saved' })
  })

  it('offers only projects with Workshop outputs for iteration and requires an explicit project choice', async () => {
    const { props } = mount([project('normal', '普通产品'), project('workshop', '工坊产品', true)])
    fireEvent.click(screen.getByRole('button', { name: /继续迭代/ }))
    await screen.findByRole('option', { name: '工坊产品' })
    expect(screen.queryByRole('option', { name: '普通产品' })).toBeNull()
    const select = screen.getByLabelText<HTMLSelectElement>('选择项目')
    expect(select.required).toBe(true)
    expect(select.options[0]?.disabled).toBe(true)
    expect(select.options[0]?.hidden).toBe(true)
    expect(select.value).toBe('')
    fireEvent.change(screen.getByLabelText('这次想改什么'), { target: { value: '增加客户筛选' } })
    expect((screen.getByRole('button', { name: '开始工坊任务' })).hasAttribute('disabled')).toBe(true)
    fireEvent.change(screen.getByLabelText('选择项目'), { target: { value: 'workshop' } })
    fireEvent.change(screen.getByLabelText('本次产出'), { target: { value: 'prd' } })
    fireEvent.click(screen.getByRole('button', { name: '开始工坊任务' }))
    expect(props.startWorkshop).toHaveBeenCalledExactlyOnceWith({ mode: 'iterate', task: '增加客户筛选', output: 'prd', workspaceId: 'workshop' })
  })

  it('can clear an optional project without turning the placeholder into an option', async () => {
    const { props } = mount([project('saved', '已有项目')])
    fireEvent.click(screen.getByRole('button', { name: /基于已有材料/ }))
    await screen.findByRole('option', { name: '已有项目' })
    const select = screen.getByLabelText<HTMLSelectElement>('选择项目')
    fireEvent.change(select, { target: { value: 'saved' } })
    fireEvent.click(screen.getByRole('button', { name: '取消选择项目' }))
    expect(select.value).toBe('')
    fireEvent.change(screen.getByLabelText('想如何处理这些材料'), { target: { value: '根据文档写 PRD' } })
    fireEvent.click(screen.getByRole('button', { name: '开始工坊任务' }))
    expect(props.startWorkshop).toHaveBeenCalledWith({ mode: 'materials', task: '根据文档写 PRD', output: 'both' })
  })

  it('lets a user prepare a materials conversation before uploading documents', () => {
    const { props } = mount()
    fireEvent.click(screen.getByRole('button', { name: /基于已有材料/ }))
    fireEvent.change(screen.getByLabelText('想如何处理这些材料'), { target: { value: '根据我接下来上传的材料写 PRD' } })
    fireEvent.change(screen.getByLabelText('本次产出'), { target: { value: 'prd' } })
    fireEvent.click(screen.getByRole('button', { name: '开始工坊任务' }))
    expect(props.startWorkshop).toHaveBeenCalledWith({ mode: 'materials', task: '根据我接下来上传的材料写 PRD', output: 'prd' })
  })

  it('localizes controls and keeps workflow prose out of the form', () => {
    mount([], en)
    expect(screen.getByRole('button', { name: 'Start Workshop task' })).toBeTruthy()
    expect(screen.getByRole('textbox').textContent).toBe('')
    expect(screen.queryByText(/Use Agent Workshop for/)).toBeNull()
  })

  it('prevents repeated starts while pending and preserves the task after failure', async () => {
    const { props } = mount()
    const pending = Promise.withResolvers<undefined>()
    vi.mocked(props.startWorkshop).mockReturnValueOnce(pending.promise)
    fireEvent.change(screen.getByLabelText('说说你的想法'), { target: { value: '我自己的想法' } })
    fireEvent.click(screen.getByRole('button', { name: '开始工坊任务' }))
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '正在启动…' }).disabled).toBe(true)
    expect(props.startWorkshop).toHaveBeenCalledOnce()
    pending.reject(new Error('Connection failed'))
    await screen.findByRole('button', { name: '开始工坊任务' })
    expect(screen.getByRole<HTMLTextAreaElement>('textbox').value).toBe('我自己的想法')
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '开始工坊任务' }).disabled).toBe(false)
  })
})


describe('repository analysis entries', () => {
  it.each(['reverse', 'gaps'] as const)('starts %s with an explicit source and a separate optional destination', async (mode) => {
    const { props } = mount([project('saved', '分析结果')])
    fireEvent.click(screen.getByRole('button', { name: mode === 'reverse' ? /已有项目反推 PRD/ : /项目差距检查/ }))
    expect(screen.queryByLabelText('本次产出')).toBeNull()
    fireEvent.click(screen.getByText('补充信息（选填）'))
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '开始工坊任务' }).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('代码目录'), { target: { value: '/work/source-project' } })
    await screen.findByRole('option', { name: '分析结果' })
    expect(screen.getByLabelText<HTMLSelectElement>('结果保存到').options[0]?.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('结果保存到'), { target: { value: 'saved' } })
    if (mode === 'gaps') fireEvent.change(screen.getByLabelText('需求文件（选填）'), { target: { value: 'docs/PRD.md' } })
    fireEvent.click(screen.getByRole('button', { name: '开始工坊任务' }))
    expect(props.startWorkshop).toHaveBeenCalledWith({ mode, task: '', output: 'prd', workspaceId: 'saved',
      inspection: { sourcePath: '/work/source-project', ...mode === 'gaps' ? { baselinePath: 'docs/PRD.md' } : {} } })
  })
})


describe('selected-document Workshop entries', () => {
  it.each(['impact', 'handoff'] as const)('submits only checked versions for %s with no workflow text in the task', async (mode) => {
    const saved = project('saved', '共享账本')
    const documents = [
      { id: 'prd', title: '需求', kind: 'prd' as const, material: false, revisions: [{ version: 2,
        file: { name: 'PRD.md', relativePath: '文档/d-prd/V2-abc/PRD.md', extension: 'md', kind: 'output' as const },
        source: 'conversation' as const, change: '更新', createdAt: '' }] },
      { id: 'plan', title: '方案', kind: 'plan' as const, material: false, revisions: [{ version: 1,
        file: { name: '方案.md', relativePath: '文档/d-plan/V1-abc/方案.md', extension: 'md', kind: 'output' as const },
        source: 'conversation' as const, change: '初版', createdAt: '' }] },
    ]
    const { props } = mount([{ ...saved, documents }])
    fireEvent.click(screen.getByRole('button', { name: mode === 'impact' ? /迭代影响分析/ : /开发交接包/ }))
    await screen.findByRole('option', { name: '共享账本' })
    expect(screen.queryByLabelText('本次产出')).toBeNull()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '开始工坊任务' }).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('选择项目'), { target: { value: 'saved' } })
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: '需求 · V2' }).checked).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: '方案 · V1' }))
    if (mode === 'impact') {
      fireEvent.change(screen.getByLabelText('这次新增或修改什么'), { target: { value: '增加共享' } })
      fireEvent.click(screen.getByText('补充信息（选填）'))
      fireEvent.change(screen.getByLabelText('补充代码依据的目录（选填）'), { target: { value: '/work/source' } })
    }
    fireEvent.click(screen.getByRole('button', { name: '开始工坊任务' }))
    expect(props.startWorkshop).toHaveBeenCalledWith({ mode, task: mode === 'impact' ? '增加共享' : '', output: 'both', workspaceId: 'saved',
      delivery: { documents: [{ id: 'prd', version: 2 }], ...mode === 'impact' ? { sourcePath: '/work/source' } : {} } })
  })
})


describe('grouped Workshop layout', () => {
  it('groups tasks by goal and names the active operation form', () => {
    const { props } = mount()
    const navigation = screen.getByRole('navigation', { name: '选择工坊任务' })
    expect(within(navigation).getByRole('region', { name: '创建文档' })).toBeTruthy()
    expect(within(navigation).getByRole('region', { name: '检查与迭代' })).toBeTruthy()
    expect(within(navigation).getByRole('region', { name: '开发交接' })).toBeTruthy()
    expect(screen.getByRole('form', { name: '从想法开始' })).toBeTruthy()
    fireEvent.click(within(navigation).getByRole('button', { name: '项目差距检查' }))
    expect(screen.getByRole('form', { name: '项目差距检查' })).toBeTruthy()
    expect(within(navigation).getByRole('button', { name: '项目差距检查' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(navigation).getByRole('button', { name: '从想法开始' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText('本次产出 · 项目差距报告')).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox', { name: '选择工坊任务' }), { target: { value: 'handoff' } })
    expect(screen.getByRole('form', { name: '开发交接包' })).toBeTruthy()
    expect(props.startWorkshop).not.toHaveBeenCalled()
  })

  it('preserves optional input when collapsed and keeps the current task when clicked again', async () => {
    mount([project('saved', '已有材料')])
    fireEvent.click(screen.getByRole('button', { name: '迭代影响分析' }))
    const details = screen.getByText('补充信息（选填）').closest('details')
    if (details === null) throw new Error('Missing optional section')
    expect(details.open).toBe(false)
    fireEvent.click(screen.getByText('补充信息（选填）'))
    fireEvent.change(screen.getByLabelText('补充代码依据的目录（选填）'), { target: { value: '/work/source' } })
    fireEvent.click(screen.getByText('补充信息（选填）'))
    expect(details.open).toBe(false)
    expect(screen.getByText('已填写')).toBeTruthy()
    await screen.findByRole('option', { name: '已有材料' })
    fireEvent.change(screen.getByLabelText('选择项目'), { target: { value: 'saved' } })
    fireEvent.click(screen.getByRole('button', { name: '迭代影响分析' }))
    expect(screen.getByLabelText<HTMLSelectElement>('选择项目').value).toBe('saved')
    fireEvent.click(screen.getByText('补充信息（选填）'))
    expect(screen.getByLabelText<HTMLInputElement>('补充代码依据的目录（选填）').value).toBe('/work/source')
  })
  it('retains each task draft without turning unrelated text into hidden handoff notes', () => {
    mount()
    fireEvent.change(screen.getByLabelText('说说你的想法'), { target: { value: '我的产品想法' } })
    fireEvent.change(screen.getByLabelText('本次产出'), { target: { value: 'plan' } })
    fireEvent.click(screen.getByRole('button', { name: '开发交接包' }))
    expect(screen.queryByText('已填写')).toBeNull()
    fireEvent.click(screen.getByText('补充信息（选填）'))
    expect(screen.getByLabelText<HTMLTextAreaElement>('交接备注（选填）').value).toBe('')
    fireEvent.change(screen.getByLabelText('交接备注（选填）'), { target: { value: '先做核心流程' } })
    fireEvent.click(screen.getByRole('button', { name: '从想法开始' }))
    expect(screen.getByLabelText<HTMLTextAreaElement>('说说你的想法').value).toBe('我的产品想法')
    expect(screen.getByLabelText<HTMLSelectElement>('本次产出').value).toBe('plan')
    fireEvent.click(screen.getByRole('button', { name: '开发交接包' }))
    fireEvent.click(screen.getByText('补充信息（选填）'))
    expect(screen.getByLabelText<HTMLTextAreaElement>('交接备注（选填）').value).toBe('先做核心流程')
  })

})
