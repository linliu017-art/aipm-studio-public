/** Agent Workshop catalog adapted from Hubo, MIT; see skills/agent-workshop/references/LICENSE. */

/** Imported fact keys for the native Workshop adapter. */
export const FACT_KEYS = [
  'goal',
  'users',
  'core_loop',
  'deliverable',
  'boundaries',
  'constraints',
] as const

/** Imported fact labels for the native Workshop adapter. */
export const FACT_LABELS = {
  'goal': '目标',
  'users': '用户',
  'core_loop': '核心闭环',
  'deliverable': '交付物',
  'boundaries': '边界',
  'constraints': '约束',
} as const

/** Imported features for the native Workshop adapter. */
export const FEATURES = [
  {
    'id': 'destructive_ops',
    'question': '是否涉及破坏性或敏感操作（删除、写入外部系统、支付、发送消息、隐私数据）？',
    'component': 's03',
  },
  {
    'id': 'audit_needed',
    'question': '是否需要审计、拦截、埋点、合规记录？',
    'component': 's04',
  },
  {
    'id': 'multi_step',
    'question': '单次交付是否需要先列计划再逐步推进并跟踪进度（多轮、可中断、要汇报进展）？固定顺序调用几个工具不算。',
    'component': 's05',
  },
  {
    'id': 'context_heavy',
    'question': '是否会出现上下文爆炸的子任务，或可并行的探索型子任务？',
    'component': 's06',
  },
  {
    'id': 'large_knowledge',
    'question': '领域知识库是否庞大、需要按需加载？',
    'component': 's07',
  },
  {
    'id': 'long_sessions',
    'question': '会话是否很长、工具输出或日志量是否很大？',
    'component': 's08',
  },
  {
    'id': 'cross_session_memory',
    'question': '是否需要跨会话记住用户偏好、决策、历史？',
    'component': 's09',
  },
  {
    'id': 'persistent_goals',
    'question': '目标是否需要持久化、支持断点续跑？',
    'component': 's10',
  },
  {
    'id': 'slow_operations',
    'question': '是否有耗时几分钟以上的慢操作需要不阻塞主流程？',
    'component': 's11',
  },
  {
    'id': 'scheduled',
    'question': '是否需要定时自动触发？',
    'component': 's12',
  },
  {
    'id': 'parallel_isolated',
    'question': '是否需要多任务并行且各自隔离工作区（多 Agent 团队）？',
    'component': 's13',
  },
  {
    'id': 'external_ecosystem',
    'question': '是否需要接入外部工具生态（MCP、第三方插件）？',
    'component': 's14',
  },
  {
    'id': 'fixed_orchestration',
    'question': '输入是否把流程写成固定的阶段序列（如「上传→翻译→标注→入库」）且各阶段无需模型临场决策？只描述产品体验、或流程里有模型判断分支的不算。',
    'component': 's16',
  },
  {
    'id': 'auto_completion',
    'question': '是否需要自动判断「何时算完成」（独立评估器）？',
    'component': 's17',
  },
] as const

/** Imported components for the native Workshop adapter. */
export const COMPONENTS = [
  {
    'id': 's01',
    'name': 'Agent Loop',
    'when': '一切基础：循环 + 工具',
    'productionPoints': '重试、超时、token 上限、stop_reason 完整处理',
    'always': true,
  },
  {
    'id': 's02',
    'name': '工具系统',
    'when': '需要调用外部系统/API/数据源',
    'productionPoints': 'JSON schema 严格、参数校验、错误回传格式统一',
    'always': true,
  },
  {
    'id': 's03',
    'name': '权限系统',
    'when': '涉及破坏性/敏感操作',
    'productionPoints': '白名单/黑名单、破坏性操作二次确认、审计日志、默认拒绝',
    'always': false,
  },
  {
    'id': 's04',
    'name': '钩子系统',
    'when': '需要审计、拦截、埋点',
    'productionPoints': 'PreToolUse 可阻断、PostToolUse 可观察、异常不影响主循环',
    'always': false,
  },
  {
    'id': 's05',
    'name': '任务规划',
    'when': '多步骤、需跟踪进度',
    'productionPoints': '计划持久化、状态流转、进度可查询',
    'always': false,
  },
  {
    'id': 's06',
    'name': '子 Agent',
    'when': '上下文会爆、任务可并行',
    'productionPoints': '独立消息列表、最终文本回传、超时回收',
    'always': false,
  },
  {
    'id': 's07',
    'name': '技能加载',
    'when': '领域知识库庞大',
    'productionPoints': '目录先行、按需展开、版本管理',
    'always': false,
  },
  {
    'id': 's08',
    'name': '上下文压缩',
    'when': '长会话、日志量大',
    'productionPoints': '分层压缩、先裁工具结果再摘要历史、保留权威指令',
    'always': false,
  },
  {
    'id': 's09',
    'name': '记忆系统',
    'when': '需跨会话记住偏好/决策',
    'productionPoints': '筛选→提取→整合三子系统、持久化 + 检索、冲突时用户指令优先',
    'always': false,
  },
  {
    'id': 's10',
    'name': '任务系统',
    'when': '目标需持久化、断点续跑',
    'productionPoints': '文件持久化、依赖图、原子状态变更、并发锁',
    'always': false,
  },
  {
    'id': 's11',
    'name': '后台任务',
    'when': '有慢操作需不阻塞',
    'productionPoints': '线程池、完成通知注入、超时与清理',
    'always': false,
  },
  {
    'id': 's12',
    'name': '定时调度',
    'when': '需定时自治触发',
    'productionPoints': '持久化调度、幂等、会话级作用域',
    'always': false,
  },
  {
    'id': 's13',
    'name': 'Agent 团队',
    'when': '多任务并行、需隔离工作区',
    'productionPoints': '原子认领、任务绑定 worktree、异步邮箱、类型化协议、关停流程',
    'always': false,
  },
  {
    'id': 's14',
    'name': 'MCP 插件',
    'when': '需接入外部工具生态',
    'productionPoints': '工具发现、mcp__server__tool 命名空间、连接失败降级',
    'always': false,
  },
  {
    'id': 's15',
    'name': '集成 Harness',
    'when': '上述机制需协同（选了 3 个以上可选组件）',
    'productionPoints': '单一循环、动态重建系统提示词、共享客户端、跨模块状态协调',
    'always': false,
  },
  {
    'id': 's16',
    'name': '工作流运行时',
    'when': '编排形态固定',
    'productionPoints': '脚本拥有编排、生命周期事件、journal 断点续跑',
    'always': false,
  },
  {
    'id': 's17',
    'name': '目标闭环',
    'when': '需自动判断「何时算完成」',
    'productionPoints': '独立评估器、目标不可能/失败/超限时交还控制权',
    'always': false,
  },
] as const

/** Imported layers for the native Workshop adapter. */
export const LAYERS = [
  [
    '①',
    '交互层',
    '谁在用、怎么用？',
    'CLI / Web / App / API；同步或异步；人机比',
  ],
  [
    '②',
    '产品层',
    '产品外壳是什么？',
    '会话管理、请求路由、账户、业务逻辑',
  ],
  [
    '③',
    'Agent 编排层',
    'Harness 如何运转？',
    'loop、工具分发、hooks、权限、记忆、任务、技能、压缩、子 agent / 团队、目标闭环',
  ],
  [
    '④',
    '模型层',
    '智能从哪来？',
    '主模型、辅助模型、路由、fallback、成本',
  ],
  [
    '⑤',
    '能力集成层',
    '如何触达外部世界？',
    '内部工具、MCP server、知识库、第三方 API',
  ],
  [
    '⑥',
    '数据层',
    '什么需要持久化？',
    '记忆、任务、会话历史、轨迹数据、日志指标',
  ],
  [
    '⑦',
    '基础设施层',
    '如何部署运行？',
    '单进程 / 服务 / 团队、沙箱、队列、调度、监控',
  ],
] as const
