import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { describe, expect, it } from 'vitest'

type Entry = {
  id?: string
  config?: unknown
}

describe('AIPM bundle', () => {
  it('loads packaged skills through the trusted bundled skill root', () => {
    const patch = yaml.load(
      readFileSync(fileURLToPath(new URL('../cordis.patch.yml', import.meta.url)), 'utf8'),
      { schema: entryListSchema },
    ) as Array<{ insert?: Entry[] }>
    const preset = patch.flatMap(row => row.insert ?? []).find(row => row.id === 'preset-aipm')
    const plugins = (preset?.config as { plugins?: Entry[] } | undefined)?.plugins ?? []
    const skillFileSystem = plugins.find(row => row.id === 'skill-filesystem')
    const config = skillFileSystem?.config as Record<string, unknown> | undefined

    expect(config).not.toHaveProperty('customSkillDirs')
    expect(config?.watch).toBe(false)
    expect(config?.bundledSkillDir).toEqual({
      __jsExpr: "(() => { const path = process.getBuiltinModule('node:path'); const separator = path.sep; const directory = path.join(path.dirname(process.getBuiltinModule('node:module').createRequire(baseUrl).resolve('@deepseek-ai/dsh-aipm/package.json')), 'skills'); return directory.replace(separator + 'app.asar' + separator, separator + 'app.asar.unpacked' + separator) })()",
    })
  })

  it('ships the initiation skill as the AIPM contract sample', () => {
    const raw = readFileSync(
      fileURLToPath(new URL('../skills/ai-project-initiation/SKILL.md', import.meta.url)),
      'utf8',
    )
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw)
    expect(frontmatter?.[1]).toBeDefined()
    const parsed = yaml.load(frontmatter?.[1] ?? '') as {
      name?: string
      metadata?: { aipm?: Record<string, unknown> }
    }

    expect(parsed.name).toBe('ai-project-initiation')
    expect(parsed.metadata?.aipm).toMatchObject({
      'contract-version': 1,
      stage: '01-立项',
      'task-types': ['project-initiation'],
      inputs: {
        accepts: ['product-idea', 'existing-project-materials'],
        'required-artifacts': [],
      },
      dependencies: [],
      storage: {
        directory: '01-立项',
        'resume-file': '01-立项/00-盘点.md',
      },
      execution: {
        mode: 'checkpointed',
        'can-run-as-prerequisite': true,
        'stop-after-target': true,
      },
    })
    expect(parsed.metadata?.aipm?.outputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'project-initiation-report', primary: true }),
    ]))
  })
})
