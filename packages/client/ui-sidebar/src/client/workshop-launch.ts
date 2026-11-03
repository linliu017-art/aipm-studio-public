/** Typed Workshop launch choices; workflow prose is owned by the Host. */
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { WorkshopTaskOptions } from '@deepseek-ai/dsh-api-session-controller/types'

/** Landing-page tasks; none imply automatic product registration. */
export type WorkshopMode = Exclude<WorkshopTaskOptions['mode'], 'review'>
/** Requested artifact scope, independent of entry mode. */
export type WorkshopOutput = WorkshopTaskOptions['output']
/** User choices submitted directly to a fresh Workshop conversation. */
export interface WorkshopStartRequest extends WorkshopTaskOptions {
  task: string
  workspaceId?: WorkspaceId
}
