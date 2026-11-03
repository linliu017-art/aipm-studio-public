/** Shared project-state writer coordination for UI names and model stage updates. */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { initProject, readProject, updateStage } from '../src/store.ts'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'aipm-name-test-'))
  roots.push(root)
  await initProject(root, { name: '原名称', summary: '保留简介' })
  return root
}

describe('project-state writers', () => {
  it('retains both stage updates when two tasks finish concurrently', async () => {
    const root = await project()
    await Promise.all([
      updateStage(root, { stage: '02-需求分析', status: 'done', note: '需求' }),
      updateStage(root, { stage: '03-PRD', status: 'done', note: '方案' }),
    ])
    const state = await readProject(root)
    expect(state?.stages['02-需求分析']).toMatchObject({ status: 'done', note: '需求' })
    expect(state?.stages['03-PRD']).toMatchObject({ status: 'done', note: '方案' })
  })

  it('re-reads a user-edited name after acquiring the shared metadata lock', async () => {
    const root = await project()
    const target = join(root, '.aipm/project.json')
    const entered = Promise.withResolvers<undefined>()
    const release = Promise.withResolvers<undefined>()
    const rename = withFileLock(target, async () => {
      const state = await readProject(root)
      entered.resolve(undefined)
      await release.promise
      await writeFileAtomic(target, JSON.stringify({ ...state, name: '用户改的名称' }), { mode: 0o600 })
    })
    await entered.promise
    const update = updateStage(root, { stage: '03-PRD', status: 'done', note: '保留进度' })
    release.resolve(undefined)
    await Promise.all([rename, update])
    expect(JSON.parse(await readFile(target, 'utf8'))).toMatchObject({
      name: '用户改的名称', summary: '保留简介', stages: { '03-PRD': { status: 'done', note: '保留进度' } },
    })
  })
})
