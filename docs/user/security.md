# Security policy

English | [中文](security.zh.md)

This experimental personal derivative receives security fixes on the `aipm` branch. There are no supported production installer releases.

## Report a vulnerability

If this repository offers **Security → Report a vulnerability**, use that private channel. Otherwise open an issue requesting a private contact method without including exploit details, tokens, personal data, or confidential files. Do not send this derivative's reports to upstream maintainers unless the issue is also reproduced in their software.

## Before sharing a report

Remove API keys, account tokens, tokenized local URLs, session exports, and private project contents. Describe the affected revision, platform, reproduction steps, and impact with a minimal sanitized example. See the [privacy policy](privacy.md) for the application's separate upload controls.

## Deployment boundary

Run the local application with the permissions needed for your project. Keep its authenticated local URL private. A public source repository is not a request to expose the agent's local HTTP service to the internet. Review any custom profile, plugin, proxy, or collector before enabling it.
