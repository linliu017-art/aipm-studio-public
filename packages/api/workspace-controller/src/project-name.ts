/** Atomic project-name changes with registry synchronization and writer coordination. */
import { readFile, realpath, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'

function inside(root: string, path: string): void {
  const child = relative(root, path)
  if (isAbsolute(child) || child === '..' || child.startsWith(`..${sep}`)) throw new Error('Project metadata resolves outside its directory')
}

/**
 * Change only the project name and synchronize the associated Workspace title.
 * @param root - registered project directory; metadata must resolve inside it.
 * @param name - non-blank, trimmed name validated by the command owner.
 * @param synchronize - commit the Workspace title; rejection restores the original metadata bytes.
 * @returns completion once both names are saved; unrelated metadata and documents remain intact.
 */
export async function renameProjectState(root: string, name: string, synchronize: () => Promise<void>): Promise<void> {
  const canonical = await realpath(root)
  const directory = await realpath(join(canonical, '.aipm'))
  inside(canonical, directory)
  const target = join(directory, 'project.json')
  inside(directory, await realpath(target))
  await withFileLock(target, async () => {
    const original = await readFile(target, 'utf8')
    const metadata: unknown = JSON.parse(original)
    if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)
      || !('schemaVersion' in metadata) || metadata.schemaVersion !== 1 || !('name' in metadata) || typeof metadata.name !== 'string') {
      throw new Error('Project metadata is invalid')
    }
    const mode = (await stat(target)).mode & 0o777
    const changed = metadata.name !== name
    if (changed) await writeFileAtomic(target, JSON.stringify({ ...metadata, name }, null, 2) + '\n', { mode })
    try {
      await synchronize()
    } catch (error) {
      if (changed) {
        try { await writeFileAtomic(target, original, { mode }) }
        catch (rollback) { throw new AggregateError([error, rollback], 'Project rename and metadata rollback failed') }
      }
      throw error
    }
  })
}
