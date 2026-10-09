/** Nini Flow workbench plugin: the `aipm_stage` tool over the project state document. */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-agent'
import { GENERAL_SKILLS, STAGES, STAGE_IDS, findStage } from './stages.ts'
import { PROJECT_STATE_FILE, STAGE_STATUSES, initProject, readProject, updateStage, type ProjectState } from './store.ts'

export * from './stages.ts'
export * from './store.ts'
export * from './project-view.ts'

/** Stable Loader identity. */
export const name = 'aipm'

/** Services used by the scoped stage tool. */
export const inject = ['tools']

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
 */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'aipm_stage',
    description: 'Read or update the AIPM product project in the Session working directory. '
      + '"get" returns the independent stages with their status, typical outputs, and skills; "init" turns the working directory into a project '
      + `(stage folders ${STAGE_IDS.join(', ')}, ${PROJECT_STATE_FILE}, AGENTS.md); "update" records progress of one stage after a task changed its outputs. `
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
        return { summary: state === undefined ? `当前工作目录 ${cwd} 还不是 AIPM 项目，可以用 action "init" 创建。` : describe(state) }
      }
      if (args.action === 'init') {
        if (args.name === undefined) throw new Error('init requires name')
        const state = await initProject(cwd, { name: args.name, summary: args.summary ?? '' })
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
