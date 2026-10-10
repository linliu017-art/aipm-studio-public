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

在 Nini Flow 中选择 AIPM 预设，描述一项产品任务。预设使用已有材料，把指定产出写入相关阶段目录，完成后停止。仅创建项目而没有具体任务时，会询问用户下一步想做什么，不会启动所有阶段。

### 项目状态

`aipm_stage` 工具使用 Session 的工作目录。`get` 读取项目进度；`init` 创建九个阶段目录、`.aipm/project.json`，并在不存在项目指令文件时创建 `AGENTS.md`。`update` 记录一个阶段的状态、备注、来源 Session 和更新时间。初始化拒绝已有项目或空名称。更新要求项目已初始化且阶段已知；状态 JSON 无效时，必须先修复才能继续写入阶段状态。项目指令要求通过工具更新状态，不直接编辑 JSON。

### 组合配置

manifest（元数据清单）声明的[组合包补丁](cordis.patch.yml)扩展 Web 应用组合，并把 AIPM 设为新会话的默认预设。此私有工作区包随 Nini Flow 分发，本文不声称存在单独发布的 npm 安装包。自定义配置档案层的管理由 [app-boot](../../boot/app-boot/README.zh.md) 负责。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节 — 点击展开</summary>

[阶段定义](src/stages.ts)为每个独立工作区域关联目录和典型产出。[存储模块](src/store.ts)负责项目 JSON，通过临时文件和重命名写入，并保留已有项目指令。[项目读取器](src/project-view.ts)组合 Workspace 标识、可选阶段状态和有界文件扫描，不写入这些来源。已知阶段目录内的文件归为产出，其他文件归为材料。读取器排除内部目录，并报告目录不可用、状态无效、扫描错误或截断，不丢弃 Workspace 标识。

[补丁](cordis.patch.yml)提供预设的任务指令、工具组合和内置 skill（技能）目录。[插件入口](src/index.ts)在挂载的 agent（智能体）作用域注册 `aipm_stage`；执行工具要求 Session 存在工作目录。Workspace 持久化和用户界面展示仍由各自的消费方包负责。

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

阶段定义未变化时，声明保持稳定。调用向工具历史追加结果；项目状态变化影响后续结果文本，不改变先前记录的结果。本包不发起独立模型请求，也不保证提供商缓存复用。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- 只有立项阶段声明专属阶段 skill，其他阶段使用通用任务方法。内置写作 skill 可支持跨阶段任务。
- 项目文件视图受宿主显式提供的深度和文件数量限制，不是完整文件索引，也不跟随符号链接条目。
- 阶段状态存放在项目目录，与 Session 日志分离。不协调并发写入，也不会在后续任务操作失败时自动回滚。
- 内联阶段工具声明未进入自动生成的工具目录；源码仍是准确声明的参考。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
