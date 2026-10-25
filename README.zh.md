# AIPM Studio

[English](README.md) | 中文

AIPM Studio 是基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 构建的个人 AI 产品经理工作台，应用内目前显示为 **Nini Flow**。这是由 [linliu017-art](https://github.com/linliu017-art) 维护的独立衍生项目，与 DeepSeek 没有官方隶属或背书关系。

## 已有能力

- 把产品项目整理为九个独立工作区域，记录阶段进度、输入材料和产出文档。
- 结合项目已有资料完成用户指定的一项产出，然后等待下一条指令。
- 使用内置的立项技能和通用写作技能。其余八个阶段目前采用通用任务方法，尚未接入各阶段的专属技能。

本项目处于实验阶段。请人工审阅生成的决策与文档，并在让智能体修改重要项目文件前做好备份。

<a id="run"></a><a id="run-from-source"></a>

## 从本仓库运行

使用带开发头文件的 Node.js 24 或更新版本、平台原生编译器，以及 `package.json` 声明的 pnpm 版本。模型调用需要你自己的提供方凭据。请在终端依次运行：

```sh
git clone --branch aipm https://github.com/linliu017-art/aipm-studio-public.git
cd aipm-studio-public
pnpm install --frozen-lockfile
pnpm run build
pnpm dsh web --no-open
```

打开最后一条命令打印的本地地址，并将地址中的 token 当作凭据保管。在 **设置 → 模型** 中配置模型。安装上游 `@deepseek-ai/dsh` npm 包不会安装这个定制应用。

## 桌面端

构建本仓库后，可用 `pnpm run dev:desktop` 运行 Electron 应用。本机 macOS 打包命令及签名限制见[桌面端指南](apps/desktop/README.zh.md)。`studio:install` 创建的是依赖当前源码目录的启动器，不能作为便携安装包分发。本仓库目前不发布生产安装包。

## 隐私与安全

随附默认配置关闭额外会话日志上传、反馈遥测和桌面使用统计。已有 profile 覆盖配置可能保留旧选择。各项独立开关、发送目标和迁移步骤见[隐私说明](docs/user/privacy.zh.md)，报告漏洞前请阅读[安全说明](docs/user/security.zh.md)。模型调用和已启用的网页工具仍会向所选服务发送完成任务所需的输入。

智能体会按你授予的权限读取文件和执行命令。请勿把凭据与保密材料提交进仓库，运行应用前请阅读继承的[运行安全提示](SAFETY.zh.md)。

## 参与贡献与反馈

此衍生项目的缺陷和功能建议请提交到[本仓库 Issues](https://github.com/linliu017-art/aipm-studio-public/issues)。开发与检查方法见 [CONTRIBUTING.zh.md](CONTRIBUTING.zh.md)。上游文档仍可用于理解底层框架，但其中的产品默认行为可能与本仓库不同。

上游基础设施工作流只允许在其原仓库执行；AIPM 专用验证工作流使用 GitHub 托管运行器和只读权限。

## 许可证与归属

本项目保留上游 [MIT 许可证](LICENSE)、DeepSeek 版权与[第三方声明](THIRD_PARTY_NOTICES.md)。内置 human-writing 技能也带有独立 MIT 许可证。除文件另有声明外，新增的 AIPM 代码、提示词、阶段方法和模板均按仓库许可证分发。
