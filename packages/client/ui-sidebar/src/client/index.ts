/** Registers the sidebar shell and global panel navigation. */
import type {} from '@deepseek-ai/dsh-client-product-analytics/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { WorkshopTaskOptions } from '@deepseek-ai/dsh-api-session-controller/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { fileAddressFor } from '@deepseek-ai/dsh-util-workspace-path'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the Session root standard-props merge.
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { SidebarPanelMetadata, SidebarRootInjected } from './contract/slots.ts'
import {
  type AipmPanelsInjected, ProjectsPanel, ProjectsPanelIcon,
} from './AipmPanels.tsx'
import { WorkshopPanel, WorkshopPanelIcon, type WorkshopPanelInjected } from './WorkshopPanel.tsx'
import { downloadHandoff } from './handoff-download.ts'
import { readProjectView, type ProjectRemoteCarrier } from './project-reader.ts'
import { ShellHeader, SidebarRoot } from './SidebarRoot.tsx'
import { en, zh, type SidebarKey } from './locales.ts'

export type {
  SidebarBrandMarkOwnerProps, SidebarBrandNameOwnerProps, SidebarFooterActionOwnerProps,
  SidebarPanelIconOwnerProps, SidebarPanelMetadata,
  SidebarRootComponentProps, SidebarRootInjected, SidebarSectionOwnerProps, SidebarSettingsOwnerProps,
} from './contract/slots.ts'
export type { SidebarKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Sidebar controls and global panel copy. */
    sidebar: SidebarKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'sidebar'
const PROJECTS_PANEL_ID = 'aipm-projects' as MainPanelId
const WORKSHOP_PANEL_ID = 'aipm-workshop' as MainPanelId

interface WorkspaceNavigation {
  startWorkshop(workspaceId: WorkspaceId | undefined, task: string, options: WorkshopTaskOptions): Promise<void>
  startSession(
    workspaceId?: Parameters<SidebarRootInjected['startSession']>[0],
    options?: Parameters<SidebarRootInjected['startSession']>[1],
  ): void
  openSession(sessionId: SessionId, options?: { readonly preservePanel?: boolean }): void
}

/** Services required by the sidebar plugin. */
export const inject = [
  'slots', 'layout', 'uiWorkspace', 'locale', 'shortcuts',
  'remote', 'remote.workspaceFiles', 'remote.workspace', 'sidebarRight',
]

/** Registers the sidebar shell and its service callbacks.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  const workspaceNavigation = ctx.get('uiWorkspace') as WorkspaceNavigation
  const projectRemote = ctx.get('remote') as ProjectRemoteCarrier
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sidebar: dictionaries')
  const panels = createSnapshotStore<readonly SidebarPanelMetadata[]>([])
  const syncPanels = (): void => {
    const next = ctx.slots.entriesOfSlot('sidebar.panellist').map(({ options }) => {
      // The list registration requires an id; StoredEntry erases the slot kind.
      const id = options.id as MainPanelId
      return { id, order: options.order ?? 0, label: resolveSlotLabel(options.label) ?? id }
    }).sort((a, b) => a.order - b.order)
    const previous = panels.getSnapshot()
    if (previous.length === next.length && previous.every((panel, index) => {
      const candidate = next[index] as SidebarPanelMetadata
      return panel.id === candidate.id && panel.order === candidate.order && panel.label === candidate.label
    })) return
    panels.set(next)
  }
  ctx.effect(() => ctx.slots.subscribe('sidebar.panellist', syncPanels), 'ui-sidebar: panel entries')
  ctx.effect(() => ctx.locale.subscribe(syncPanels), 'ui-sidebar: panel labels')

  const injectProps = (): SidebarRootInjected => ({
    // The shell's New Session button rides the Workspace UI's shared action
    // (automatic default Workspace, then current or recent Workspace).
    startSession: (workspaceId, options) => { workspaceNavigation.startSession(workspaceId, options) },
    selectPanel: (id) => {
      if (id === 'plugins' || id === 'schedules') ctx.get('productAnalytics')?.track('sidebar_menu_click', { menu_name: id === 'plugins' ? 'plugin' : 'cron' })
      if ((id === PROJECTS_PANEL_ID || id === WORKSHOP_PANEL_ID || id === 'schedules') && ctx.sidebarRight.isExpanded()) ctx.sidebarRight.toggleExpanded()
      ctx.layout.selectPanel(id)
    },
    hooks: { panels, shortcuts: ctx.shortcuts.catalog },
  })
  ctx.slots.inject('shell.header', () => ctx.slots.register({
    name: 'shell.header',
    locale: NS,
    inject: injectProps,
  }, ShellHeader))
  ctx.slots.inject('sidebar', () => ctx.slots.register({
    name: 'sidebar',
    locale: NS,
    children: {
      'sidebar.brand.mark': { kind: 'single', scope: 'root' },
      'sidebar.brand.name': { kind: 'single', scope: 'root' },
      'sidebar.panellist': { kind: 'list', scope: 'root' },
      'sidebar.workspaces': { kind: 'single', scope: 'root' },
      'sidebar.settings': { kind: 'single', scope: 'root' },
      'sidebar.footer.action': { kind: 'list', scope: 'root' },
    },
    inject: injectProps,
  }, SidebarRoot))
  const aipmPanelsInjected = (): AipmPanelsInjected => ({
    renameProject: async (workspaceId, title) => {
      const t = ctx.locale.bind(NS)
      const result = await ctx.remote.workspace.renameProject({ workspaceId, title })
        .catch(() => { throw new Error(t('projects.name.failed')) })
      if (!result.ok) {
        throw new Error(t(result.error.code === 'workspace/name-conflict' ? 'projects.name.conflict' : 'projects.name.failed'))
      }
    },
    readProject: (workspace, sessionId, signal) => readProjectView(projectRemote.workspaceFiles, workspace, sessionId, signal),
    downloadHandoff: (sessionId, path) => downloadHandoff(ctx.remote.workspaceFiles, sessionId, path),
    reviewProjectPlan: (workspaceId, documentId, title, version) => workspaceNavigation.startWorkshop(
      workspaceId, ctx.locale.bind(NS)('documents.reviewTask', { name: title, version }),
      { mode: 'review', output: 'plan', reviewTarget: { documentId, version } },
    ),
    openProjectSession: (sessionId) => { workspaceNavigation.openSession(sessionId) },
    startWorkspaceSession: (workspaceId: WorkspaceId) => {
      workspaceNavigation.startSession(workspaceId)
    },
    openProjectFile: (sessionId, workspaceRoot, relativePath) => {
      workspaceNavigation.openSession(sessionId, { preservePanel: true })
      const open = (): void => {
        try {
          ctx.sidebarRight.openResource(fileAddressFor(sessionId, workspaceRoot, relativePath), { position: 'right' })
        } catch (error) {
          console.warn('open Nini Flow project file rejected:', error)
        }
      }
      if (typeof window === 'undefined') queueMicrotask(open)
      else window.requestAnimationFrame(open)
    },
  })
  const workshopInjected = (): WorkshopPanelInjected => ({
    readProject: (workspace, sessionId, signal) => readProjectView(projectRemote.workspaceFiles, workspace, sessionId, signal),
    startWorkshop: request => workspaceNavigation.startWorkshop(
      request.workspaceId, request.task || ctx.locale.bind(NS)(request.mode === 'reverse' ? 'workshop.inspection.reverseTask'
        : request.mode === 'gaps' ? 'workshop.inspection.gapsTask' : request.mode === 'handoff' ? 'workshop.delivery.defaultTask' : 'workshop.materialsTask'),
      { mode: request.mode, output: request.output, ...request.inspection === undefined ? {} : { inspection: request.inspection },
        ...request.delivery === undefined ? {} : { delivery: request.delivery } },
    ),
  })
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: WORKSHOP_PANEL_ID, locale: NS, inject: workshopInjected,
  }, WorkshopPanel))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: WORKSHOP_PANEL_ID, order: -30, locale: NS,
    label: () => ctx.locale.bind(NS)('workshop.panel'),
  }, WorkshopPanelIcon))
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: PROJECTS_PANEL_ID, locale: NS, inject: aipmPanelsInjected,
  }, ProjectsPanel))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: PROJECTS_PANEL_ID, order: -20, locale: NS,
    label: () => ctx.locale.bind(NS)('projects.panel'),
  }, ProjectsPanelIcon))
  syncPanels()
}
