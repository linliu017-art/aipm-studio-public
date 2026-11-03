---
description: "Nini Flow 的 AIPM 组合包和阶段状态工具，供用户与维护者了解按任务开展的产品工作及项目文件视图。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-aipm

[English](README.md) | 中文

## 概述

AIPM 预设帮助用户结合已有项目材料完成指定的产品产出。九个阶段是独立工作区域，不要求依次执行。阶段工具在当前项目目录记录进度，只读项目视图则为宿主归集材料和产出。该组合包内置于 Nini Flow 的 Web 和 Desktop 组合配置，不负责外围应用或模型提供商的实现。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用此包

在 Nini Flow 中选择 AIPM 预设，描述一项产品任务。预设使用已有材料，保存指定产出及其独立的文档历史版本，完成后停止。仅创建项目而没有具体任务时，会询问用户下一步想做什么，不会启动所有阶段。

### 项目状态

`aipm_stage` 工具使用 Session 的工作目录。`get` 读取项目进度；`init` 创建 `.aipm/project.json`，并在不存在项目指令文件时创建 `AGENTS.md`，不创建空的阶段目录。`update` 记录一个阶段的状态、备注、来源 Session 和更新时间。初始化拒绝已有项目或空名称。更新要求项目已初始化且阶段已知；状态 JSON 无效时，必须先修复才能继续写入阶段状态。项目指令要求通过工具更新状态，不直接编辑 JSON。

`aipm_document get` 只读列出文档及版本路径。`save` 接受完整文字或项目内已有文件的相对 `sourcePath`，更新时须提供准确文档 id 和预期版本；不传 id 就新建独立文档，即使标题相同也不合并。普通对话与工坊共用写入锁，通过一次原子替换 `.aipm/documents.json` 提交 `文档/` 下的不可变文件。过期保存会失败，批次失败时只清理未提交文件。`organize` 为识别出的旧产出建立快照并记录原路径，不修改原文件。索引损坏或路径重定向会阻止写入。内部元数据不显示在项目文档中，也不计入文档数量。

工坊保存还要求每项产出提供一个目标：已有文档 id 和读取时的版本，或不传 id、预期版本为零以创建独立文档。流程 expectedVersion 仍来自 current.version，用户可见版本以返回的 documents 为准。这样可以更新普通对话生成的同一文档，不另建同名副本；目标选择后发生的并发修改会导致保存被拒绝。

普通对话和工坊保存技术方案后，会使用当前会话模型发起一次不带工具的独立审稿。`aipm_review` 可按准确文档 id 和读取时的版本重新审查。报告单独归入评审文档，注明所审版本，只提供建议，不改写方案。模型检查需求遗漏、规则矛盾、可实施性、异常处理、验收设计和过度设计。输出无效、截断、超时或取消时明确提示审稿未完成，已保存方案保留。组合配置将 review.maxInputBytes 设为 120000、review.maxOutputTokens 设为 6000、review.timeoutMs 设为 120000；插件要求显式提供这些限制。独立请求的完整输入及结束输出、用量记录在 aipm/review-request 和 aipm/review-result 会话事件中。

工坊还提供已有项目反推 PRD 与项目差距检查。显式选择的源码目录只读，报告保存到独立工作台项目；可选需求文件使用源码目录内的相对路径。aipm_inspect scan/read/save 采用后台选定范围，跳过隐藏、凭据、依赖、生成文件和链接路径，返回有界文件行号摘录。保存条目必须引用已读证据并通过当前文件哈希检查；实现条目须有代码，需求差异须同时有用户选定需求和代码。报告区分代码可见、推断、需求差异、工程建议与待确认，注明读取范围，不声称执行过代码或测试。可选 inspection 配置启用该工具，并要求 maxEntries、maxFiles、maxDepth、maxFileBytes、maxReadLines、maxIndexBytes、maxEvidenceBytes、maxReportBytes，组合文件提供完整限制。产出作为独立文档保存，不覆盖已有 PRD。

### 组合配置

manifest（元数据清单）声明的[组合包补丁](cordis.patch.yml)扩展 Web 应用组合，并把 AIPM 设为新会话的默认预设。此私有工作区包随 Nini Flow 分发，本文不声称存在单独发布的 npm 安装包。自定义配置档案层的管理由 [app-boot](../../boot/app-boot/README.zh.md) 负责。


### 内置技能

| Skill | 用途 |
|---|---|
| [ai-project-initiation](skills/ai-project-initiation/SKILL.md) | 立项报告与范围决策 |
| [human-writing](skills/human-writing/SKILL.md) | 中文写作与改稿 |
| [interview-me](skills/interview-me/SKILL.md) | 需求澄清访谈 |
| [idea-refine](skills/idea-refine/SKILL.md) | 想法收敛与方案取舍 |
| [agent-workshop](skills/agent-workshop/SKILL.md) | AI 产品 PRD、组件选型与技术方案版本 |
| [product-prd](skills/product-prd/SKILL.md) | PRD、需求评审与验收标准 |
| [baoyu-design](skills/baoyu-design/SKILL.md) | HTML 原型、流程图和视觉设计 |
| [prototype](skills/prototype/SKILL.md) | 交互逻辑和状态验证原型 |
| [product-teardown-standard](skills/product-teardown-standard/SKILL.md) | 竞品体验与产品拆解 |
| [ai-company-research](skills/ai-company-research/SKILL.md) | 公司与客户调研 |
| [ai-concept-learning](skills/ai-concept-learning/SKILL.md) | AI 概念和技术理解 |
| [planning-and-task-breakdown](skills/planning-and-task-breakdown/SKILL.md) | 开发任务、依赖与实施顺序 |
| [spec-driven-development](skills/spec-driven-development/SKILL.md) | 工程规格与实施约束 |

每次只加载当前任务所需技能。技能自带的模板、脚本和方法文件随包分发，相对路径以技能目录为根。提问使用 ask_user_question，文件交付使用 present，计划和工程规格不能冒充已实施或已验收结果。浏览器、Office、图片生成及云服务需要实际工具支持；当前技能集不保证提供这些外部能力。

只提出新想法时，默认合并询问主要问题、本轮目标和竞品研究方式，目标与研究方式提供推荐项，提交后才按选择推进；已有答案不重问。用户要求一次一个时，每轮只问一个独立问题；明确任务跳过无关入口题。交流方式要求不写进产品简介，后台项目登记不在普通提问中逐字段复述，未确认的用户行为不作为事实。

Nini Flow 将新想法作为独立目录中的未分组对话启动；选择已有工作区则继续该项目。用户要求保存材料或交付产物前，草稿不初始化产品元数据。初始化通过 `aipm_stage` 完成，按需将目录登记为工作区、按产品命名并关联当前会话。方向判断使用 `idea-refine`；只有明确请求立项交付物时才加载 `ai-project-initiation`。已确认的接待答案和调研选择在技能间沿用。

未分组对话不是已登记的产品项目。项目页只显示已登记项目；保存产品时才初始化其工作区，不改变对话目录。

Agent 工坊使用当前对话模型和原生 `aipm_workshop` 工具。`get`、`select`、`check` 不初始化产品；`save` 要求当前项目已初始化，再次校验并拒绝过期流程版本，随后使用统一文档保存入口。每份指定文档独立递增版本，内部方案快照通过同一次文档索引提交关联。已有 `03-PRD/Agent工坊/V<n>/` 记录仍可读取。输出用户请求的 PRD 或方案文件，以及方案的自动审稿报告，保留旧版及其人工修改。适配器移植上游的特征到组件规则并保留 MIT 授权，不运行 Python 服务或第二套模型连接。

-----

工坊影响分析和开发交接须明确选择项目及当前文档版本。`aipm_delivery get` 先记录其哈希，再返回分析文本或归档元数据。`impact` 校验文档原文引用及可选的只读代码证据，单独保存建议报告；确认代码影响必须引用实现证据。`package` 只打包选中文件原内容、版本与哈希清单及给编程 AI 的说明，生成可下载 ZIP。缺少 PRD 或方案时如实注明，不自动生成。两种任务均拒绝已变化的输入，保留原文档。可空的 delivery 配置限定文件数量、单文件／模型输入／报告字节及压缩前后归档大小；省略时禁用这些工具。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节 — 点击展开</summary>

[阶段定义](src/stages.ts)为独立进展阶段关联典型产出和旧目录标识。[存储模块](src/store.ts)负责项目 JSON，通过临时文件和重命名写入，并保留已有项目指令。阶段更新与用户改名共用项目元数据文件锁，取得锁后重新读取状态，保留刚修改的名称和并发更新的阶段进度。[项目读取器](src/project-view.ts)组合 Workspace 标识、可选阶段状态和有界文件扫描，不写入这些来源。已知阶段目录内的文件归为产出，其他文件归为材料。读取器排除内部目录，并报告目录不可用、状态无效、扫描错误或截断，不丢弃 Workspace 标识。

[补丁](cordis.patch.yml)提供预设的任务指令、工具组合和内置 skill（技能）目录。[插件入口](src/index.ts)在挂载的 agent（智能体）作用域注册 `aipm_stage`、`aipm_document` 与 `aipm_workshop`；执行工具要求 Session 存在工作目录。Workspace 持久化和用户界面展示仍由各自的消费方包负责。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [AIPM 包组](../README.zh.md) — 包的位置与相邻子系统。
- [Workspace](../../workspace/workspace/README.zh.md) — 持久化项目标识和 Session 归属。
- [Agent 预设](../../preset/agent-preset/README.zh.md) — 预设选择与 agent 作用域组合。

-----

<a id="model-experience"></a>
## 模型体验

### 预设系统指令

#### 模型看到什么

选中的预设通过 `persona` 提供产品任务指令，通过 `agent-instructions` 提供项目指令，通过 skill 工具提供已加载的 skill 文本。完整预设文本由[补丁](cordis.patch.yml)负责，下方逐字引用开头段落，包括动态占位符 `{{model}}`。其他预设不会收到此 AIPM 组合配置。

##### 预设开头段落

```markdown
你是 Nini Flow 里的 AI 产品经理搭档，由 {{model}} 模型驱动。用户是产品经理，会直接交给你一项具体任务，例如"帮我生成一份立项报告""根据现有 PRD 准备需求评审材料""整理上线检查清单"。你的职责是把这一项任务做好，做完就停。
```

#### Token 影响

预设贡献固定指令正文，并替换所选模型和工作目录。项目指令与已加载 skill 按条件加入内容；`agent-instructions` 配置为 `maxBytes: 65536`。相应消费方负责渲染和上下文保留。

#### KV Cache 影响

预设未变化时，其重复指令文本保持不变。模型或工作目录替换值不同、项目指令修改或新加载 skill 都可能改变组装后的上下文。提示词位置和历史协调由提示词消费方负责，不保证提供商缓存复用。

### 阶段工具输入与结果

#### 模型看到什么

agent 作用域的 `aipm_stage` 声明暴露 `get`、`init` 和 `update`，并包含当前阶段标识和状态。[源码声明](src/index.ts)负责准确的参数描述。成功调用返回文本 `summary`，其中包含项目标识和阶段进度；初始化和更新包含操作后的项目说明。项目不存在时由 `get` 报告；状态无效或写入被拒绝时，工具调用失败。

#### Token 影响

工具挂载期间，其声明贡献固定描述和阶段标识。每次成功调用增加一个随数据变化的结果，包含九行阶段信息、已有备注和可用 skill。常规工具历史保留与压缩决定这些结果在上下文中保留多久。

#### KV Cache 影响

阶段定义未变化时，声明保持稳定。调用向工具历史追加结果；项目状态变化影响后续结果文本，不改变先前记录的结果。保存方案和显式审稿会发起一次独立模型请求，其他操作不会；不保证提供商缓存复用。 文档和工坊的工具声明加入固定操作说明。get 返回文档标识、路径与版本元数据，save 接收指定正文或本地文件引用，返回提交后的标识、版本与路径。正文通过显式读取进入作者对话；独立审稿接收选定版本的快照。历史元数据随保留版本增长，遵循普通工具历史保留与压缩规则。审稿输入仅包含指定方案版本与最新 PRD，受配置字节限制；不重放作者的推理或工具。独立审稿使用单独的提示词前缀，会增加输入、输出 token 和等待时间。 Delivery get 仅返回显式选中的版本元数据，影响分析时再返回 maxInputBytes 内的文本；快照和工具结果均记入日志。交接文件字节不进入模型上下文。影响分析输入随选中文档和变更变化，交接组装不新增模型请求。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- 工坊检查只验证结构和引用一致性，不证明材料真实、设计语义正确或实际验收通过。上游的模型投票、模拟试玩和代码生成不在此适配器范围内。
- 上线和复盘尚无专用 skill。测试验收复用 product-prd 的验收规划，实际测试需要可用执行工具和真实证据。
- 项目文件视图受宿主显式提供的深度和文件数量限制，不是完整文件索引，也不跟随符号链接条目。
- 阶段进展与文档分别提交。文档提交后的进展更新若失败，不会回滚已保存的文档。
- 内联阶段工具声明未进入自动生成的工具目录；源码仍是准确声明的参考。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
