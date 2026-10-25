# 参与贡献

[English](CONTRIBUTING.md) | 中文

AIPM Studio 独立于 DeepSeek Harness 维护。此应用的缺陷与功能建议请提交到[本仓库](https://github.com/linliu017-art/aipm-studio-public/issues)，欢迎范围明确的小型 Pull Request。

## 开发

按[源码安装说明](README.zh.md)准备环境，然后阅读 [AGENTS.md](AGENTS.md) 和[开发指南](docs/development.zh.md)。修改应限定在用户要求的行为范围，保留上游版权和第三方声明。如果不希望真实邮箱进入公开历史，请使用 GitHub noreply 地址提交。

## 检查

对修改的行为运行针对性测试，并完成仓库要求的文档检查。请遵循[推送前检查流程](.agents/skills/dsh-pre-push-checks/SKILL.md)，在 Pull Request 中列出实际执行的命令和结果。不要提交 API Key、凭据库、签名证书、会话日志或私有项目材料。

AIPM 验证工作流使用托管运行器和只读凭据，继承的上游基础设施工作流只允许在其原仓库执行。只启用已审阅的 AIPM 验证工作流，并保持继承的基础设施工作流关闭。漏洞报告方法见 [SECURITY.zh.md](docs/user/security.zh.md)。
