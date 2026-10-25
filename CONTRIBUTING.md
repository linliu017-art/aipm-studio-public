# Contributing

English | [中文](CONTRIBUTING.zh.md)

AIPM Studio is maintained independently from DeepSeek Harness. Report this application's bugs and feature requests in [this repository](https://github.com/linliu017-art/aipm-studio-public/issues). Small, focused pull requests are welcome.

## Development

Follow the [source setup](README.md), then read [AGENTS.md](AGENTS.md) and the [development guide](docs/development.md). Keep changes limited to the requested behavior and retain upstream copyright and third-party notices. Use a GitHub noreply address for commits if you do not want a personal email in public history.

## Checks

Run focused tests for changed behavior and the documentation checks required by the repository. Follow [the pre-push workflow](.agents/skills/dsh-pre-push-checks/SKILL.md); include the exact commands and results in the pull request. Do not submit API keys, credential stores, signing certificates, session logs, or private project materials.

The AIPM validation workflow uses hosted runners and read-only credentials. Inherited upstream infrastructure workflows are restricted to their original repository. Enable only the reviewed AIPM validation workflow and keep inherited infrastructure workflows disabled. See [SECURITY.md](docs/user/security.md) for vulnerability reporting.
