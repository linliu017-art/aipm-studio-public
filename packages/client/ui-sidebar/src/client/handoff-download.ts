/** Browser download of an explicitly selected, managed handoff archive. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { WorkspaceByteReadOptions, WorkspaceFileBytes } from '@deepseek-ai/dsh-api-workspace-files/types'

interface ArchiveRemote {
  readBytes(
    sessionId: SessionId, path: string, options: WorkspaceByteReadOptions, signal: AbortSignal,
  ): Promise<RemoteResult<WorkspaceFileBytes>>
}
/**
 * Read complete ZIP bytes through the existing Session file service and start a browser download.
 * @param remote - read-only byte service, retaining Host read limits.
 * @param sessionId - Session in the selected project.
 * @param path - managed handoff revision path, never an arbitrary local file.
 * @returns completion of the file query and browser download dispatch.
 */
export async function downloadHandoff(remote: ArchiveRemote, sessionId: SessionId, path: string): Promise<void> {
  if (!/^文档\/d-[^/\\]+\/V[1-9]\d*-[^/\\]+\/开发交接包\.zip$/.test(path)
    || path.split('/').some(part => part === '.' || part === '..' || part.includes('\0'))) throw new Error('Invalid handoff path')
  const result = await remote.readBytes(sessionId, path, {}, new AbortController().signal)
  if (!result.ok) throw new Error(result.error.message)
  const file = result.value
  if (!file.eof || file.offset !== 0 || (file.bytes !== undefined && file.bytes !== file.data.length)) throw new Error('Incomplete archive')
  const url = URL.createObjectURL(new Blob([Uint8Array.from(file.data).buffer], { type: 'application/zip' }))
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = '开发交接包.zip'
  document.body.append(anchor)
  try { anchor.click() }
  finally { anchor.remove(); setTimeout(() => { URL.revokeObjectURL(url) }, 0) }
}
