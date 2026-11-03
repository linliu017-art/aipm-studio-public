/** Canonical repository selection and host-only inspection evidence projection. */
import type { Context } from '@deepseek-ai/cordis'
import { realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, sep } from 'node:path'
import { z } from 'zod'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { Session } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type { InspectionState, InspectionTarget, WorkshopTaskOptions } from './types.ts'

/**
 * Validate a user-selected source before admitting an analysis task.
 * @param session - destination Session; its directory cannot be inside the inspected source.
 * @param options - submitted Workshop choices.
 * @returns canonical analysis target, or undefined for another workflow.
 */
export async function prepareInspectionTarget(session: Session, options: WorkshopTaskOptions | undefined,
): Promise<InspectionTarget | undefined> {
  if (options?.mode !== 'reverse' && options?.mode !== 'gaps') return undefined
  const selected = options.inspection
  if (selected === undefined || !isAbsolute(selected.sourcePath)) {
    throw new RemoteError('gateway/bad-request', '请选择有效的绝对代码目录。', {})
  }
  try {
    const sourceRoot = await realpath(selected.sourcePath)
    if (!(await stat(sourceRoot)).isDirectory()) throw new Error('Not a directory')
    const destination = session.header.cwd
    if (destination === undefined) throw new Error('Missing destination')
    const child = relative(sourceRoot, await realpath(destination))
    if (child === '' || (!isAbsolute(child) && child !== '..' && !child.startsWith('..' + sep))) throw new Error('Source includes destination')
    const baselinePath = selected.baselinePath?.trim()
    if (baselinePath !== undefined && baselinePath !== '' && (isAbsolute(baselinePath) || baselinePath.includes('\\')
      || baselinePath.split('/').some(part => part === '' || part === '.' || part === '..'))) throw new Error('Invalid baseline')
    return { sourceRoot, task: options.mode, ...baselinePath ? { baselinePath } : {} }
  } catch (_error) {
    throw new RemoteError('gateway/bad-request', '代码目录不可用，或结果保存位置位于代码目录内。请选择独立的结果项目；需求文件须为代码目录内的相对路径。', {})
  }
}

/**
 * Install the authoritative, replayable target and read-evidence state once on the Host.
 * @param ctx - Session Controller context with projection registry.
 */
export function installInspectionProjection(ctx: Context): void {
  const evidence = z.object({ id: z.string(), path: z.string(), fileHash: z.string(), startLine: z.number(), endLine: z.number(),
    text: z.string(), kind: z.enum(['code', 'documentation', 'requirement']) })
  ctx.sessionProjections.register<'workshopInspection', InspectionState>({
    key: 'workshopInspection', stateVersion: 1,
    stateSchema: z.object({ target: z.object({ requestId: z.string().optional(), sourceRoot: z.string(), task: z.enum(['reverse', 'gaps']), baselinePath: z.string().optional() }).transform(value => ({ sourceRoot: value.sourceRoot, task: value.task,
      ...value.requestId === undefined ? {} : { requestId: value.requestId },
      ...value.baselinePath === undefined ? {} : { baselinePath: value.baselinePath } })).nullable(),
    scan: z.object({ files: z.array(z.object({ path: z.string(), bytes: z.number() })),
      truncated: z.boolean(), skipped: z.number() }).nullable(),
    evidence: z.array(evidence) }),
    init: () => ({ target: null, scan: null, evidence: [] }),
    apply: (state, event) => {
      if (event.type === 'user/message' && event.data.source.kind === 'user' && state.target?.requestId !== undefined
        && (!('rpcId' in event.data.source) || event.data.source.rpcId !== state.target.requestId)) return { target: null, scan: null, evidence: [] }
      if (event.type === 'workshop/inspection-start') return { target: event.data, scan: null, evidence: [] }
      if (event.type === 'workshop/inspection-scan') return { ...state, scan: event.data }
      if (event.type === 'workshop/inspection-evidence') return { ...state, evidence: [...state.evidence, event.data] }
      return state
    },
  } satisfies ProjectionDefinition<'workshopInspection', InspectionState>)
}
