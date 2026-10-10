/** Nini Flow's navigation rail, Agent launcher, quick-action drawer, and history seat. */
import { useState, type ReactNode } from 'react'
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
  IconSearchOutlineRegular,
  IconSparkleRegular,
  isDarwinDesktop,
  ShortcutKeys,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ShellHeaderComponentProps, SidebarPanelMetadata, SidebarRootComponentProps, SidebarRootInjected } from './contract/slots.ts'
import type { SidebarKey } from './locales.ts'
import css from './SidebarRoot.module.css'

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

/** Full-width page title, above every content column. */
export function ShellHeader({
  usePanels,
  usePanelInfo,
  t,
}: ShellHeaderComponentProps) {
  const panels = usePanels(snapshot => snapshot)
  const activePanelId = usePanelInfo(info => info.activePanelId)

  return (
    <header className={css.topNavigation} data-window-drag>
      <span className={css.topPageTitle}>
        {panels.find(panel => panel.id === activePanelId)?.label ?? t('agent.title')}
      </span>
    </header>
  )
}

/** Render the permanent rail and the conversation-only history pane. */
export function SidebarRoot({
  width,
  startSession,
  selectPanel,
  usePanels,
  useShortcuts,
  usePanelInfo,
  t,
  renderSlot,
}: SidebarRootComponentProps) {
  const panels = usePanels(snapshot => snapshot)
  const activePanelId = usePanelInfo(info => info.activePanelId)
  const newShortcut = useShortcuts(rows => rows.find(row => row.id === 'session.new'))
  const [quickOpen, setQuickOpen] = useState(false)
  const railOnly = activePanelId === 'aipm-projects' || activePanelId === 'schedules'
  const buildVersion = localBuildVersion()
  const darwinDesktop = isDarwinDesktop()
  const identity = (
    <span className={css.brandIdentity}>
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
    <div className={css.root} style={{ width }}>
      <div className={css.shellBody}>
        <aside className={css.rail} aria-label={t('panels.label')}>
          <div className={css.railBrand} aria-hidden="true">
            {renderSlot('sidebar.brand.mark', { size: 30 }, { fallback: <FishLogo size={30} /> })}
          </div>
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

        <section className={css.detail} hidden={railOnly}>
          <header className={css.detailHeader}>
            <div className={css.detailBrandRow}>
              {darwinDesktop ? <span className={css.brand}>{identity}</span> : <button
                type="button"
                className={css.brand}
                aria-label={t('session.new.label')}
                aria-keyshortcuts={newShortcut?.aria}
                onClick={() => { startSession() }}
              >
                {identity}
              </button>}
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
            {renderSlot('sidebar.workspaces', {})}
          </div>
        </section>
      </div>
    </div>
  )
}
