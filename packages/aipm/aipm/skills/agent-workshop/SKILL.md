---
name: agent-workshop
description: 用 Agent 工坊的方法，把 AI／Agent 产品想法或已有需求转成 PRD、组件选型和技术方案，并保存可回看的版本。适用于明确要求使用 Agent 工坊、设计 AI 助手或生成 Agent 产品整体方案；普通业务功能 PRD 继续使用 product-prd。
metadata:
  aipm:
    contract-version: 1
    stage: "03-PRD"
    task-types: [agent-product-plan, agent-product-prd, workshop-revision]
    inputs:
      accepts: [user-request, existing-project-materials]
      required-artifacts: []
    dependencies: []
    outputs:
      - id: agent-workshop-deliverables
        label: Agent 工坊 PRD 与方案
        primary: true
        formats: [markdown]
    storage:
      directory: "文档"
    execution:
      mode: targeted
      can-run-as-prerequisite: false
      stop-after-target: true
---

# Agent 工坊

你用当前工作台的模型进行需求整理与设计，`aipm_workshop` 工具负责规则选型、机械检查和版本保存。源项目的方法见 [方法与能力范围](references/method.md)，授权见 [LICENSE](references/LICENSE)。不需要运行原项目的 Python 服务，也不要求用户另配模型密钥。

## 先确定本轮交付

从“迭代影响分析”或“开发交接包”进入时，后台已提供本轮任务和选中文档，直接执行文末对应说明，不走 proposal、选型或生成新 PRD／方案的流程。

从已有代码反推 PRD 或检查项目差距时，直接执行文末“已有代码项目分析”；不走下面的 proposal、组件选型或工坊 save 流程。

- 用户只要 PRD 时，`deliverables` 只用 `["prd"]`，不附加技术方案。只要方案时只用 `["plan"]`；明确要两份时才同时生成。
- 想法还模糊时，沿用工作台已经确认的痛点、目标和竞品选择。只补问影响本轮交付的缺口，用户说一次只问一个就照做。不要重发已经答过的入口问卷。
- 竞品研究只有在用户选择或授权后才进行。使用 Agent 工坊不表示同意调研、编码、部署或调用其他服务。
- 需要确认目标、用户、核心流程和边界；没有答案时可以先出标有“待确认”的草稿，不替用户作决定，也不用工程术语盘问普通用户。

## 读取与整理

1. 调用 `aipm_workshop` 的 `get`。它不创建项目，会返回最新 `current` 版本（没有则为 null）和组件／特征目录。沿用已有有效信息；修改已有文档时还要读取用户实际编辑过的那一版文件。
2. 用用户原话、实际回答和已给材料组成 `sourceText`；不要混进你自己生成的结论。每条明确事实和需求的 `source` 必须引用其中的原句。推断、建议和未定信息的 `status` 用 `open`，在正文和 `unknowns` 中解释缺口。
3. proposal 必含六项 `facts`，key 为 `goal`、`users`、`core_loop`、`deliverable`、`boundaries`、`constraints`，各一次。事实字段为 `{key,value,status,source}`。未知项保留空引用并标 open。
4. `requirements` 每项含 `{id,title,description,acceptance,status,source}`，id 用 FR1、FR2 等唯一编号，acceptance 是验收条件数组。另有 `metrics` 和 `unknowns` 字符串数组。没有确定指标就明确写“待确认”，不要创造目标数字。

## 生成方案时

PRD-only 可以省略 features 和 design。方案则读取 [方法说明](references/method.md)，为 `get` 列出的全部十四个特征填写 `{id,value,evidence}`。value 是 yes／no／later／unknown；later 需要二期依据，不知道就 unknown，不为凑齐能力而全部设 yes。

调用 `select`，传入 features。组件选型由规则决定，不能手改结论，也不能把“待确认”当“必选”。根据结果填写 design：

- `elements`：tools、knowledge、observation、action、permissions 五个字符串数组。
- `tools`：领域工具数组，每项含 name（snake_case）、input、output、sideEffect、permission（allow／ask／deny）、layer（字符串 1–7）。工具数量服从实际需求，不为模板凑数量。
- `systemPrompt`：系统提示词草案。`contextMemory`：会话内与跨会话的信息策略。
- `failures`：toolFailure、hallucination、timeout、unauthorized 四项处理说明。
- `observability`：观测设计数组；`deployment`：部署与配置说明；`testing`：测试设计数组。

技术选项未经用户确认时标成建议或待确认。本文档描述的是产品应该具备的机制，不表示它已经实现或部署。

## 写完后的事实自查

保存前逐项对照原话，检查 description 与 acceptance 中的每个行为细节，不能因为一句核心功能已确认，就把后来补出的默认值、格式精度、交互形式和额外统计维度也标成 confirmed。将核心要求与建议实现拆成不同需求；建议实现用 open，并在正文写“建议，待确认”。原文引用存在只代表引用真实存在，不代表它支持该条中的全部细节。

例如用户只说记录金额、日期和客户时，没有给出的金额精度、默认日期、客户分组汇总等细节不能直接写成已确认。用户说“不做竞品研究”“不要生成代码”是在限定当前工作的范围，不能自动变成产品功能或产品红线。记录原话时可以保留这些话，产品事实与功能项中则只写产品本身的要求。

## 检查与保存

调用 `check`，传 proposal 与本轮 deliverables，修复返回的 errors，再保存。warnings 保留在文档里，必要时向用户补问。结构与规则检查通过不等于事实真实、独立审稿通过或测试通过；保存技术方案后，后台会用当前模型的独立请求审稿，结果另存报告；检查通过本身不代表审稿完成。不要在自动审稿后重复调用 aipm_review，除非用户要求重新审查。

用户要求实际交付文件时，如果当前目录尚不是产品项目，先用 `aipm_stage init` 按明确的产品名称登记，沿用现有归属规则。普通澄清和 `get`、`select`、`check` 不应触发项目登记。

调用 `save`，传相同的 proposal、deliverables、`expectedVersion`（首次为 0，后续为 get 的 current.version）、`targets`（每项产出指定文档 id 和从 get.documents 读到的预期版本；新建独立文档不传 id，预期版本为 0）与 `change`（本轮用户要求或变更说明）。工具会再次检查，通过统一文档记录保存 PRD 和方案；每份文档独立递增版本，流程版本保存在后台。旧项目的阶段目录仅用于兼容读取。流程的 current.version 只用于 expectedVersion，不当作文档版本。用户可见版本以 save.documents 为准；更新普通对话生成的文档也指定其准确 id，不另建同名副本。以工具实际返回的 paths 为准，用 present 交付。

后续补充需求用 get → 合并新材料 → check → save，为所选文档递增版本，不覆盖旧版及其人工修改。发生版本冲突时重新读取并合并，不盲目重试旧内容。只交付被请求的文件，简短说明待确认项，随后停止。

## 单独审稿

用户要求审查已有方案或从项目页进入审稿时，用 get 找到指定文档，读取当前版本后调用 aipm_review（documentId 与 expectedVersion）。只交付审稿报告，不改写原方案，不生成新方案或 PRD。审稿失败或取消时明确说明未完成，不宣称通过。用户不需要手动填写审稿提示词。

## 已有代码项目分析

从“已有项目反推 PRD”或“项目差距检查”进入时，源码目录和需求文件由后台选定。跳过想法澄清，不生成方案。先用 aipm_inspect scan，再用 read 聚焦入口、路由、状态变更、存储、权限及异常处理，沿实际调用追踪。只用这个工具读取选定源码，不能通过 Bash、普通文件工具、外部服务或其他目录绕过范围；不运行代码或测试，不安装依赖，不修改源码；如需更新阶段，只记录当前结果项目的进度。

反推 PRD 用 implemented（代码可见，未运行验证）、inferred（推断，待确认）、unknown（待确认）区分条目，按定位、用户、功能、流程、规则、数据权限、异常与验收建议组织。read 省略行号时从首行读取受限一页，需要更后面的内容时根据 totalLines 分页。每个可见功能至少引用真实实现代码 evidenceId，README、测试描述、关键词命中不能代替实现。缺少目标、用户或成功指标时保留待确认，不按代码倒编商业目标。

差距检查用 requirement-gap（需求差异，待复核）、recommendation（工程建议）、unverified（待验证）区分条目。只有用户选定的需求文件和实现代码同时提供依据时才列需求差异；无需求文件时不编造产品必选功能。建议写清影响、优先级与改法，不能把未读代码或搜索未命中当作功能缺失，也不能声称已经验收通过。

保存前需要时在当前独立结果目录用 aipm_stage init 登记分析项目，不在源码目录创建文件。调用 aipm_inspect save，提交 title、summary、findings（section、title、detail、status、evidenceIds，可附 priority、suggestion、验收建议数组 acceptance）与 limitations。程序校验文件行号、证据归属和当前源码哈希，按本轮模式只保存反推 PRD 或差距报告，保留已有文档；引用已变化时重新读取。交付路径以工具返回为准，正文使用自然中文，不输出证据 JSON 或内部标识。报告注明静态分析范围和未验证内容。

## 迭代影响分析与开发交接

迭代影响分析先用 aipm_delivery get 读取本轮选中文档及变更原文，只分析这次变更。按需要覆盖功能、流程、数据、接口、权限、架构、文档和测试，说明影响、优先级、建议动作及未决问题。用 impact 保存独立报告；supported 条目引用选中文档的准确原句（documentId、quote），建议用 proposed，待确认用 unknown。有选定代码目录时必须先用 aipm_inspect scan/read 读取证据，不能跳过后说未选目录；确认代码影响必须引用已读实现 evidenceId，无代码依据时只能提出建议或保留未知。测试条目是尚未执行的建议，不表示验收通过。

开发交接先用 aipm_delivery get 核对用户选定的文档，再用 package 打包并用 present 交付返回路径。ZIP 由后台直接生成，包含选中文档原文件、交接清单和给编程 AI 的开发说明；不需要模型重写这些文件。缺少 PRD 或方案时如实说明，不自动补写，不读取源码、配置或内部 JSON。仅打包材料，不启动编程 AI、编码或部署。项目页提供下载按钮。

两种任务均不修改原文档。文档版本或内容变化时停止保存，提示用户重新选择或读取后再处理；最终只简短说明已保存什么及待确认事项，不复述后台提示词或输出证据 JSON。
