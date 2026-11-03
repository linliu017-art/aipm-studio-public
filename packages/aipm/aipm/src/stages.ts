/** AIPM workbench stages: independent work areas, their folders, typical outputs, and skills. */

/** One progress stage. Its stable id also identifies legacy stage directories. */
export interface StageDefinition {
  /** Stable progress id, e.g. `01-立项`; new projects do not create a matching directory. */
  readonly id: string
  /** Short display title. */
  readonly title: string
  /** Typical outputs, used to route a task to its stage. */
  readonly outputs: string
  /** Kebab-case name of the stage's primary skill; absent until a skill is connected. */
  readonly skill?: string
}

/** Independent progress stages in display order; numbering is internal identity, not required steps. */
export const STAGES: readonly StageDefinition[] = [
  { id: '01-立项', title: '立项', outputs: '立项报告、问题定义、用户与调研、竞品分析、MVP 范围、决策矩阵', skill: 'ai-project-initiation' },
  { id: '02-需求分析', title: '需求分析', outputs: '用户调研、需求池、用户故事、优先级排序', skill: 'interview-me' },
  { id: '03-PRD', title: 'PRD', outputs: 'PRD 文档、需求列表、功能清单', skill: 'product-prd' },
  { id: '04-原型', title: '原型', outputs: 'HTML 可点击原型、交互说明、页面流程图', skill: 'baoyu-design' },
  { id: '05-需求评审', title: '需求评审', outputs: '评审材料、评审清单、评审问题与结论记录', skill: 'product-prd' },
  { id: '06-开发跟进', title: '开发跟进', outputs: '排期计划、进度周报、风险与依赖跟踪', skill: 'planning-and-task-breakdown' },
  { id: '07-测试验收', title: '测试验收', outputs: '验收标准、测试用例、验收清单、缺陷汇总', skill: 'product-prd' },
  { id: '08-上线', title: '上线', outputs: '上线检查清单、发布说明、埋点与监控方案、回滚预案' },
  { id: '09-复盘', title: '复盘', outputs: '数据复盘、经验总结、下一轮迭代建议' },
]

/** Stage ids in folder order. */
export const STAGE_IDS: readonly string[] = STAGES.map(stage => stage.id)

/** Skills any task may call on top of its stage skill. */
export const GENERAL_SKILLS: readonly string[] = [
  'agent-workshop', 'human-writing', 'idea-refine', 'product-teardown-standard', 'ai-company-research',
  'ai-concept-learning', 'prototype', 'spec-driven-development',
]

/**
 * Look up a stage by id.
 * @param id - stage id such as `03-PRD`.
 * @returns the stage definition, or undefined for an unknown id.
 */
export function findStage(id: string): StageDefinition | undefined {
  return STAGES.find(stage => stage.id === id)
}
