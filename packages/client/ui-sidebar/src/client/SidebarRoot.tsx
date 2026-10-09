/** Nini Flow's navigation rail, Agent launcher, quick-action drawer, and history seat. */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import {
  FishLogo,
  IconChecklistOutlineRegular,
  IconChevronDownOutlineRegular,
  IconChevronRightOutlineRegular,
  IconDataOutlineRegular,
  IconEditOutlineRegular,
  IconInspectOutlineRegular,
  IconListPenOutlineRegular,
  IconNewChatOutlineRegular,
  IconPanelLeftOutlineRegular,
  IconSearchOutlineRegular,
  IconSparkleRegular,
  isDarwinDesktop,
  ShortcutKeys,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  SidebarPanelMetadata, SidebarRootComponentProps, SidebarRootInjected, SidebarSectionOwnerProps,
} from './contract/slots.ts'
import type { SidebarKey } from './locales.ts'
import css from './SidebarRoot.module.css'

const COLLAPSE_SETTLE_MS = 150
const HOVER_CLOSE_MS = 160
const SCROLLBAR_LINGER_MS = 2000
const DEFAULT_EXPANDED_WIDTH = 280

function localBuildVersion(): string | undefined {
  const version = process.env.DSH_CLIENT_VERSION
  if (version === undefined) return undefined
  const commit = process.env.DSH_CLIENT_COMMIT_HASH
  return version
    + (commit === undefined ? '' : `-${commit}`)
    + (process.env.DSH_CLIENT_GIT_DIRTY === 'true' ? '-dirty' : '')
}

type PanelRowProps =
  Pick<SidebarPanelMetadata, 'id' | 'label'>
  & Pick<PropsRuntime<'sidebar'>, 'usePanelInfo'>
  & Pick<InjectFace<SidebarRootInjected>, 'selectPanel'>
  & PropsRenderSlots<'sidebar.panellist'>

/** One compact global-panel control in the permanent rail. */
function PanelRow({ id, label, usePanelInfo, selectPanel, renderSlot }: PanelRowProps) {
  const active = usePanelInfo(info => info.activePanelId === id)
  return (
    <Tooltip label={label} delayMs={500} side="right">
      <button
        type="button"
        className={clsx(css.railButton, active && css.railButtonActive)}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        onClick={() => { selectPanel(id) }}
      >
        {renderSlot('sidebar.panellist', { size: 18, active }, { only: id })}
      </button>
    </Tooltip>
  )
}

interface QuickAction {
  id: string
  title: SidebarKey
  description: SidebarKey
  prompt: string
  icon: ReactNode
}

/** The five broad entries describe jobs instead of exposing individual skills. */
const QUICK_ACTIONS: readonly QuickAction[] = [
  {
    id: 'research',
    title: 'quick.research.title',
    description: 'quick.research.description',
    prompt: '请帮我完成调研与分析。请先结合当前项目材料，梳理市场、用户、竞品与趋势，再根据任务需要输出结论。',
    icon: <IconSearchOutlineRegular size={16} />,
  },
  {
    id: 'material',
    title: 'quick.material.title',
    description: 'quick.material.description',
    prompt: '请帮我处理当前项目材料。请先阅读已有文件，再按我的具体目标整理、对比并提取关键信息。',
    icon: <IconDataOutlineRegular size={16} />,
  },
  {
    id: 'planning',
    title: 'quick.planning.title',
    description: 'quick.planning.description',
    prompt: '请帮我完成项目规划与管理。请结合已有材料拆解任务、梳理依赖和进度，并标出风险与待确认项。',
    icon: <IconChecklistOutlineRegular size={16} />,
  },
  {
    id: 'review',
    title: 'quick.review.title',
    description: 'quick.review.description',
    prompt: '请帮我评审当前项目或指定材料，重点发现信息缺口、风险、矛盾和可优化的地方。',
    icon: <IconInspectOutlineRegular size={16} />,
  },
  {
    id: 'output',
    title: 'quick.output.title',
    description: 'quick.output.description',
    prompt: '请帮我创建一项产品产出。请先读取当前项目材料，判断需要的前置信息和对应能力，再按我稍后补充的要求生成文档、方案、流程或原型。',
    icon: <IconListPenOutlineRegular size={16} />,
  },
] as const

/** Render the two-level product navigation shell. */
export function SidebarRoot({
  collapsed,
  width,
  startSession,
  toggleSidebar,
  selectPanel,
  usePanels,
  useShortcuts,
  usePanelInfo,
  t,
  renderSlot,
}: SidebarRootComponentProps) {
  const panels = usePanels(snapshot => snapshot)
  const activePanelId = usePanelInfo(info => info.activePanelId)
  const shortcut = useShortcuts(rows => rows.find(row => row.id === 'sidebar.left.toggle'))
  const newShortcut = useShortcuts(rows => rows.find(row => row.id === 'session.new'))
  const [quickOpen, setQuickOpen] = useState(false)
  const [settled, setSettled] = useState(collapsed)
  const [hovered, setHovered] = useState(false)
  const [peekSuppressed, setPeekSuppressed] = useState(false)
  const [focusInside, setFocusInside] = useState(false)
  useEffect(() => {
    if (!collapsed) { setSettled(false); return }
    const timer = window.setTimeout(() => { setSettled(true) }, COLLAPSE_SETTLE_MS)
    return () => { window.clearTimeout(timer) }
  }, [collapsed])
  const windowsTitlebar = document.documentElement.hasAttribute('data-windows-titlebar')
  const wide = windowsTitlebar ? !collapsed : !collapsed || !settled
  const peeking = !windowsTitlebar && collapsed && settled && !peekSuppressed && (hovered || focusInside)
  const detailVisible = wide || peeking
  const lastWideWidth = useRef(width)
  if (!collapsed) lastWideWidth.current = width
  const everWide = useRef(!collapsed)
  if (!collapsed) everWide.current = true

  const column = useRef<HTMLDivElement>(null)
  const [pointerInside, setPointerInside] = useState(false)
  const hoverCloseTimer = useRef<number | undefined>(undefined)
  const lingerTimer = useRef<number | undefined>(undefined)
  const pointInsideColumn = (clientX: number, clientY: number): boolean => {
    const rect = column.current?.getBoundingClientRect()
    if (rect === undefined) return false
    return clientX >= rect.left && clientX <= rect.right
      && clientY >= rect.top && clientY <= rect.bottom
  }
  const armLinger = (): void => {
    if (lingerTimer.current !== undefined) return
    lingerTimer.current = window.setTimeout(() => {
      lingerTimer.current = undefined
      setPointerInside(false)
    }, SCROLLBAR_LINGER_MS)
  }
  const cancelLinger = (): void => {
    window.clearTimeout(lingerTimer.current)
    lingerTimer.current = undefined
  }
  const cancelHoverClose = (): void => {
    window.clearTimeout(hoverCloseTimer.current)
    hoverCloseTimer.current = undefined
  }
  const armHoverClose = (): void => {
    if (hoverCloseTimer.current !== undefined) return
    hoverCloseTimer.current = window.setTimeout(() => {
      hoverCloseTimer.current = undefined
      setHovered(false)
      setPeekSuppressed(false)
    }, HOVER_CLOSE_MS)
  }
  useEffect(() => {
    if (!pointerInside) return
    const onMove = (event: PointerEvent): void => {
      const inside = pointInsideColumn(event.clientX, event.clientY)
      if (inside) {
        cancelLinger()
        cancelHoverClose()
        setHovered(true)
      } else {
        armLinger()
        armHoverClose()
      }
    }
    document.addEventListener('pointermove', onMove)
    return () => {
      document.removeEventListener('pointermove', onMove)
      cancelLinger()
      cancelHoverClose()
    }
  }, [pointerInside])

  const buildVersion = localBuildVersion()
  const darwinDesktop = isDarwinDesktop()
  const toggleLabel = collapsed ? t('toggle.open') : t('toggle.collapse')
  const requestToggle = (): void => {
    if (collapsed) {
      setPeekSuppressed(false)
    } else {
      /* A click that explicitly collapses the panel wins over the pointer
         still resting on it. Hover preview is re-enabled only after the
         pointer genuinely leaves and enters the rail again. */
      cancelHoverClose()
      setHovered(false)
      setPeekSuppressed(true)
    }
    toggleSidebar()
  }
  const toggle = (
    <Tooltip label={toggleLabel} shortcutKeys={shortcut?.keys} delayMs={500} side="right">
      <button
        type="button"
        className={css.brandToggle}
        aria-label={toggleLabel}
        aria-keyshortcuts={shortcut?.aria}
        onClick={() => { requestToggle() }}
      >
        <span className={css.brandMark} aria-hidden="true">
          {renderSlot('sidebar.brand.mark', { size: 40 }, { fallback: <FishLogo size={40} /> })}
        </span>
        <IconPanelLeftOutlineRegular className={css.collapseGlyph} size={17} />
        {renderSlot('sidebar.toggle.badge', {})}
      </button>
    </Tooltip>
  )

  const identity = (
    <span className={css.brandIdentity} aria-hidden="true">
      <span className={css.brandName}>
        {renderSlot('sidebar.brand.name', {}, {
          fallback: buildVersion === undefined
            ? <span className={css.fallbackBrandName}>{t('brand.localBuild')}</span>
            : (
              <span className={css.localBuildBrand}>
                <span className={css.localBuildTitle}>{t('brand.localBuild')}</span>
                <span className={css.buildVersion}>{buildVersion}</span>
              </span>
            ),
        })}
      </span>
    </span>
  )

  return (
    <div
      ref={column}
      className={clsx(
        css.root,
        !detailVisible && css.collapsed,
        !detailVisible && everWide.current && css.railIn,
        peeking && css.peek,
        collapsed && wide && css.fading,
        !pointerInside && css.quietBars,
      )}
      style={detailVisible ? { width: collapsed ? Math.max(lastWideWidth.current, DEFAULT_EXPANDED_WIDTH) : width } : undefined}
      onPointerEnter={() => {
        cancelLinger()
        cancelHoverClose()
        setPointerInside(true)
        setHovered(true)
      }}
      onPointerLeave={(event) => {
        /* Expanding the preview changes this node from the 56px rail width to
           the full drawer width. Browsers can emit pointerleave while that
           geometry is being replaced, even though the physical pointer never
           left the resulting drawer. Do not use that synthetic boundary event
           to close the preview: the document-level pointermove above compares
           the pointer against the settled rectangle and owns dismissal. */
        if (pointInsideColumn(event.clientX, event.clientY)) cancelHoverClose()
        armLinger()
      }}
      onFocusCapture={() => { setFocusInside(true) }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocusInside(false)
      }}
    >
      {darwinDesktop && <div className={css.topStrip} data-window-drag />}
      <div className={css.shellBody}>
        <aside className={css.rail} aria-label={t('panels.label')}>
          {collapsed ? toggle : (
            <span className={css.brandToggle} aria-hidden="true">
              <span className={css.brandMark}>
                {renderSlot('sidebar.brand.mark', { size: 40 }, { fallback: <FishLogo size={40} /> })}
              </span>
              {renderSlot('sidebar.toggle.badge', {})}
            </span>
          )}
          <Tooltip label={t('agent.open')} delayMs={500} side="right">
            <button
              type="button"
              className={clsx(css.railButton, activePanelId === null && css.railButtonActive)}
              aria-label={t('agent.open')}
              aria-current={activePanelId === null ? 'page' : undefined}
              onClick={() => { selectPanel(null) }}
            >
              <IconNewChatOutlineRegular size={18} />
            </button>
          </Tooltip>
          {panels.length > 0 && (
            <nav className={css.panelList} aria-label={t('panels.label')}>
              {panels.filter(panel => panel.id !== 'plugins').map(({ id, label }) => (
                <PanelRow
                  key={id}
                  id={id}
                  label={label}
                  usePanelInfo={usePanelInfo}
                  selectPanel={selectPanel}
                  renderSlot={renderSlot}
                />
              ))}
            </nav>
          )}
          <div className={css.railSpacer} />
          <div className={css.footerActions}>
            {renderSlot('sidebar.footer.action', { wide: false })}
          </div>
          <div className={css.settingsArea}>
            {renderSlot('sidebar.settings', { wide: false })}
          </div>
        </aside>

        <section className={clsx(css.detail, css.wide)} aria-hidden={!detailVisible}>
          <header className={css.detailHeader}>
            <div className={css.detailBrandRow}>
              {darwinDesktop
                ? <span className={css.brand}>{identity}</span>
                : (
                  <button
                    type="button"
                    className={css.brand}
                    aria-label={t('session.new.label')}
                    aria-keyshortcuts={newShortcut?.aria}
                    onClick={() => { startSession() }}
                  >
                    {identity}
                  </button>
                )}
              <Tooltip label={toggleLabel} shortcutKeys={shortcut?.keys} delayMs={500} side="bottom">
                <button
                  type="button"
                  className={css.detailToggle}
                  aria-label={toggleLabel}
                  aria-keyshortcuts={shortcut?.aria}
                  onClick={(event) => {
                    event.currentTarget.blur()
                    requestToggle()
                  }}
                >
                  <IconPanelLeftOutlineRegular size={17} />
                </button>
              </Tooltip>
            </div>
            <strong>{t('agent.title')}</strong>
            <span>{t('agent.description')}</span>
          </header>

          <Tooltip label={t('session.new.label')} shortcutKeys={newShortcut?.keys} delayMs={500} disabled>
            <button
              type="button"
              className={css.newSession}
              aria-label={t('session.new.label')}
              aria-keyshortcuts={newShortcut?.aria}
              onClick={() => { startSession() }}
            >
              <span className={css.newSessionContent}>
                <IconEditOutlineRegular size={16} />
                <span>{t('session.new')}</span>
              </span>
              {newShortcut !== undefined && newShortcut.keys.length > 0 && (
                <span className={css.newSessionShortcut} aria-hidden="true">
                  <ShortcutKeys keys={newShortcut.keys} />
                </span>
              )}
            </button>
          </Tooltip>

          <button
            type="button"
            className={css.quickToggle}
            aria-expanded={quickOpen}
            aria-controls="aipm-quick-actions"
            onClick={() => { setQuickOpen(open => !open) }}
          >
            <IconSparkleRegular size={16} />
            <span>{t('quick.title')}</span>
            <IconChevronDownOutlineRegular className={css.quickChevron} size={14} />
          </button>

          {quickOpen && (
            <div className={css.quickDrawer} id="aipm-quick-actions">
              {QUICK_ACTIONS.map(action => (
                <button
                  key={action.id}
                  type="button"
                  className={css.quickAction}
                  onClick={() => {
                    startSession(undefined, { prompt: action.prompt, clearPreviousDraft: true })
                  }}
                >
                  <span className={css.quickIcon} aria-hidden="true">{action.icon}</span>
                  <span className={css.quickCopy}>
                    <strong>{t(action.title)}</strong>
                    <span>{t(action.description)}</span>
                  </span>
                  <IconChevronRightOutlineRegular className={css.quickArrow} size={12} />
                </button>
              ))}
            </div>
          )}

          <div className={css.regionArea}>
            {renderSlot('sidebar.workspaces', {
              wide: true,
              expandSidebar: () => { if (collapsed) toggleSidebar() },
            } satisfies SidebarSectionOwnerProps)}
          </div>
        </section>
      </div>
    </div>
  )
}
