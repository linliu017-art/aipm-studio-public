---
description: "Nini Flow 产品项目包，帮助读者定位 AIPM 预设、阶段状态和项目文件视图。"
kind: "package-group"
---

# packages/aipm

[English](README.md) | 中文

## 概述

AIPM 包组支持 Nini Flow 项目中的产品工作。用户可以只完成当前要求的产出物，不必依次完成所有阶段。AIPM 包提供预设、阶段记录和项目文件视图；Workspace 存储负责项目标识和会话归属。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

本组包含产品项目的组合配置及其项目状态辅助模块。

| 包 | 职责 |
|---|---|
| [`aipm`](aipm/README.zh.md) | 产品工作预设、独立阶段进度、内置 skill（技能）和只读项目文件视图 |

-----

<a id="related-documentation"></a>
## 相关文档

- [Workspace 子系统](../../docs/subsystems/workspace.zh.md) — AIPM 项目视图使用的项目标识和会话归属。
- [工具子系统](../../docs/subsystems/tools.zh.md) — 阶段状态工具的注册和执行。

-----

<a id="dev-note"></a>
## 开发备注

无。
