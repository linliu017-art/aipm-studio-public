/** Public forks must never activate inherited infrastructure or privileged automation. */
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { load } from 'js-yaml'
import { expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')
const workflowDirectory = resolve(root, '.github/workflows')

interface Workflow {
  on: Record<string, unknown>
  permissions: Record<string, string>
  jobs: Record<string, {
    if?: string
    'runs-on'?: string
    steps?: { uses?: string; run?: string; with?: Record<string, unknown> }[]
  }>
}

it('skips every inherited job in this repository and other forks', () => {
  for (const name of readdirSync(workflowDirectory).filter(name => name.endsWith('.yml') && name !== 'aipm-validation.yml')) {
    const workflow = load(readFileSync(resolve(workflowDirectory, name), 'utf8')) as Workflow
    for (const [jobId, job] of Object.entries(workflow.jobs)) {
      expect(job.if, `${name}/${jobId}`).toMatch(/^\$\{\{ github\.repository == 'deepseek-ai\/deepseek-harness' && \(/)
      const expression = job.if!.trim().slice(3, -2).replace(/\b\w+(?:\.\w+)*\.\*\.\w+/g, '[]')
      for (const repository of [
        'linliu017-art/aipm-studio-public',
        'linliu017-art/aipm-studio',
        'another-owner/aipm-studio',
      ]) {
        expect(runInNewContext(expression, { github: { repository } }, { timeout: 1000 }), `${name}/${jobId}`).toBe(false)
      }
    }
  }
})

it('limits AIPM validation to hosted, pinned, read-only jobs without privileged events', () => {
  const source = readFileSync(resolve(workflowDirectory, 'aipm-validation.yml'), 'utf8')
  const workflow = load(source) as Workflow
  expect(Object.keys(workflow.on).sort()).toEqual(['pull_request', 'push', 'workflow_dispatch'])
  expect(workflow.on.push).toEqual({ branches: ['aipm'] })
  expect(workflow.on.pull_request).toEqual({ branches: ['aipm'] })
  expect(workflow.permissions).toEqual({ contents: 'read' })
  expect(source).not.toContain('secrets.')
  for (const job of Object.values(workflow.jobs)) {
    expect(job['runs-on']).toBe('ubuntu-24.04')
    for (const step of job.steps ?? []) {
      if (step.uses !== undefined) expect(step.uses).toMatch(/@[0-9a-f]{40}$/)
      if (step.uses?.startsWith('actions/checkout@')) expect(step.with?.['persist-credentials']).toBe(false)
    }
  }
})
