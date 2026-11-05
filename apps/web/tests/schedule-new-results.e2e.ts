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

describe('new results in assembled Web', () => {
  it('shows an unread result and keeps it read after reload', async () => {
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
        arguments: { prompt: 'Write the report', title: 'Write the report', after_seconds: 1 }, agent: handle.agent,
      })
      expect(created.isError).toBe(false)
      await expect.poll(() => handle!.agent.session.snapshotEvents().some(event => event.type === 'turn/end' && event.data.reason.kind === 'completed'), { timeout: 15_000 }).toBe(true)
      await handle.agent.whenIdle()
      expect(await scaffold.ctx.sessions.flush(handle.agent.session)).toBe(true)
      const reminder = await scaffold.ctx.tools.execute({
        signal: AbortSignal.timeout(10_000), callId: ToolCallId('reminder-only-create'), name: 'schedule_create',
        arguments: { prompt: '提醒用户：该准备睡觉了。', title: 'Sleep reminder', after_seconds: 1 }, agent: handle.agent,
      })
      expect(reminder.isError).toBe(false)
      await expect.poll(() => handle!.agent.session.snapshotEvents().filter(event => event.type === 'turn/end').length,
        { timeout: 15_000 }).toBeGreaterThanOrEqual(2)
      await handle.agent.whenIdle()
      await page.getByRole('button', { name: 'Task center', exact: true }).click()
      const manager = page.getByTestId('task-manager-page')
      const trigger = manager.getByRole('button', { name: /New results 1/ })
      await trigger.waitFor({ timeout: 15_000 })
      expect(await manager.getByRole('region', { name: 'New results' }).count()).toBe(0)
      await trigger.click()
      const newResults = manager.getByRole('region', { name: 'New results' })
      await newResults.getByRole('button', { name: /Write the report/ }).waitFor({ timeout: 15_000 })
      expect(await newResults.getByRole('button', { name: /Sleep reminder/ }).count()).toBe(0)
      await newResults.getByRole('button', { name: /Write the report/ }).click()
      const detail = manager.getByRole('complementary', { name: 'Task details' })
      await expect.poll(async () => detail.getByRole('tabpanel', { name: 'Result' }).textContent(), { timeout: 15_000 }).toContain(reply)
      await expect.poll(() => manager.getByRole('button', { name: /New results 0/ }).count()).toBe(1)
      await page.reload({ waitUntil: 'load' })
      await page.getByRole('button', { name: 'Task center', exact: true }).click()
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('dsh.schedule.read-results.v1') ?? '[]').length)).toBeGreaterThan(0)
      await page.waitForTimeout(1500)
      await expect.poll(() => manager.getByRole('region', { name: 'New results' }).count()).toBe(0)
    } finally {
      await browser.close()
      await handle?.dispose()
      await scaffold.close()
    }
  })
})
