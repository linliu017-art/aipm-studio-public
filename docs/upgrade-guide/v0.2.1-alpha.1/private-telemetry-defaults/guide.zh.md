---
kind: upgrade-guide
description: "AIPM Studio 在随附 profile 中关闭额外会话上传和桌面使用统计。"
---

# 遥测默认关闭

[English](guide.md) | 中文

## 变更

AIPM Studio 基于 base 的 profile 默认将反馈遥测设为 `DISABLED`，不再提供收集地址。所有随附 profile，包括独立的 `sdk-minimal` 配置树，都将 `session-log-deepseek.enabled` 设为 `false`，Desktop 将 `product-analytics.enabled` 设为 `false`。普通模型输入仍会发送给所选提供方。这些独立设置不会删除旧 profile 覆盖配置，也无法撤回已经排队或送达的数据。

## 迁移

1. 在本机检查每个活动 profile 的生效配置。Web 可运行 `pnpm dsh --profile web --dump-config`，桌面 profile 的已保存补丁需单独检查。
2. 在已保存的 profile、home 或 CLI 补丁中，将 `session-log-deepseek.enabled` 和 `product-analytics.enabled` 设为 `false`，将 `session-telemetry-otel.mode` 设为 `DISABLED`。每个条目会替换整份配置，须保留该条目要求的其他字段。移除不再需要的上传启用环境变量。
3. 重启应用，核对三个生效值。`DSH_TELEMETRY_DISABLED=1` 可额外强制关闭反馈遥测，但只影响这一项。
4. 后续需要开启时，请先阅读[隐私说明](../../../user/privacy.zh.md)，选择接收方，并明确开启所需机制。反馈上传必须同时设置 `DSH_TELEMETRY_MODE=FEEDBACK_ONLY` 和 `DSH_TELEMETRY_OTLP_URL`，缺少地址会导致激活失败，不会回退到上游收集器。重新开启官方模型会话日志时，可能发送关闭期间记录的事件。
