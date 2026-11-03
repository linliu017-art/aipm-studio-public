/** Create independent idea directories without inheriting an existing Workspace. */
import { mkdir, mkdtemp, realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { IdeaDirectoryValue } from './types.ts'

/**
 * Create a unique, unregistered directory outside every registered Workspace tree.
 * @param ctx - authoritative Workspace registry.
 * @param root - configured parent for new idea directories.
 * @returns the directory path; no Workspace, project files or Session are created.
 */
export async function prepareIdeaDirectory(ctx: Context, root: string): Promise<IdeaDirectoryValue> {
  try {
    const check = (canonical: string): void => {
      for (const workspace of ctx.workspaceRegistry.list()) {
        const child = relative(workspace.path, canonical)
        if (child === '' || (!isAbsolute(child) && child !== '..' && !child.startsWith(`..${sep}`))) {
          throw new Error('The ideas directory must be outside existing Workspace directories')
        }
      }
    }
    check(await canonicalCandidate(root))
    await mkdir(root, { recursive: true })
    const canonical = await realpath(root)
    check(canonical)
    const path = await mkdtemp(join(canonical, 'idea-'))
    return { path }
  } catch (error) {
    throw new RemoteError('workspace/invalid-path', `Cannot create an independent idea directory: ${error instanceof Error ? error.message : String(error)}`, { path: root }, { cause: error })
  }
}

/** Resolve existing ancestors before creating a potentially nested directory. */
async function canonicalCandidate(path: string): Promise<string> {
  try {
    return await realpath(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return join(await canonicalCandidate(dirname(path)), basename(path))
  }
}
