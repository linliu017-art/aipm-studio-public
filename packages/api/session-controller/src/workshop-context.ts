/** Host-owned Workshop skill loading and selected workflow instructions. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage, type UserMessage } from '@deepseek-ai/dsh-llm'
import { isUserInvocable, renderSkillContent } from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-agent-preset-registry/types'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { WorkshopTaskOptions } from './types.ts'

/**
 * Load the selected Session's actual skill and keep workflow prose outside user text.
 * @param ctx - Host preset and skill registries.
 * @param agent - exact Session Agent receiving the user task.
 * @param options - validated launch mode and requested deliverables.
 * @returns canonical, loggable skill invocation context for the same admission.
 */
export async function workshopContext(ctx: Context, agent: Agent, options: WorkshopTaskOptions): Promise<UserMessage> {
  const registry = ctx.get('agentPresets')?.serviceFor(agent, 'skills') ?? ctx.get('skills')
  const skill = await registry?.get('agent-workshop', { cwd: agent.session.header.cwd, scope: agent })
  if (skill === undefined || !isUserInvocable(skill)) {
    throw new RemoteError('gateway/internal', 'Agent Workshop is unavailable in this Session.', {})
  }
  const target = options.reviewTarget
  if (options.mode === 'review' && (target === undefined || !target.documentId.trim()
    || !Number.isSafeInteger(target.version) || target.version < 1)) {
    throw new RemoteError('gateway/internal', 'Select a saved plan revision before reviewing.', {})
  }
  const mode = {
    impact: '本轮只做迭代影响分析，不改写已有文档或代码。先 aipm_delivery get 读取选定文档快照及变更原文；有选定代码目录时必须先用 aipm_inspect scan/read 读取代码证据，不得说成未选目录；未选时不读取。用 aipm_delivery impact 单独保存影响报告，列出受影响功能、流程、数据、接口、权限、架构、文档、测试、优先级和待确认项。',
    handoff: '本轮只打包开发交接包。先 aipm_delivery get 锁定选定文档版本，再 aipm_delivery package 生成 ZIP，用 present 交付。不生成新需求或方案，不运行代码，不调用编程 AI，不修改原文档。',
    reverse: '本轮从已有代码反推 PRD。用 aipm_inspect scan/read 读取后台选定目录，逐步收集真实文件和行号证据，再用该工具 save 保存反推 PRD。明确区分代码可见、推断和待确认，不生成技术方案。',
    gaps: '本轮只检查项目差距。用 aipm_inspect scan/read 逐步检查后台选定代码；有用户选定需求文件时对照，没有时仅提出工程建议。用该工具 save 保存差距报告；不生成 PRD、技术方案，不修改代码，不运行命令或测试。',
    idea: '这是独立的新想法。先补齐必要信息，需要保存文件时再登记项目，不继承其他产品。',
    materials: '优先读取当前项目或用户随后提供的材料。没有材料时先等待补充，不臆造已经读过的内容。',
    review: '本轮只审查已有方案。调用 aipm_document get 找到用户指定文档及当前版本，再调用 aipm_review。不要生成或修改 PRD、技术方案，不要求补齐需求；审稿报告单独保存后交付。',
    iterate: '读取当前项目的最新工坊版本和实际文档，按用户新要求增量修改，保存下一版，保留旧版本和人工修改。',
  }[options.mode]
  const output = { prd: '只生成 PRD，不生成技术方案', plan: '只生成技术方案，不生成 PRD', both: '生成 PRD 和技术方案' }[options.output]
  const instructions = [
    '本会话从 Agent 工坊入口启动，已在后台加载上面的技能，直接按其流程处理用户任务，无需重复加载或要求用户再发送任务。',
    mode, options.mode === 'impact' || options.mode === 'handoff' ? '只处理已选文档，不使用 Bash 或普通文件工具修改、增删原文档，不自行扩展源码范围。开发交接包只含选中文档和开发说明，不执行开发。影响结论是建议，未确认部分标为待确认；用户采纳后另开明确的修改任务。' : options.mode === 'reverse' || options.mode === 'gaps' ? '只读选定源码，不使用 Bash、普通文件工具或其他目录绕过证据读取；不联网、不运行项目或测试。引用仅用已读取证据，未读内容和搜索未命中不能证明功能缺失。产出保存到当前工作台项目，与源码目录分离。' : options.mode === 'review' ? '本轮产出范围：只交付独立审稿报告。审查目标：' + JSON.stringify(target) + '。严格使用指定版本；若当前版本已变，提示刷新后重试。' : `本轮产出范围：${output}。`,
    '沿用已回答的问题和竞品选择，未确认内容标为待确认，不自动扩展到竞品研究、代码生成或部署。',
    '这些是工作方式和入口设置，不是产品功能，不要复述后台规则或把它们写进需求。用户当前明确要求的范围优先。',
  ].join('\n')
  return createUserMessage({
    source: { kind: 'skill-invocation', name: 'agent-workshop', form: 'instructions' },
    content: [{ type: 'text', text: renderSkillContent(skill) + '\n\n' + instructions }],
  })
}
