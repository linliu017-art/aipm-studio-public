/** The AIPM product pipeline: stage identities, folder names, and their driving skills. */

/** One pipeline stage. `id` doubles as the stage folder name inside a project. */
export interface StageDefinition {
  /** Ordered stage id and project subfolder name, e.g. `01-立项`. */
  readonly id: string
  /** Short display title. */
  readonly title: string
  /** Kebab-case name of the stage's primary skill; absent until a skill is connected. */
  readonly skill?: string
}

/** The seven stages in pipeline order. */
export const STAGES: readonly StageDefinition[] = [
  { id: '01-立项', title: '立项', skill: 'ai-project-initiation' },
  { id: '02-PRD', title: 'PRD 需求文档' },
  { id: '03-原型', title: '原型与交互' },
  { id: '04-AI专项', title: 'AI 专项设计' },
  { id: '05-评审', title: '评审材料' },
  { id: '06-上线', title: '上线方案与指标埋点' },
  { id: '07-复盘', title: '复盘与迭代' },
]

/** Stage ids in pipeline order. */
export const STAGE_IDS: readonly string[] = STAGES.map(stage => stage.id)

/** The stage a new project starts in. */
export const FIRST_STAGE_ID = '01-立项'

/** Skills every stage may call on top of its primary skill. */
export const GENERAL_SKILLS: readonly string[] = ['human-writing']

/**
 * Look up a stage by id.
 * @param id - stage id such as `02-PRD`.
 * @returns the stage definition, or undefined for an unknown id.
 */
export function findStage(id: string): StageDefinition | undefined {
  return STAGES.find(stage => stage.id === id)
}
