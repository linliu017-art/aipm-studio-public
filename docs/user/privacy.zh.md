# 隐私说明

[English](privacy.md) | 中文

AIPM Studio 将项目文件和会话历史保存在你的电脑上。它不是离线模型，所配置的模型提供方、账号服务、搜索与网页抓取服务会接收你所用功能需要的输入。除非允许这些服务处理相关信息，否则不要把保密内容放进任务。

## 默认关闭额外上传

| 机制 | 随附配置 | 明确开启后发送的内容 |
|---|---|---|
| 官方模型额外会话日志 | `session-log-deepseek.enabled: false` | 在普通模型输入之外，通过附加的 `dsh_session_log` 请求字段发送规范会话事件 |
| 反馈遥测 | `session-telemetry-otel.mode: DISABLED` | 截至明确反馈、评分、编辑或撤回事件的完整会话日志前缀，包括上下文和工具结果 |
| 桌面使用统计 | `product-analytics.enabled: false` | 所选交互事件，以及可用的设备、账号、系统和应用标识 |

关闭其中一项不会关闭其他项。反馈遥测不再附带默认收集地址，开启时必须同时配置 `DSH_TELEMETRY_MODE=FEEDBACK_ONLY` 和明确的 `DSH_TELEMETRY_OTLP_URL`。桌面统计仍保留上游导出器的 DeepSeek 收集地址，除非用 `DSH_PRODUCT_ANALYTICS_OTLP_URL` 覆盖。请先选择并披露接收方，再开启采集。正常模型请求仍会发送模型需要的消息和工具上下文。

## 已有安装的处理

profile、home 和命令行补丁的优先级高于组合包默认值，升级不会删除先前的明确设置。可在本机查看生效配置：

```sh
pnpm dsh --profile web --dump-config
```

逐个检查你使用的 profile，包括 `desktop`，核对表中的三个设置。在已有覆盖配置中，将两个 `enabled` 设为 `false`，将反馈模式设为 `DISABLED`。非空的 `DSH_TELEMETRY_DISABLED` 只会强制关闭反馈遥测。修改默认值无法撤回已经排队或已经送达的数据，重新开启任何一项前请阅读[迁移指南](../upgrade-guide/v0.2.1-alpha.1/private-telemetry-defaults/guide.zh.md)。

## 本地文件与凭据

Web CLI 通常使用 `~/.dsh`，Desktop 通常使用 `~/.aipm-studio`，明确设置的 `DSH_HOME` 会覆盖这些位置。项目文档保留在你选择的项目目录中。本地凭据与会话不属于源码分发内容。报告问题时，请勿上传凭据文件、会话导出、项目文档或包含 token 的本地地址。忽略规则可降低误提交概率，但不会移除已经被 Git 跟踪的文件。
