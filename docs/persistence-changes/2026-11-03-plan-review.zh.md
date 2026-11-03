---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-03-plan-review

[English](2026-11-03-plan-review.md) | 中文

## 概述

增加独立技术方案审稿的请求和结束记录。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-03-plan-review
baseline: false
changes:
  - root: "event:aipm/review-request"
    previous: null
    after: "7a019f248466b740d92341b1456a09f6d57f3abea1c4db8d8238b515c93aafd1"
    decision: same-version
  - root: "event:aipm/review-result"
    previous: null
    after: "3a43f85618197d8cb0f83119affc05ecc6f1da176417071b888127bcba2a6b27"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

已有会话记录和事件载荷不变。新增 aipm/review-request 与 aipm/review-result 记录不带工具的独立模型调用，不进入作者对话历史，也不改变回放。写入方保持当前会话格式；尚无这些事件定义的旧读取器可能拒绝含新审稿记录的会话，不会静默丢弃事件。

<a id="verification"></a>
## 验证

AIPM、侧栏及会话接收相关测试通过，共 18 个文件、146 项。审稿测试覆盖分发前输入记录、模型路由、报告保存、无效及截断输出、超时、取消和源版本保留。

<a id="dev-note"></a>
## 开发备注

无。
