---
description: "dsh Web 客户端的固定侧边栏外壳插件：品牌行、New Session 操作、导航轨道、Workspace 区域与底部固定的 Settings 席位。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sidebar

[English](README.md) | 中文

桌面端产品事件使用可选的[产品埋点服务](../product-analytics/README.zh.md)，不包含普通 Web 交互。

## 概述

dsh Web 客户端采用横跨全宽的顶部导航，其下方固定显示一级菜单。对话历史列仅在 Agent 对话页显示，项目与任务中心不显示该列。品牌注册内容位于顶部导航；快捷操作与会话浏览保持原有交互。

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

### 全局面板入口

插件在 root 作用域的 `sidebar.panellist` list 中注册图标组件，提供 `id`、可选 `order`，以及字符串或 locale-aware 的 `label`。同一个 id 寻址布局中 root 作用域 `main` keyed slot 的组件；选择不存在的主面板条目会抛错，并保留当前选中态。标签提供普通可见文字、无障碍名称和折叠提示。每一行通过 `usePanelInfo` 读取自己的选中态；DOM 焦点移到搜索框或目录选择器时，显示的面板及其列表项选中态不变。没有注册项时，列表及其间距均不渲染。产品随附的组合会注册“项目”面板；项目产出物显示在项目详情中，不再单独注册全局面板。

### 固定栏行为

左侧栏不提供收起命令、开关按钮、悬停预览或响应式自动收起。`sidebar.left.toggle`、`sidebar.toggle.badge` 和用于重新打开的 `shell.leading` 席位均已移除。

在 Windows Electron 中，`html[data-windows-titlebar]` 在固定侧边栏上方预留标题栏。品牌与新建会话操作始终保留在详情区，标题栏控件不参与窗口拖拽区域。

### macOS 桌面

在 `html[data-platform='darwin']` 下，横跨全宽的顶部导航在横向避开 hiddenInset 红绿灯，一级菜单和内容区位于该行下方。[Desktop 参考](../../../apps/desktop/README.zh.md)负责窗口集成。

### 滚动条

固定栏使用主题提供的常规滚动条样式。滚动区域（ui-workspace）自行预留沟槽，因此滚动条绘制不会改变行布局。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

外壳是纯组合：`SidebarRootComponentProps` 组合布局 owner share、全局 `useSessions` 与 `useWorkspaces` 钩子、已声明的品牌、`sidebar.workspaces` 与 `sidebar.settings` 子 slot，以及注入的导航回调。面板入口及其可选标题使用相同的组合方式。面板元数据由列表注册和 locale 变化派生；选中态属于布局存储。

项目面板通过已有 Session 读取 `.aipm/project.json` 并递归扫描项目文件。统一文档树合并项目材料与产出，文件夹默认展开，不再单独提供概览或目录页签。Markdown 行使用无底色的线框文档图标，阶段文件夹使用淡色背景。打开文件时选择其产出或读取目录的 Session，不离开项目页，并打开可选的右侧预览；关闭预览会释放其列宽。

只有存在文件或状态为进行中、已完成的阶段会以紧凑卡片显示在文档树上方。每张卡片显示阶段编号、名称和文件数量。进行中的蓝色编号、已有产出或完成的绿色编号保留圆点或勾，以及本地化的悬停、点击和键盘聚焦提示。卡片按可用内容宽度自动换行，包括打开预览使页面变窄的情况。

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
