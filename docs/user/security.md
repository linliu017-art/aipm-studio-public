# Security policy

English | [中文](security.zh.md)

This experimental personal derivative receives security fixes on the `aipm` branch. There are no supported production installer releases.

## Report a vulnerability

If this repository offers **Security → Report a vulnerability**, use that private channel. Otherwise open an issue requesting a private contact method without including exploit details, tokens, personal data, or confidential files. Do not send this derivative's reports to upstream maintainers unless the issue is also reproduced in their software.

## Before sharing a report

Remove API keys, account tokens, tokenized local URLs, session exports, and private project contents. Describe the affected revision, platform, reproduction steps, and impact with a minimal sanitized example. See the [privacy policy](privacy.md) for the application's separate upload controls.

## Deployment boundary

Run the local application with the permissions needed for your project. Keep its authenticated local URL private. A public source repository is not a request to expose the agent's local HTTP service to the internet. Review any custom profile, plugin, proxy, or collector before enabling it.

## Dependency maintenance

The workspace lockfile applies reviewed, same-major security floors to the HTML sanitizer, schema validation, HTTP clients, MCP libraries, image decoder, and related transitive dependencies. The desktop build uses Electron 44.9.1 or newer and pnpm 11.11.0. Install with the committed lockfile; a clean scan is time-specific and does not guarantee that future advisories are absent.

The upstream npm dependency catalog under `scripts/dependency-catalog/` is a historical documentation fixture, not the application install tree. Its alerts need separate triage. `http-cache-semantics` has an unresolved upstream advisory; the application does not enable Got HTTP response caching. Unpatched `extract-zip` advisories also remain in build tooling. Do not extract untrusted archives with that tool. Keep these alerts open until upstream fixes or removal are available.
