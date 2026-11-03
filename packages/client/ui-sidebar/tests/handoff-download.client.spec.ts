// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { downloadHandoff } from '../src/client/handoff-download.ts'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })
describe('handoff browser download', () => {
  it('downloads exact complete bytes with the ZIP filename and releases the object URL', async () => {
    vi.useFakeTimers()
    const create = vi.fn((_value: Blob) => 'blob:handoff'); const revoke = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('开发交接包.zip'); expect(this.href).toBe('blob:handoff')
    })
    const remote = { readBytes: vi.fn(async () => ({ ok: true as const,
      value: { absolutePath: '/work/archive.zip', version: '1', bytes: 4, offset: 0, eof: true, data: new Uint8Array([80, 75, 3, 4]) } })) }
    await downloadHandoff(remote, SessionId('project'), '文档/d-abc/V1-xyz/开发交接包.zip')
    expect(click).toHaveBeenCalledOnce(); expect(create).toHaveBeenCalledOnce()
    expect((create.mock.calls[0] as [Blob])[0].size).toBe(4)
    expect(document.querySelector('a')).toBeNull()
    await vi.runAllTimersAsync(); expect(revoke).toHaveBeenCalledWith('blob:handoff')
  })
  it('refuses arbitrary paths and incomplete or failed reads', async () => {
    const remote = { readBytes: vi.fn(async () => ({ ok: true as const,
      value: { absolutePath: '/work/archive.zip', version: '1', bytes: 8, offset: 0, eof: false, data: new Uint8Array([80, 75]) } })) }
    await expect(downloadHandoff(remote, SessionId('project'), '../.env')).rejects.toThrow('Invalid')
    expect(remote.readBytes).not.toHaveBeenCalled()
    await expect(downloadHandoff(remote, SessionId('project'), '文档/d-abc/V1-xyz/开发交接包.zip')).rejects.toThrow('Incomplete')
  })
})
