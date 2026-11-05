/** Keyless real-composition evidence for task result correlation and navigation. */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { describe, expect, it } from 'vitest'
import { LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { launchWebScaffold } from './scaffold.ts'

const provider = 'schedule-result-test'
const reply = 'The scheduled report is ready.'
class ResultAdapter extends LlmAdapter {
  override async listModels(name: string) { return [{ provider: name, id: 'reply', name: 'reply' }] }
  override async *stream(): AsyncIterable<StreamChunk> {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: reply } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

describe('manual schedule execution in assembled Web', () => {
  it('runs a paused task without changing its schedule', async () => {
    const scaffold = await launchWebScaffold()
    const executablePath = process.env['DSH_TEST_BROWSER_PATH']
    const browser = await chromium.launch(executablePath === undefined ? {} : { executablePath })
    let handle: Awaited<ReturnType<typeof scaffold.ctx.agents.create>> | undefined
    try {
      scaffold.ctx.effect(() => scaffold.ctx.llm.registerAdapter([provider], new ResultAdapter()), 'result preview adapter')
      const page = await browser.newPage({ locale: 'en-US', viewport: { width: 1440, height: 900 } })
      await page.addInitScript(() => { localStorage.setItem('dsh.locale', 'en') })
      await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
      const cwd = join(scaffold.workspaceCwd, 'workspace')
      await mkdir(cwd, { recursive: true })
      await page.getByRole('textbox', { name: 'Choose workspace' }).click()
      const picker = page.getByRole('dialog', { name: 'Select Workspace Directory' })
      await picker.getByRole('button', { name: 'Edit path' }).click()
      const path = picker.getByRole('textbox', { name: 'Edit path' })
      await path.fill(cwd)
      await path.press('Enter')
      await picker.getByRole('button', { name: 'Open', exact: true }).click()
      await page.locator('[data-composer-input][contenteditable="true"]').waitFor({ timeout: 15_000 })
      const workspace = await scaffold.ctx.workspaceRegistry.resolveByPath(cwd)
      if (workspace === undefined) throw new Error('workspace was not registered')
      handle = await scaffold.ctx.agents.create({
        sessionId: SessionId('result-preview-e2e'), meta: { cwd }, agentOptions: { provider, model: 'reply' },
        setup: agentCtx => scaffold.ctx.agentPresets.mount(agentCtx).then(() => undefined),
      })
      await workspace.attachSession(handle.agent.id)
      const created = await scaffold.ctx.tools.execute({
        signal: AbortSignal.timeout(10_000), callId: ToolCallId('result-preview-create'), name: 'schedule_create',
        arguments: { prompt: 'Build the report', title: 'Build the report', daily: { time: '23:00:00', time_zone: 'Asia/Shanghai' } }, agent: handle.agent,
      })
      expect(created.isError).toBe(false)
      const task = (await scaffold.ctx.schedule.catalog()).find(item => item.sessionId === handle!.agent.id)
      if (task === undefined) throw new Error('task was not created')
      await scaffold.ctx.schedule.setPaused({ id: task.id, sessionId: task.sessionId, paused: true })
      await page.getByRole('button', { name: 'Task center', exact: true }).click()
      const manager = page.getByTestId('task-manager-page')
      await manager.getByRole('button', { name: 'Paused', exact: true }).click()
      const run = manager.getByRole('button', { name: 'Run now：Build the report' })
      const rowBox = await run.locator('..').locator('..').boundingBox()
      const runBox = await run.boundingBox()
      expect(rowBox).not.toBeNull()
      expect(runBox).not.toBeNull()
      expect(runBox!.x).toBeGreaterThanOrEqual(rowBox!.x)
      expect(runBox!.x + runBox!.width).toBeLessThanOrEqual(rowBox!.x + rowBox!.width)
      await run.click()
      await manager.getByRole('list', { name: 'Task catalog' }).getByRole('button', { name: 'Build the report', exact: true }).click()
      const detail = manager.getByRole('complementary', { name: 'Task details' })
      await expect.poll(async () => detail.getByRole('tabpanel', { name: 'Result' }).textContent(), { timeout: 15_000 }).toContain(reply)
      const after = (await scaffold.ctx.schedule.catalog()).find(item => item.id === task.id)
      expect(after?.status).toBe('paused')
      expect(after?.scheduledAt).toBe(task.scheduledAt)
      await detail.getByRole('button', { name: /^Linked session/ }).click()
      await page.getByText(reply, { exact: true }).last().waitFor({ timeout: 15_000 })
    } finally {
      await browser.close()
      await handle?.dispose()
      await scaffold.close()
    }
  })
})
