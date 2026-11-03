---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-03-change-handoff

[English](2026-11-03-change-handoff.md) | 中文

## 概述

记录影响分析／开发交接的明确文档选择，以及分析或打包前观察到的文件哈希。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-03-change-handoff
baseline: false
changes:
  - root: "event:workshop/delivery-snapshot"
    previous: null
    after: "db9a7e49b39f4fe1fbdf51d339fe3284bfb63a2145243f25a902bafc72316891"
    decision: same-version
  - root: "event:workshop/delivery-start"
    previous: null
    after: "173d76748eb49a48ede72c1f858b465abc620ee59cfc7ee726a473b85e9e3871"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

新增两个普通会话事件，供仅宿主可见的投影读取。既有载荷、用户消息及会话格式版本均不变化。旧日志仍可读取；未识别这些事件的旧读取器可能拒绝新增任务记录。下一条用户请求会解除选中文档范围。

<a id="verification"></a>
## 验证

模块级 Loader、会话受理与界面测试覆盖明确选择、请求幂等、输入哈希、版本与字节过期、原文引用、源码证据、只读范围、取消、ZIP 字节保真、安全文件名、材料缺口及输入输出限制。浏览器下载沿用现有会话文件字节服务。

<a id="dev-note"></a>
## 开发备注

无。
