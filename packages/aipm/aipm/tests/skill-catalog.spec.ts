/** Bundled product workflows must be discoverable without the author's home directories. */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import * as SkillFileSystem from '@deepseek-ai/dsh-skill-filesystem'
import { expect, it, onTestFinished } from 'vitest'
import { GENERAL_SKILLS, STAGES, STAGE_IDS } from '../src/stages.ts'

const root = fileURLToPath(new URL('../skills/', import.meta.url))

it('loads every stage and supporting skill through the real Loader and filesystem provider', async () => {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  ctx.baseUrl = import.meta.url
  await ctx.plugin(Loader).await()
  ctx.loader.builtins.skills = SkillRegistry
  ctx.loader.builtins.filesystem = SkillFileSystem
  await ctx.loader.root.update([
    { id: 'skills', name: 'cordis:skills' },
    { id: 'filesystem', name: 'cordis:filesystem', config: {
      includeDefaultRoots: false, watch: false, bundledSkillDir: root,
    } },
  ])
  await ctx.loader.await()
  const expected = [...new Set([...STAGES.flatMap(stage => stage.skill ? [stage.skill] : []), ...GENERAL_SKILLS])].sort()
  const catalog = await ctx.skills.list()
  expect(catalog.map(skill => skill.name).sort()).toEqual(expected)
  expect(catalog).toHaveLength(13)
  for (const name of expected) {
    const skill = await ctx.skills.get(name)
    expect(skill?.source).toBe('bundled')
    expect(skill?.invocation).toEqual({ modelInvocable: true, userInvocable: true })
    expect(skill?.content.length).toBeGreaterThan(100)
    expect(skill?.resourceBase).toEqual({ kind: 'directory', path: join(root, name) })
    if (name === 'interview-me') {
      expect(skill?.content).not.toMatch(/HYPOTHESIS:|CONFIDENCE:|GUESS:|\bQ:/u)
      expect(skill?.content).toContain('一张 3 问卡片')
      expect(skill?.content).toContain('一次只问一个独立问题')
      expect(skill?.content).toContain('未答或跳过的题保持未确认')
      expect(skill?.content).toContain('推荐只用于工作方式')
      expect(skill?.content).toContain('不能直接写进产品简介或变成功能')
      expect(skill?.content).toContain('不要用猜测补出这些需求')
      expect(skill?.content).toContain('“对”“是的”“可以”“按这个来”等清楚的确认都有效')
    }
    if (name === 'human-writing') continue
    expect(skill?.metadata).toMatchObject({ aipm: {
      'contract-version': 1, execution: { 'stop-after-target': true },
    } })
  }
})

it('ships the templates, methodologies, and workbench design tool reference used by the workflows', () => {
  for (const path of [
    'product-prd/references/prd-template.md',
    'baoyu-design/system-prompt.md', 'baoyu-design/references/aipm.md',
    'baoyu-design/project-types.json', 'prototype/LOGIC.md', 'prototype/UI.md',
    'idea-refine/frameworks.md', 'ai-company-research/company_report_template.html',
    'product-teardown-standard/references/intake-and-delivery.md',
  ]) expect(existsSync(join(root, path)), path).toBe(true)
  expect(readFileSync(join(root, 'baoyu-design/SKILL.md'), 'utf8')).toContain('references/aipm.md')
  expect(STAGES.filter(stage => !stage.skill).map(stage => stage.id)).toEqual(['08-上线', '09-复盘'])
  expect(STAGES.every(stage => STAGE_IDS.includes(stage.id))).toBe(true)
})
