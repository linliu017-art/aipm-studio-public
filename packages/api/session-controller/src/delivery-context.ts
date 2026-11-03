/** Admission and host-only fold for selected-document impact and handoff tasks. */
import type { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import { prepareInspectionTarget } from './inspection-context.ts'
import type { DeliverySelection, DeliveryState, InspectionTarget, WorkshopTaskOptions } from './types.ts'

/**
 * Resolve explicit saved-document selection without modifying project files.
 * @param session - receiving project Session.
 * @param options - submitted Workshop mode and selections.
 * @param requestId - admitted human request identity.
 * @param request - exact human task text.
 * @returns selected task and optional existing read-only repository scope.
 */
export async function prepareDelivery(
  session: Session, options: WorkshopTaskOptions | undefined, requestId: string, request: string,
): Promise<{ selection: DeliverySelection; inspection?: InspectionTarget } | undefined> {
  if (options?.mode !== 'impact' && options?.mode !== 'handoff') return undefined
  const documents = options.delivery?.documents
  if (!documents?.length || new Set(documents.map(row => row.id)).size !== documents.length
    || documents.some(row => !row.id.trim() || !Number.isSafeInteger(row.version) || row.version < 1)
    || !request.trim()) throw new RemoteError('gateway/bad-request', '请选择已有项目文档并填写本轮任务。', {})
  const sourcePath = options.delivery?.sourcePath?.trim()
  const inspection = options.mode === 'impact' && sourcePath
    ? await prepareInspectionTarget(session, { mode: 'gaps', output: 'prd', inspection: { sourcePath } }) : undefined
  return { selection: { requestId, task: options.mode, request, documents,
    ...inspection === undefined ? {} : { sourceRoot: inspection.sourceRoot } },
  ...inspection === undefined ? {} : { inspection } }
}

/**
 * Install the selected-document task and observed hashes; a new human task releases the old scope.
 * @param ctx - Host Session Controller with projection registry.
 */
export function installDeliveryProjection(ctx: Context): void {
  ctx.sessionProjections.register<'workshopDelivery', DeliveryState>({
    key: 'workshopDelivery', stateVersion: 1,
    stateSchema: z.object({ selection: z.object({ requestId: z.string(), task: z.enum(['impact', 'handoff']), request: z.string(),
      documents: z.array(z.object({ id: z.string(), version: z.number() })), sourceRoot: z.string().optional() })
      .transform(value => ({ requestId: value.requestId, task: value.task, request: value.request, documents: value.documents,
        ...value.sourceRoot === undefined ? {} : { sourceRoot: value.sourceRoot } })).nullable(),
    snapshot: z.object({ documents: z.array(z.object({ id: z.string(), version: z.number(), hash: z.string() })) }).nullable() }),
    init: () => ({ selection: null, snapshot: null }),
    apply: (state, event) => {
      if (event.type === 'workshop/delivery-start') return { selection: event.data, snapshot: null }
      if (event.type === 'workshop/delivery-snapshot') return { ...state, snapshot: event.data }
      if (event.type === 'user/message' && event.data.source.kind === 'user' && state.selection !== null
        && (!('rpcId' in event.data.source) || event.data.source.rpcId !== state.selection.requestId)) return { selection: null, snapshot: null }
      return state
    },
  })
}
