/** Agent Workshop selection and mechanical checks, adapted from Hubo's MIT engine. */
import { COMPONENTS, FEATURES, FACT_KEYS } from './workshop-catalog.ts'
import type { WorkshopDeliverable, WorkshopFeature, WorkshopProposal } from './workshop-schema.ts'

/** One deterministic component decision. */
export interface WorkshopDecision {
  id: string
  name: string
  decision: '必选' | '二期' | '待确认' | '放弃'
  reason: string
}

/**
 * Select the upstream seventeen components from feature assessments.
 * @param features - model assessments; omitted features remain unconfirmed.
 * @returns ordered component decisions; the model cannot override them.
 */
export function selectWorkshopComponents(features: readonly WorkshopFeature[]): WorkshopDecision[] {
  const known = new Set<string>()
  for (const item of features) {
    if (!FEATURES.some(feature => feature.id === item.id)) throw new Error('Unknown Workshop feature: ' + item.id)
    if (known.has(item.id)) throw new Error('Duplicate Workshop feature: ' + item.id)
    known.add(item.id)
    if (item.value !== 'unknown' && item.evidence.trim() === '') throw new Error('Feature evidence is required: ' + item.id)
  }
  const decisions: WorkshopDecision[] = COMPONENTS.filter(item => item.always).map(item => ({
    id: item.id, name: item.name, decision: '必选', reason: item.when,
  }))
  const mapping = { yes: '必选', later: '二期', unknown: '待确认', no: '放弃' } as const
  for (const feature of FEATURES) {
    const component = COMPONENTS.find(item => item.id === feature.component)
    if (component === undefined) throw new Error('Unknown component in Workshop catalog: ' + feature.component)
    const assessment = features.find(item => item.id === feature.id)
    decisions.push({ id: component.id, name: component.name, decision: mapping[assessment?.value ?? 'unknown'],
      reason: assessment?.evidence || feature.question })
  }
  const required = decisions.filter(item => !['s01', 's02'].includes(item.id) && item.decision === '必选').length
  const eventual = decisions.filter(item => !['s01', 's02'].includes(item.id) && ['必选', '二期'].includes(item.decision)).length
  decisions.push({ id: 's15', name: '集成 Harness', decision: required >= 3 ? '必选' : eventual >= 3 ? '二期' : '放弃',
    reason: '第一版可选组件 ' + String(required) + ' 个，含二期 ' + String(eventual) + ' 个；三个及以上需要统一编排。' })
  return decisions.sort((a, b) => a.id.localeCompare(b.id))
}

/** Mechanical checks; warnings and open facts never imply independent model approval. */
export interface WorkshopCheck {
  errors: string[]
  warnings: string[]
  components: WorkshopDecision[]
}

/**
 * Check source citations, requirement acceptance and requested design completeness.
 * @param proposal - structurally validated proposal.
 * @param deliverables - artifacts the user requested.
 * @returns blocking errors, nonblocking warnings and deterministic selection.
 */
export function checkWorkshopProposal(proposal: WorkshopProposal, deliverables: readonly WorkshopDeliverable[]): WorkshopCheck {
  const errors: string[] = []
  const warnings: string[] = []
  if (proposal.sourceText.trim() === '') errors.push('缺少用户原话或用户提供的材料')
  if (deliverables.length === 0 || new Set(deliverables).size !== deliverables.length) errors.push('交付类型必须非空且不能重复')
  for (const key of FACT_KEYS) {
    if (proposal.facts.filter(fact => fact.key === key).length !== 1) errors.push('需求事实必须且只能包含一次：' + key)
  }
  for (const fact of [...proposal.facts, ...proposal.requirements]) {
    if (fact.status === 'confirmed' && (fact.source.trim() === '' || !proposal.sourceText.includes(fact.source))) {
      errors.push('已确认条目缺少原文依据：' + ('key' in fact ? fact.key : fact.id))
    }
    if (fact.status === 'open') warnings.push('待确认：' + ('key' in fact ? fact.key : fact.id))
  }
  const requirementIds = new Set<string>()
  for (const requirement of proposal.requirements) {
    if (!/^FR[1-9]\d*$/.test(requirement.id) || requirementIds.has(requirement.id)) errors.push('需求编号应唯一且形如 FR1：' + requirement.id)
    requirementIds.add(requirement.id)
    if (!requirement.title.trim() || !requirement.description.trim() || !requirement.acceptance.some(item => item.trim())) {
      errors.push('需求需要标题、内容与验收条件：' + requirement.id)
    }
  }
  if (proposal.requirements.length === 0) errors.push('至少整理一项功能需求')
  if (!proposal.metrics.some(item => item.trim())) errors.push('请填写成功指标；未定时明确写待确认')
  for (const feature of proposal.features ?? []) {
    if (feature.value === 'later' && (!proposal.sourceText.includes(feature.evidence)
      || !/(二期|以后|未来|后续版本|下一版|phase\s*2|later)/i.test(feature.evidence))) {
      errors.push('二期安排需要用户原文依据，否则标为待确认：' + feature.id)
    }
  }
  let components: WorkshopDecision[] = []
  try { components = selectWorkshopComponents(proposal.features ?? []) } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
  }
  if (deliverables.includes('plan')) {
    if (proposal.features?.length !== FEATURES.length) errors.push('方案需要评估全部十四个能力特征；未知项用 unknown')
    const design = proposal.design
    if (design === undefined) errors.push('缺少方案设计')
    else {
      if (design.tools.length === 0) errors.push('方案至少描述一个领域工具')
      const names = new Set<string>()
      for (const tool of design.tools) {
        if (!/^[a-z][a-z0-9_]*$/.test(tool.name) || names.has(tool.name)) errors.push('工具名应唯一且为 snake_case：' + tool.name)
        names.add(tool.name)
        if (!tool.input.trim() || !tool.output.trim() || !tool.sideEffect.trim()) errors.push('请完整说明工具输入、输出和副作用：' + tool.name)
        if (tool.permission === 'allow' && !/^(无|没有|只读|none)/i.test(tool.sideEffect.trim())) {
          warnings.push('有副作用却默认允许，请核对授权：' + tool.name)
        }
      }
      for (const [name, items] of Object.entries(design.elements)) {
        if (!items.some(item => item.trim())) errors.push('五要素缺少内容：' + name)
      }
      for (const [scene, handling] of Object.entries(design.failures)) {
        if (!handling.trim()) errors.push('缺少降级处理：' + scene)
      }
      if (!design.systemPrompt.trim() || !design.contextMemory.trim() || !design.deployment.trim()) errors.push('请补全提示词、上下文策略与部署说明')
      if (!design.testing.some(item => item.trim()) || !design.observability.some(item => item.trim())) errors.push('请补全测试设计和可观测方案')
      if (proposal.features?.some(item => item.id === 'destructive_ops' && item.value === 'yes')
        && !design.tools.some(tool => tool.permission === 'ask' || tool.permission === 'deny')) errors.push('敏感操作需要确认或拒绝规则')
    }
  }
  return { errors, warnings, components }
}
