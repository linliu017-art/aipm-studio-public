import { FEATURES } from '../../src/workshop-catalog.ts'
import type { WorkshopProposal } from '../../src/workshop-schema.ts'

export function workshopProposal(): WorkshopProposal {
  const sourceText = '给自由职业者做一个 AI 收入助手，记录收入并按月汇总。第一版单人使用，由用户手动发起。写入之前必须确认，不向外发送账本。'
  return {
    sourceText,
    facts: [
      { key: 'goal', value: '记录收入并按月汇总', status: 'confirmed', source: '记录收入并按月汇总' },
      { key: 'users', value: '自由职业者', status: 'confirmed', source: '自由职业者' },
      { key: 'core_loop', value: '用户发起后记录收入，再查询汇总', status: 'confirmed', source: '记录收入并按月汇总' },
      { key: 'deliverable', value: '账目和汇总', status: 'confirmed', source: '记录收入并按月汇总' },
      { key: 'boundaries', value: '写入确认，不向外发送', status: 'confirmed', source: '写入之前必须确认，不向外发送账本' },
      { key: 'constraints', value: '成本待确认', status: 'open', source: '' },
    ],
    requirements: [{ id: 'FR1', title: '收入记录', description: '确认后记录用户输入的收入',
      acceptance: ['取消确认后不写入账本'], status: 'confirmed', source: '写入之前必须确认' }],
    metrics: ['记录准确率目标待确认'], unknowns: ['预算尚未确认'],
    features: FEATURES.map(feature => ({ id: feature.id, value: feature.id === 'destructive_ops' ? 'yes' : 'no',
      evidence: feature.id === 'destructive_ops' ? '写入之前必须确认' : '第一版单人使用，由用户手动发起' })),
    design: {
      elements: { tools: ['记录账目'], knowledge: ['账目字段'], observation: ['检查保存状态'], action: ['本地数据写入'], permissions: ['用户确认'] },
      tools: [{ name: 'record_income', input: '收入金额', output: '账目编号', sideEffect: '写入账本', permission: 'ask', layer: '6' }],
      systemPrompt: '帮助自由职业者记录收入，写入前请求确认，不向外发送账本。',
      contextMemory: '会话内保留本次输入；仅在本地保存用户确认后的账目。',
      failures: { toolFailure: '返回错误并保留草稿', hallucination: '没有凭据时提问，不编造金额', timeout: '提示重试', unauthorized: '拒绝写入' },
      observability: ['记录写入结果，不记录完整账本'], deployment: '建议本地服务，启动命令与配置方式待开发规格确定。',
      testing: ['单测记录工具；验证拒绝授权时不写账本'],
    },
  }
}
