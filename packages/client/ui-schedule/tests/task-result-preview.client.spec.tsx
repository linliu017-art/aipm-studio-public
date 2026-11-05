// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { TaskResultPreview } from '../src/client/TaskResultPreview.tsx'
import { en } from '../src/client/task-manager-locales.ts'

afterEach(cleanup)
const sessionId = 's' as SessionId
const t = makeTranslate(en)
describe('task result preview', () => {
  it('shows the exact returned result and switches for a different receipt', async () => {
    const loadResult = vi.fn(async (_session: SessionId, id: string) => ({ kind: 'completed' as const, text: `report ${id}` }))
    const view = render(<TaskResultPreview sessionId={sessionId} messageId="one" loadResult={loadResult} t={t} />)
    await screen.findByText('report one')
    view.rerender(<TaskResultPreview sessionId={sessionId} messageId="two" loadResult={loadResult} t={t} />)
    await screen.findByText('report two')
    expect(screen.queryByText('report one')).toBeNull()
  })
  it('surfaces read errors and allows a retry', async () => {
    const loadResult = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ kind: 'completed', text: 'ok' })
    render(<TaskResultPreview sessionId={sessionId} messageId="one" loadResult={loadResult} t={t} />)
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: en['delivery.retry'] }))
    await waitFor(() => { expect(screen.getByText('ok')).toBeDefined() })
  })
})
