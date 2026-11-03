---
description: "dsh Web 客户端的固定侧边栏外壳插件：品牌行、New Session 操作、导航轨道、Workspace 区域与底部固定的 Settings 席位。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sidebar

[English](README.md) | 中文

桌面端产品事件使用可选的[产品埋点服务](../product-analytics/README.zh.md)，不包含普通 Web 交互。

## 概述

dsh Web 客户端采用横跨全宽的顶部导航，其下方固定显示一级菜单。对话历史列仅在 Agent 对话页显示，Agent 工坊、项目与任务中心不显示该列。品牌注册内容位于顶部导航；快捷操作与会话浏览保持原有交互。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

侧边栏是固定导航外壳：用户看到品牌、启动新会话、浏览历史并到达 Settings。功能插件填充它的席位——ui-workspace 填充 `sidebar.workspaces`，ui-settings 在 `sidebar.settings` 注册触发行与设置面板。

### 品牌与 New Session

侧边栏在常驻一级菜单顶部渲染 `sidebar.brand.mark`，在对话详情栏的 Agent 标题上方渲染 `sidebar.brand.name`。两者都是由 `sidebar` 声明的独立 single slot；全宽顶部行只显示当前页面标题。在 Web 和 Windows 桌面端，点击品牌名称会新建会话，悬停或聚焦时不显示 tooltip。没有占位者时，外壳使用鱼形标记和本地化的本地构建标签。完整构建会在标签下方显示代码徽标；该徽标使用 `DSH_CLIENT_VERSION`、可选的 7 位 `DSH_CLIENT_COMMIT_HASH` 与 `DSH_CLIENT_GIT_DIRTY=true` 组装成 `version[-commit][-dirty]`；缺少版本元数据时不显示徽标。New Session 优先使用作用域操作明确指定的 Workspace，否则使用自动创建的默认 Workspace，再否则使用当前 Session 所属或最近活跃 Workspace；一个 Workspace 都没有时则清空选择，进入空白 New Session 页面。 展开态的新建会话按钮在悬停或键盘聚焦时于右侧以灰色文字显示当前有效绑定。快捷键可见且空间较窄时，居中的图标与文字在快捷键之前渐隐；CSS 为快捷键保留宽度，无需测量按钮。纯图标控件保留使用平台键位样式的 tooltip，侧栏隐藏时常驻的 macOS 头部控件也保持一致。所有控件均提供 `aria-keyshortcuts`。

Agent 工坊提供从想法开始、基于已有材料、继续迭代三种入口，可选择 PRD、技术方案或两者。打开入口、切换模式和刷新只读取项目；开始任务时创建新会话，直接提交用户填写的内容与结构化流程选项，由 Host 加载真实工坊技能；聊天只显示用户任务，不预填长提示词。请求被接受后才进入对话，失败时保留表单，其他会话的未发送草稿保持不变；材料可在对话中添加。新想法不继承已有项目；材料可选择项目或在新对话中上传文档；迭代需明确选择已有工坊产出的项目。保存时才登记新项目。

项目详情在名称旁提供铅笔按钮。保存时去掉首尾空格，并同步项目元数据与工作区标题；项目卡片和选择器随之更新。空名称不能保存，Escape 或取消会放弃修改，保存失败时保留输入以便重试。改名不会移动目录或修改已有文档。

新建对话打开独立的空输入框，项目详情内的入口也遵守该规则。旧草稿保留在原对话。快捷操作只填入一句本地化的任务开头，不粘贴流程规则，也不清空其他对话的草稿。

### 全局面板入口

插件在 root 作用域的 `sidebar.panellist` list 中注册图标组件，提供 `id`、可选 `order`，以及字符串或 locale-aware 的 `label`。同一个 id 寻址布局中 root 作用域 `main` keyed slot 的组件；选择不存在的主面板条目会抛错，并保留当前选中态。标签提供普通可见文字、无障碍名称和折叠提示。每一行通过 `usePanelInfo` 读取自己的选中态；DOM 焦点移到搜索框或目录选择器时，显示的面板及其列表项选中态不变。没有注册项时，列表及其间距均不渲染。产品随附的组合会注册“Agent 工坊”和“项目”面板；项目产出物显示在项目详情中，不再单独注册全局面板。

### 固定栏行为

左侧栏不提供收起命令、开关按钮、悬停预览或响应式自动收起。`sidebar.left.toggle`、`sidebar.toggle.badge` 和用于重新打开的 `shell.leading` 席位均已移除。

在 Windows Electron 中，`html[data-windows-titlebar]` 在固定侧边栏上方预留标题栏。品牌与新建会话操作始终保留在详情区，标题栏控件不参与窗口拖拽区域。

### macOS 桌面

在 `html[data-platform='darwin']` 下，横跨全宽的顶部导航在横向避开 hiddenInset 红绿灯，一级菜单和内容区位于该行下方。[Desktop 参考](../../../apps/desktop/README.zh.md)负责窗口集成。

### 滚动条

固定栏使用主题提供的常规滚动条样式。滚动区域（ui-workspace）自行预留沟槽，因此滚动条绘制不会改变行布局。

-----

技术方案文档行提供“审查方案”，直接启动归属于该项目的新审稿任务。后台指令只要求独立审稿报告，保留原方案，工作方式说明不填入输入框。

反推 PRD 和差距检查入口接收代码目录绝对路径、差距检查可选的源码内需求文件相对路径，以及可选的已有结果项目。不选结果项目时，仅在保存时登记独立分析项目；源码不作为报告保存位置。关注点可留空，这两个模式不显示 PRD／方案产出选择。

迭代影响分析和开发交接包须选择已保存项目并勾选文档版本。PRD 与方案默认选中，用户可自行调整。影响分析须填写变更，可选补充代码目录；交接备注可留空。两者都不显示 PRD／方案生成选项。结构化选择交给后台，对话只显示简短任务原话。项目内受管理的交接 ZIP 提供下载按钮，通过已有受限会话字节服务读取；读取不完整时保留文件行并可重试。

页头和任务区域沿内容区左边距对齐，宽屏不额外居中。工坊采用紧凑任务导航，按创建文档、检查与迭代、开发交接分组，旁边显示当前任务表单。表单说明所选任务和产出；可选的报告归属、需求基准、关注点、代码依据目录及交接备注收进折叠区，填写后显示提示。必填内容直接可见。窄容器将导航放到表单上方，手机宽度改用分组任务选择框，让输入区靠近页面顶部。切换任务不启动对话，每项任务在页面打开期间分别保留草稿，重复点击当前任务保留已有选择；输入、源码目录和备注不混入其他任务。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

外壳是纯组合：`SidebarRootComponentProps` 组合布局 owner share、全局 `useSessions` 与 `useWorkspaces` 钩子、已声明的品牌、`sidebar.workspaces` 与 `sidebar.settings` 子 slot，以及注入的导航回调。面板入口及其可选标题使用相同的组合方式。面板元数据由列表注册和 locale 变化派生；选中态属于布局存储。

项目面板通过已有 Session 读取项目元数据和有界文件扫描结果。页面按类型显示文档、当前版本和默认收起的历史记录，不展示实际的阶段、来源或版本文件夹。内部文档索引用于去重保留的原文件；旧工坊 V 目录仅按完全相同的文档路径识别历史，普通 PRD 保持独立。内部 JSON 保持隐藏。打开当前或历史文件时使用已有右侧预览，不离开项目页；历史记录可打开属于当前项目的来源对话。文档数量按每份文档计数一次。

项目列表只显示存在项目登记记录的工作区；没有项目记录的草稿对话与普通工作区不生成项目卡片，也不改变其对话或文件。已有项目记录损坏时保留项目入口并显示读取问题。

只有明确记录为进行中或已完成的进展阶段显示在文档列表上方。卡片显示阶段名称和状态，使用圆点或勾提示，不显示目录编号或实际文件数量。进展阶段与文档类型相互独立。打开预览使页面变窄时，卡片自动换行。

### slot 纪律

声明感知的 `slots.inject()` 让替换包无论先于还是后于侧边栏激活都能生效。页脚承载 `sidebar.settings` 席位：侧边栏只渲染固定在底部的布局 slot，并共享其栏状态（`wide`）。`/client` 导出接口只包含插件主体（`apply`/`inject`）及约定类型；SidebarRoot、行组件与树派生仍由 slot 注册封装在包内。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

以下页面覆盖填充外壳席位的各个界面与组合模型。

- [ui-workspace](../ui-workspace/README.zh.md)——渲染到 `sidebar.workspaces` 的 Workspace 与 Session 浏览器。
- [ui-settings](../ui-settings/README.zh.md)——在 `sidebar.settings` 注册触发行与设置面板的设置领域底座。
- [ui-layout](../ui-layout/README.zh.md)——折叠所使用轨道与栏状态的布局 owner。
- [ui-theme](../ui-theme/README.zh.md)——外壳所重新绑定的滚动条 token 间接层。
- [slot 系统标准](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.zh.md)——席位背后的组合模型。

-----

<a id="model-experience"></a>
## 模型体验

无。该包是浏览器端 UI 插件层，不注册任何面向模型的内容。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制定义外壳拥有什么、其占位方拥有什么；它们是当前包约束。

- **Session 状态点渲染由 ui-workspace 持有**：本外壳没有可用的 done/error 通知数据源。
- **Workspace 浏览行为由组合持有**：分组、排序、搜索与行状态都属于 ui-workspace，不属于此外壳。
- **「New task completed」未读标记是本地查看状态**：完成时间 > 上次查看时间这一事实永远不会到达宿主。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
