---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-03-project-inspection

[English](2026-11-03-project-inspection.md) | 中文

## 概述

记录显式选择的源码分析目标、有界目录索引和经过校验的源码摘录。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-03-project-inspection
baseline: false
changes:
  - root: "event:workshop/inspection-evidence"
    previous: null
    after: "5cbaaf6710efabbb18a451b44077df955057bacb30cc5e78a3602b4f688d315c"
    decision: same-version
  - root: "event:workshop/inspection-scan"
    previous: null
    after: "2708e88655a5aef8d280c1d9c1ecc486b8727cb7cca08a25a0fd808d780f0f16"
    decision: same-version
  - root: "event:workshop/inspection-start"
    previous: null
    after: "e79d8ca6f25e5dcf951e9d772b65f09f20a6a3c7df66c259c6b3466b4a234f90"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

已有会话载荷不变。新增三个工坊分析普通事件供仅 Host 的投影使用，不改变作者消息重建。选定用户请求保留分析范围，后续用户新任务解除分析限制。已有日志照常读取，尚无这些事件定义的旧读取器可能拒绝新分析记录；会话格式版本保持不变。

<a id="verification"></a>
## 验证

源码工具、工坊界面和会话接收相关测试覆盖结果目录分离、选定范围、有界扫描读取、凭据与链接排除、真实行号、过期哈希、结论分类和接收去重。七项源码证据 Loader 测试通过，包括运行时拒绝修改和后续任务解除范围。

<a id="dev-note"></a>
## 开发备注

无。
