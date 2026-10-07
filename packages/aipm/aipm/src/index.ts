/** AIPM Studio pipeline plugin: the `aipm_stage` tool over the project state document. */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-agent'
import { GENERAL_SKILLS, STAGES, STAGE_IDS, findStage } from './stages.ts'
import { PROJECT_STATE_FILE, STAGE_STATUSES, initProject, readProject, updateStage, type ProjectState } from './store.ts'

export * from './stages.ts'
export * from './store.ts'

/** Stable Loader identity. */
export const name = 'aipm'

/** Services used by the scoped stage tool. */
export const inject = ['tools']

const STATUS_LABELS: Record<string, string> = {
  not_started: '未开始',
  in_progress: '进行中',
  done: '已完成',
}

function describe(state: ProjectState): string {
  const rows = STAGES.map((stage) => {
    const entry = state.stages[stage.id] ?? { status: 'not_started' }
    const skill = stage.skill === undefined ? 'skill 待接入' : `主 skill：${stage.skill}`
    const note = entry.note === undefined ? '' : `；${entry.note}`
    const marker = stage.id === state.currentStage ? '→ ' : '  '
    return `${marker}${stage.id}（${stage.title}）：${STATUS_LABELS[entry.status]}；${skill}${note}`
  })
  return [
    `项目：${state.name}`,
    `概述：${state.summary || '（未填写）'}`,
    `当前阶段：${state.currentStage}`,
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
      + `"get" returns the stage table; "init" turns the working directory into a project (stage folders ${STAGE_IDS.join(', ')}, ${PROJECT_STATE_FILE}, AGENTS.md); `
      + '"update" changes one stage. Marking a stage "done" requires confirmed_by_user: true, which is allowed only after the user confirmed completion through ask_user_question. '
      + `Never edit ${PROJECT_STATE_FILE} directly.`,
    parameters: {
      action: { type: 'string', required: true, enum: ['get', 'init', 'update'], description: 'Operation to perform.' },
      name: { type: 'string', description: 'init: product name.' },
      summary: { type: 'string', description: 'init: one-line product summary.' },
      stage: { type: 'string', enum: [...STAGE_IDS], description: 'update: stage id.' },
      status: { type: 'string', enum: [...STAGE_STATUSES], description: 'update: new stage status.' },
      note: { type: 'string', description: 'update: short progress note shown on the stage board, e.g. "已完成第 3/8 站：需求池".' },
      confirmed_by_user: { type: 'boolean', description: 'update: true only when the user confirmed the stage is complete.' },
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
        ...(args.status === undefined ? {} : { status: args.status as (typeof STAGE_STATUSES)[number] }),
        ...(args.note === undefined ? {} : { note: args.note }),
        ...(args.confirmed_by_user === undefined ? {} : { confirmedByUser: args.confirmed_by_user }),
        sessionId: session.id,
      })
      return { summary: `已更新 ${args.stage}。\n${describe(state)}` }
    },
  }))
}
