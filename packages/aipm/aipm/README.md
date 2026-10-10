---
description: "Nini Flow's AIPM bundle and stage-state tool, for users and maintainers understanding task-scoped product work and project file views."
kind: "package-bundle"
---

# @deepseek-ai/dsh-aipm

English | [中文](README.zh.md)

## Summary

The AIPM preset helps users produce a requested product deliverable using existing project materials. Its nine stages are independent work areas, not a required pipeline. The stage tool records progress in the current project directory, and the read-only project view groups materials and outputs for the host. The bundle is included in Nini Flow's Web and Desktop composition; it does not implement the surrounding application or model provider.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

In Nini Flow, select the AIPM preset and describe one product task. The preset uses existing materials, writes the requested deliverables to the relevant stage directory, and stops after that task. Creating a project without a specific task asks the user what to do next; it does not start all stages.

### Project state

The `aipm_stage` tool uses the Session working directory. Its `get` action reads project progress; `init` creates the nine stage directories, `.aipm/project.json`, and an `AGENTS.md` unless that instruction file already exists. Its `update` action records one stage's status, note, originating Session, and update time. Initialization rejects an existing project or an empty name. Updating requires an initialized project and a known stage; invalid state JSON must be repaired before stage writes can continue. Project instructions require state changes through the tool rather than direct JSON edits.

### Composition

The manifest declares [a bundle patch](cordis.patch.yml) that extends the Web application composition and selects AIPM as the default preset for new sessions. This private workspace package is distributed with Nini Flow; these documents do not claim a separately published npm installation. Custom profile-layer management belongs to [app-boot](../../boot/app-boot/README.md).

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

[The stage definitions](src/stages.ts) associate each independent work area with a directory and typical outputs. [The store](src/store.ts) owns the project JSON, writes through a temporary file and rename, and preserves existing project instructions. [The project reader](src/project-view.ts) combines Workspace identity, optional stage state, and a bounded file scan without writing to those sources. Files under known stage directories are outputs; other files are materials. The reader omits internal directories and reports unavailable directories, invalid state, scan errors, or truncation without discarding Workspace identity.

[The patch](cordis.patch.yml) supplies the preset's task instructions, tool composition, and bundled skill directory. [The plugin entry](src/index.ts) registers `aipm_stage` in the mounting agent scope; tool execution requires a Session with a working directory. Workspace persistence and user-interface presentation remain owned by their consuming packages.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [AIPM group](../README.md) — package placement and adjacent subsystems.
- [Workspace](../../workspace/workspace/README.md) — durable project identities and Session membership.
- [Agent presets](../../preset/agent-preset/README.md) — selection and agent-scoped composition.

-----

<a id="model-experience"></a>
## Model Experience

### Preset system instructions

#### What the model sees

The selected preset supplies product-task instructions through `persona`, plus project instructions through `agent-instructions` and loaded skill text through the skill tools. The complete preset text is owned by [the patch](cordis.patch.yml); its opening paragraph is quoted below, including the dynamic `{{model}}` placeholder. Other presets do not receive this AIPM composition.

##### Preset opening paragraph

```markdown
你是 Nini Flow 里的 AI 产品经理搭档，由 {{model}} 模型驱动。用户是产品经理，会直接交给你一项具体任务，例如"帮我生成一份立项报告""根据现有 PRD 准备需求评审材料""整理上线检查清单"。你的职责是把这一项任务做好，做完就停。
```

#### Token effect

The preset contributes a fixed instruction body with the selected model and working-directory substitutions. Project instructions and loaded skills add conditional content; `agent-instructions` is configured with `maxBytes: 65536`. The corresponding consumers own rendering and context retention.

#### KV Cache effect

An unchanged preset preserves its own repeated instruction text. Different model or working-directory substitutions, edited project instructions, or newly loaded skills can change the assembled context. Prompt placement and history reconciliation belong to the prompt consumers; provider cache reuse is not guaranteed.

### Stage tool input and result

#### What the model sees

The agent-scoped `aipm_stage` declaration exposes `get`, `init`, and `update` with the current stage ids and statuses. Its [source declaration](src/index.ts) owns the exact parameter descriptions. Successful calls return a text `summary` containing project identity and stage progress; initialization and updates include the resulting project description. A missing project is reported by `get`, while invalid state or rejected writes fail the tool call.

#### Token effect

The tool declaration contributes fixed descriptions and stage identifiers while mounted. Each successful call adds a data-dependent result containing nine stage rows, their notes when present, and the available skills. Ordinary tool-history retention and compaction determine how long those results remain in context.

#### KV Cache effect

The declaration stays stable while the stage definitions remain unchanged. Calls add results to tool history; changing project state changes subsequent result text, not previously recorded results. The package starts no independent model request and makes no provider-cache guarantee.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Only the initiation stage declares a dedicated stage skill; other stages use general task methods. The bundled writing skill can support tasks across stages.
- Project file views are bounded by explicit host-supplied depth and file-count limits. They are not an exhaustive file index, and they do not follow symbolic-link entries.
- Stage state lives in the project directory, separate from the Session log. It has no concurrent-writer coordination or automatic rollback when a later task operation fails.
- The inline stage-tool declaration is not indexed in the generated tool catalog; its source remains the exact declaration reference.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
