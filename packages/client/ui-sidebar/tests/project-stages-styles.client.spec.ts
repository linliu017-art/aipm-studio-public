/** Container-width adaptation for the project overview. */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../src/client/AipmPanels.module.css', import.meta.url), 'utf8')

describe('project overview adaptation', () => {
  it('wraps compact stage cards instead of maintaining competing overview columns', () => {
    expect(css).toMatch(/container:\s*nini-project\s*\/\s*inline-size/)
    expect(css).toMatch(/@container nini-project \(max-width: 700px\)/)
    expect(css).toMatch(/\.stageList\s*\{[^}]*flex-wrap: wrap;/)
    expect(css).toMatch(/\.stageRow\s*\{[^}]*flex: 0 1 190px;/)
    expect(css).not.toMatch(/\.detailColumns\b|\.projectTabs\b/)
    expect(css).toMatch(/\.stageRow\s*\{[^}]*grid-template-columns: 30px minmax\(0, 1fr\);/)
    expect(css).not.toMatch(/\.status\b/)
  })

  it('keeps Markdown icons unfilled and adds only a faint tint to stage folders', () => {
    const markdown = css.match(/(?:^|\n)\.markdownIcon\s*\{([^}]*)\}/)?.[1]
    expect(markdown).toContain('var(--dsw-nini-accent-text)')
    expect(markdown).not.toMatch(/background|border|box-shadow/)
    expect(css).toMatch(/\.stageFolderIcon\s*\{[^}]*background: color-mix\(in srgb, var\(--dsw-nini-accent\) 8%, transparent\);/)
  })

  it('uses light/dark semantic colors for numbered status controls', () => {
    expect(css).toMatch(/\.stageIndex\[data-status='done'\]\s*\{[^}]*--dsw-alias-state-success-primary/)
    expect(css).toMatch(/\.stageIndex\[data-status='in_progress'\]\s*\{[^}]*--dsw-alias-state-business-primary/)
  })
})
