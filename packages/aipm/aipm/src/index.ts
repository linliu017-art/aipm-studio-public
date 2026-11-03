/** Nini Flow workbench plugin: the `aipm_stage` tool over the project state document. */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-workspace'
import z from '@deepseek-ai/schemastery'
import { registerReviewTool, type ReviewConfig } from './plan-review.ts'
import { basename } from 'node:path'
import { registerInspectionTool, type InspectionConfig } from './inspection-tool.ts'
import { registerDeliveryTool, type DeliveryConfig } from './delivery-tool.ts'
import { registerDocumentTool } from './document-tool.ts'
import { registerWorkshopTool } from './workshop-tool.ts'
import { GENERAL_SKILLS, STAGES, STAGE_IDS, findStage } from './stages.ts'
import { PROJECT_STATE_FILE, STAGE_STATUSES, initProject, readProject, updateStage, type ProjectState } from './store.ts'

export * from './stages.ts'
export * from './store.ts'
export * from './project-view.ts'

/** Stable Loader identity. */
export const name = 'aipm'

/** Services used by the scoped stage tool. */
export const inject = ['tools']

/** Explicit bounds for automatic and manual technical-plan review. */
export interface Config {
  /** Required model-review input, output and time limits. */
  review: ReviewConfig
  /** Optional repository analysis policy; omission disables these source-reading tools. */
  inspection?: InspectionConfig | null
  /** Optional selected-document analysis and archive limits. */
  delivery?: DeliveryConfig | null
}
/** Loader-owned review budget and deadline validation. */
export const Config: z<Config> = z.object({ review: z.object({
  maxInputBytes: z.number().step(1).min(1).required(),
  maxOutputTokens: z.number().step(1).min(1).required(),
  timeoutMs: z.number().step(1).min(1).max(2147483647).required(),
}).required(), inspection: z.union([z.const(null), z.object({
  maxEntries: z.number().step(1).min(1).required(),
  maxFiles: z.number().step(1).min(1).required(), maxDepth: z.number().step(1).min(1).required(),
  maxFileBytes: z.number().step(1).min(1).required(), maxReadLines: z.number().step(1).min(1).required(),
  maxIndexBytes: z.number().step(1).min(1).required(), maxEvidenceBytes: z.number().step(1).min(1).required(),
  maxReportBytes: z.number().step(1).min(1).required(),
})]).default(null), delivery: z.union([z.const(null), z.object({
  maxFiles: z.number().step(1).min(1).required(), maxFileBytes: z.number().step(1).min(1).required(),
  maxInputBytes: z.number().step(1).min(1).required(), maxReportBytes: z.number().step(1).min(1).required(),
  maxArchiveBytes: z.number().step(1).min(1).required(), maxArchiveInputBytes: z.number().step(1).min(1).required(),
})]).default(null) })

const STATUS_LABELS: Record<string, string> = {
  not_started: '暂无产出',
  in_progress: '进行中',
  done: '已有产出',
}

function describe(state: ProjectState): string {
  const rows = STAGES.map((stage) => {
    const entry = state.stages[stage.id] ?? { status: 'not_started' }
    const skill = stage.skill === undefined ? '专属 skill 待接入' : `skill：${stage.skill}`
    const note = entry.note === undefined ? '' : `；最近：${entry.note}`
    return `- ${stage.id}（${STATUS_LABELS[entry.status]}；${skill}；典型产出：${stage.outputs}${note}）`
  })
  return [
    `项目：${state.name}`,
    `概述：${state.summary || '（未填写）'}`,
    `最近处理的阶段：${state.lastStage ?? '（无）'}`,
    '各阶段相互独立，只处理与本次任务相关的阶段：',
    ...rows,
    `通用 skill：${GENERAL_SKILLS.join('、')}`,
  ].join('\n')
}

/**
 * Register `aipm_stage` for the mounting agent scope.
 * @param ctx - agent-scoped services.
 * @param config - explicit independent-review policy.
 */
export function apply(ctx: Context, config: Config): void {
  if (config.inspection !== undefined && config.inspection !== null) registerInspectionTool(ctx, config.inspection)
  if (config.delivery !== undefined && config.delivery !== null) registerDeliveryTool(ctx, config.delivery)
  registerReviewTool(ctx, config.review)
  registerDocumentTool(ctx, config.review)
  registerWorkshopTool(ctx, config.review)
  ctx.tools.register(defineTool({
    name: 'aipm_stage',
    description: 'Read or update the AIPM product project in the Session working directory. '
      + '"get" returns the independent stages with their status, typical outputs, and skills; "init" turns the working directory into a project '
      + `(${PROJECT_STATE_FILE} and AGENTS.md, without empty stage folders); "update" records progress of one stage after a task changed its outputs. `
      + `Never edit ${PROJECT_STATE_FILE} directly.`,
    parameters: {
      action: { type: 'string', required: true, enum: ['get', 'init', 'update'], description: 'Operation to perform.' },
      name: { type: 'string', description: 'init: product name.' },
      summary: { type: 'string', description: 'init: one-line product summary.' },
      stage: { type: 'string', enum: [...STAGE_IDS], description: 'update: stage id.' },
      status: { type: 'string', enum: [...STAGE_STATUSES], description: 'update: in_progress while a task works on the stage, done once its output is written.' },
      note: { type: 'string', description: 'update: short note on what this task produced or changed, e.g. "生成立项报告.md 与 立项报告.html".' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          summary: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.summary }],
    },
    async execute(args, exec) {
      const session = exec.agent?.session
      const cwd = session?.header.cwd
      if (session === undefined || cwd === undefined) throw new Error('aipm_stage requires a Session with a working directory')
      if (args.action === 'get') {
        const state = await readProject(cwd)
        return { summary: state === undefined
          ? `当前独立工作目录：${cwd}。尚未登记产品；先澄清本轮目标，需要保存产物时再用 action "init" 登记。不要读取其他项目或为登记自行查看程序源码。`
          : `当前项目目录：${cwd}\n${describe(state)}\n只读写这个项目；另一个产品想法请通过工作台“聊一个新想法”入口创建独立对话，不覆盖当前项目。` }
      }
      if (args.action === 'init') {
        if (args.name === undefined) throw new Error('init requires name')
        const state = await initProject(cwd, { name: args.name, summary: args.summary ?? '' })
        const registry = ctx.get('workspaceRegistry')
        if (registry !== undefined) {
          const existing = await registry.resolveByPath(cwd)
          const workspace = existing ?? await registry.create(cwd)
          if (existing === undefined || basename(cwd).startsWith('idea-')) {
            await workspace.setTitle(`${state.name} · ${basename(cwd).slice(-6)}`)
          }
          await workspace.attachSession(session.id)
        }
        return { summary: `已创建项目。\n${describe(state)}` }
      }
      if (args.stage === undefined || findStage(args.stage) === undefined) throw new Error(`update requires stage, one of ${STAGE_IDS.join(', ')}`)
      const state = await updateStage(cwd, {
        stage: args.stage,
        ...(args.status === undefined ? {} : { status: args.status }),
        ...(args.note === undefined ? {} : { note: args.note }),
        sessionId: session.id,
      })
      return { summary: `已更新 ${args.stage}。\n${describe(state)}` }
    },
  }))
}
