// @vitest-environment jsdom
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { ShortcutCatalogEntry, ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { ReactNode } from 'react'
import type {
  SidebarFooterActionOwnerProps, SidebarRootComponentProps, SidebarSectionOwnerProps,
  SidebarSettingsOwnerProps,
} from '../src/client/contract/slots.ts'
import { ShellHeader, SidebarRoot } from '../src/client/SidebarRoot.tsx'
import { en } from '../src/client/locales.ts'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'

const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })
const neverHook = (() => { throw new Error('shell must not read global hooks') }) as never
type AttentionSnapshot = Parameters<Parameters<SidebarRootComponentProps['useSessionStatus']>[0]>[0]
const useSessionStatus: SidebarRootComponentProps['useSessionStatus'] = selector => selector(new Map() as AttentionSnapshot)
const t: SidebarRootComponentProps['t'] = makeTranslate({ ...commonEn, ...en })

afterEach(() => {
  cleanup()
  delete document.documentElement.dataset.platform
  vi.unstubAllEnvs()
})

function mountShell(shortcuts: readonly ShortcutCatalogEntry[] = [], withHeader = false, panel: 'aipm-projects' | 'schedules' | null = null) {
  const startSession = vi.fn<SidebarRootComponentProps['startSession']>()
  let regionOwner: SidebarSectionOwnerProps | undefined
  let settingsOwner: SidebarSettingsOwnerProps | undefined
  let footerOwner: SidebarFooterActionOwnerProps | undefined
  const renderSlot = ((key: string, owner: object, options?: { fallback?: ReactNode }) => {
    if (key === 'sidebar.brand.mark') return <span data-testid="brand-mark">M</span>
    if (key === 'sidebar.brand.name') return <span data-testid="brand-name">Custom Brand</span>
    if (key === 'sidebar.settings') {
      settingsOwner = owner as SidebarSettingsOwnerProps
      return <div data-testid="settings-seat" />
    }
    if (key === 'sidebar.footer.action') {
      footerOwner = owner as SidebarFooterActionOwnerProps
      return <div data-testid="footer-seat" />
    }
    if (key === 'sidebar.workspaces') {
      regionOwner = owner
      return <div data-testid="region" />
    }
    return options?.fallback ?? null
  }) as SidebarRootComponentProps['renderSlot']
  const props: Omit<SidebarRootComponentProps, 'width'> = {
    useSessions: neverHook, useSessionStatus, useSessionRetainInfo: neverHook,
    usePanelInfo: selector => selector({ activePanelId: panel as MainPanelId | null }),
    selectPanel: () => {}, usePanels: selector => selector([]),
    useShortcuts: selector => selector(shortcuts),
    useResource, useWorkspaces: neverHook, startSession, t, renderSlot,
  }
  const view = render(<>
    {withHeader && <ShellHeader {...props} />}
    <SidebarRoot {...props} width={300} />
  </>)
  return { ...view, startSession, regionOwner: () => regionOwner, settingsOwner: () => settingsOwner, footerOwner: () => footerOwner }
}

describe('fixed SidebarRoot shell', () => {
  it('keeps branding below the top bar, with the mark first in the rail and the name above Agent chat', () => {
    const shell = mountShell([], true)
    const topBar = shell.container.querySelector('header[data-window-drag]')
    const rail = shell.container.querySelector('aside')
    const detailHeader = shell.container.querySelector('section > header')
    expect(topBar?.textContent).toBe('Agent chat')
    expect(topBar?.querySelector('[data-testid^="brand-"]')).toBeNull()
    expect(rail?.firstElementChild?.contains(screen.getByTestId('brand-mark'))).toBe(true)
    expect(detailHeader?.firstElementChild?.contains(screen.getByTestId('brand-name'))).toBe(true)
    expect(detailHeader?.querySelector('strong')?.textContent).toBe('Agent chat')
  })

  it('always renders the rail and detail at the owner width without a collapse control', () => {
    const shell = mountShell()
    const root = shell.container.firstElementChild as HTMLElement
    expect(root.style.width).toBe('300px')
    expect(root.querySelector('aside')).not.toBeNull()
    expect(root.querySelector('section')).not.toBeNull()
    expect(screen.queryByRole('button', { name: /sidebar/i })).toBeNull()
    expect(screen.getByTestId('region')).toBeTruthy()
    expect(shell.regionOwner()).toEqual({})
    expect(shell.settingsOwner()).toEqual({ wide: false })
    expect(shell.footerOwner()).toEqual({ wide: false })
  })

  it('routes the wordmark and New chat capsule to the session action', () => {
    const shell = mountShell([], true)
    expect(screen.getByTestId('brand-mark')).toBeTruthy()
    expect(screen.getByTestId('brand-name')).toBeTruthy()
    for (const button of screen.getAllByRole('button', { name: 'New chat' })) fireEvent.click(button)
    expect(shell.startSession).toHaveBeenCalledTimes(2)
  })

  it('keeps the macOS wordmark static while preserving the dedicated New chat action', () => {
    document.documentElement.dataset.platform = 'darwin'
    const shell = mountShell([], true)
    expect(screen.getAllByRole('button', { name: 'New chat' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }))
    expect(shell.startSession).toHaveBeenCalledOnce()
  })

  it('advertises the effective New chat shortcut', () => {
    const shortcut: ShortcutCatalogEntry = {
      id: 'session.new' as ShortcutCommandId, label: 'New', aliases: [], binding: null,
      modified: true, conflicts: [], issue: null, keys: ['Ctrl', 'N'], aria: 'Control+N',
    }
    mountShell([shortcut])
    for (const button of screen.getAllByRole('button', { name: 'New chat' })) {
      expect(button.getAttribute('aria-keyshortcuts')).toBe('Control+N')
    }
  })

  it('opens quick actions and starts a prepared Agent chat', () => {
    const shell = mountShell()
    fireEvent.click(screen.getByRole('button', { name: 'Quick actions' }))
    fireEvent.click(screen.getByRole('button', { name: /Research and analysis/ }))
    expect(shell.startSession).toHaveBeenCalledOnce()
    const [workspace, options] = shell.startSession.mock.calls[0]!
    expect(workspace).toBeUndefined()
    expect(options?.prompt).toContain('调研与分析')
    expect(options?.clearPreviousDraft).toBe(true)
  })

  it('renders the local-build fallback when brand slots are empty', () => {
    vi.stubEnv('DSH_CLIENT_VERSION', '1.2.3')
    render(<SidebarRoot
      width={300}
      useSessions={neverHook} useSessionStatus={useSessionStatus} useSessionRetainInfo={neverHook}
      usePanelInfo={usePanelInfo} selectPanel={() => {}} usePanels={selector => selector([])}
      useShortcuts={selector => selector([])} useResource={useResource} useWorkspaces={neverHook}
      startSession={vi.fn()} t={t}
      renderSlot={((_key: string, _owner: unknown, options?: { fallback?: ReactNode }) => options?.fallback ?? null) as SidebarRootComponentProps['renderSlot']}
    />)
    expect(screen.getByText('Nini Flow')).toBeTruthy()
    expect(screen.getByText('1.2.3')).toBeTruthy()
  })

  it.each(['aipm-projects', 'schedules'] as const)('hides the history pane and quick actions on %s', (panel) => {
    const shell = mountShell([], false, panel)
    expect(shell.container.querySelector('section')?.hidden).toBe(true)
    expect(screen.queryByRole('button', { name: 'Quick actions' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Back to Agent chat' })).toBeTruthy()
    expect(shell.container.querySelector('aside')?.contains(screen.getByTestId('brand-mark'))).toBe(true)
    expect(screen.getByTestId('brand-name').closest('section')?.hidden).toBe(true)
  })
})
