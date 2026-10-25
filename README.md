# AIPM Studio

English | [中文](README.zh.md)

AIPM Studio is a personal AI product-management workspace built on [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). The application currently displays the name **Nini Flow**. This independent derivative is maintained by [linliu017-art](https://github.com/linliu017-art) and has no official affiliation with or endorsement from DeepSeek.

## What works

- Organize a product project into nine independent work areas, with stage progress, source materials, and generated documents.
- Complete a requested deliverable using the project's existing materials, then stop for the next user instruction.
- Use the bundled project-initiation skill and general writing skill. The other eight stages currently use general task methods and do not have dedicated stage skills.

This project is experimental. Review generated decisions and documents, and back up important project files before letting the agent edit them.

<a id="run"></a><a id="run-from-source"></a>

## Run from this repository

Use Node.js 24 or newer with development headers, the platform native compiler, and the pnpm version declared in `package.json`. Model use requires your own provider credentials. Run the following commands from a terminal:

```sh
git clone --branch aipm https://github.com/linliu017-art/aipm-studio.git
cd aipm-studio
pnpm install --frozen-lockfile
pnpm run build
pnpm dsh web --no-open
```

Open the local URL printed by the last command. Treat its token as a credential. Configure a model in **Settings → Models**. Installing the upstream `@deepseek-ai/dsh` npm package does not install this customized application.

## Desktop

After building this checkout, use `pnpm run dev:desktop` to run its Electron application. The local macOS packaging command and its signing limitations are described in the [Desktop guide](apps/desktop/README.md). `studio:install` creates a launcher tied to this checkout; it is not a portable installer. This repository does not currently publish production installers.

## Privacy and safety

Extra session-log uploads, feedback telemetry, and Desktop product analytics are disabled in the shipped defaults. Existing profile overrides can retain older choices. Read the [privacy policy](docs/user/privacy.md) for the separate controls, data destinations, and migration steps, and the [security policy](docs/user/security.md) before reporting vulnerabilities. Model calls and enabled web tools still send the inputs needed by their selected services.

The agent can read files and run commands with the permissions you grant it. Keep credentials and confidential source materials out of commits. Read the inherited [runtime safety notice](SAFETY.md) before running the application.

## Contributing and support

Use [this repository's issues](https://github.com/linliu017-art/aipm-studio/issues) for this derivative's bugs and feature requests. See [CONTRIBUTING.md](CONTRIBUTING.md) for development and checks. The upstream documentation remains useful for the underlying framework, but its product defaults may differ from this checkout.

GitHub Actions remain disabled at repository level while the public-release preparation is reviewed. Upstream infrastructure workflows are restricted to their original repository; the AIPM-specific validation workflow uses hosted runners and read-only permissions.

## License and attribution

The project retains the upstream [MIT license](LICENSE), DeepSeek copyright, and [third-party notices](THIRD_PARTY_NOTICES.md). The bundled human-writing skill also includes its own MIT license. AIPM additions, prompts, stage methods, and templates are distributed under the repository license unless a file states otherwise.
