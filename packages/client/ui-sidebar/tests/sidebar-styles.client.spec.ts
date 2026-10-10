/** Sidebar shell style contracts shared with its slot-owned controls. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/SidebarRoot.module.css', import.meta.url)), 'utf8')

/**
 * Declarations of one exact selector, keyed by property.
 * @param selector - exact selector text.
 * @returns the normalized declarations, or undefined when absent.
 */
function declarations(selector: string): Map<string, string> | undefined {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, ' ')
  for (const [, selectorList = '', body = ''] of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectorList.split(',').map(value => value.trim()).includes(selector)) continue
    const found = new Map<string, string>()
    for (const part of body.split(';')) {
      const colon = part.indexOf(':')
      if (colon === -1) continue
      found.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim().replace(/\s+/g, ' '))
    }
    return found
  }
  return undefined
}

describe('SidebarRoot.module.css', () => {
  it('keeps the top row for the page title and completely removes inactive history from layout', () => {
    expect(declarations('.topNavigation')?.get('height')).toBe('56px')
    expect(declarations('.topBrand')).toBeUndefined()
    expect(declarations(":global([data-platform='darwin']) .topNavigation")?.get('padding-left')).toBe('82px')
    expect(declarations('.detail[hidden]')?.get('display')).toBe('none')
  })
  it('keeps the permanent rail compact and lets the detail column own its spacing', () => {
    const root = declarations('.root')
    expect(root?.get('--dsh-sidebar-inline-padding')).toBe('12px')
    expect(declarations('.rail')?.get('flex')).toBe('0 0 58px')
    expect(declarations('.railBrand')?.get('width')).toBe('40px')
    expect(declarations('.railBrand')?.get('height')).toBe('40px')
    expect(declarations('.detailBrandRow')?.get('margin-bottom')).toBe('12px')
    expect(declarations('.detail')?.get('padding')).toBe('14px 12px 10px')
    expect(declarations('.regionArea')?.get('margin')).toBe(
      '8px calc(-1 * var(--dsh-sidebar-inline-padding)) 0 -4px',
    )
    expect(declarations('.regionArea')?.get('padding-left')).toBe('4px')
  })

  it('contains no collapse or hover-preview presentation states', () => {
    expect(css).not.toMatch(/\.collapsed\b/)
    expect(css).not.toMatch(/\.peek(?:Closing)?\b/)
    expect(css).not.toMatch(/\.railIn\b/)
    expect(css).not.toMatch(/@keyframes\s+rail-in\b/)
  })

  it('uses the Nini Flow glass tokens for the primary actions', () => {
    expect(declarations('.newSession')?.get('border')).toBe('0.5px solid var(--dsw-nini-glass-border)')
    expect(declarations('.newSession')?.get('backdrop-filter')).toBe('blur(20px) saturate(140%)')
    expect(declarations('.quickToggle')?.get('border')).toBe('0.5px solid var(--dsw-nini-glass-border)')
  })

  it('keeps the slotted brand row at the full artwork height', () => {
    expect(declarations('.brandIdentity')?.get('height')).toBe('24px')
    expect(declarations('.brandName')?.get('height')).toBe('24px')
    expect(declarations('.brandName')?.get('line-height')).toBe('24px')
    expect(declarations('.brandName')?.get('font-size')).toBe('18px')
    expect(declarations('.fallbackBrandName')?.get('font-size')).toBe('17px')
    expect(declarations('.fallbackBrandName')?.get('white-space')).toBe('nowrap')
  })
})
