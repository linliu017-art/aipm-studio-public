import type { MainPanelId } from './service.ts'

const KEY = 'dsh.layout.active-panel.v1'

/** Remember the selected panel for a reload of this browser tab. */
export function loadPanelForReload(): MainPanelId | null {
  try { return (sessionStorage.getItem(KEY) || null) as MainPanelId | null } catch { return null }
}

export function savePanelForReload(id: MainPanelId | null): void {
  try { if (id === null) sessionStorage.removeItem(KEY); else sessionStorage.setItem(KEY, id) } catch { /* Storage can be unavailable. */ }
}
