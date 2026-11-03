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

In Nini Flow, select the AIPM preset and describe one product task. The preset uses existing materials, saves requested deliverables with independent document histories, and stops after that task. Creating a project without a specific task asks the user what to do next; it does not start all stages.

### Project state

The `aipm_stage` tool uses the Session working directory. Its `get` action reads project progress; `init` creates `.aipm/project.json` and an `AGENTS.md` unless that instruction file already exists; it creates no empty stage directories. Its `update` action records one stage's status, note, originating Session, and update time. Initialization rejects an existing project or an empty name. Updating requires an initialized project and a known stage; invalid state JSON must be repaired before stage writes can continue. Project instructions require state changes through the tool rather than direct JSON edits.

`aipm_document get` lists logical documents and revision paths without writes. `save` accepts complete text or an existing project-relative `sourcePath`, an exact document id for updates, and its expected revision. Omitting the id creates a separate document even if a title matches. Ordinary and Workshop saves publish immutable files under `文档/` through one atomic `.aipm/documents.json` replacement under a writer lock. Stale saves fail; failed batches remove only uncommitted files. `organize` snapshots recognized legacy outputs and records their original paths without modifying originals. Invalid catalogs or redirected paths block writes. Internal metadata is hidden from project document counts.

Workshop save additionally requires one target per deliverable: an existing document id and its observed revision, or no id with revision zero for a separate document. Workflow expectedVersion still comes from current.version; user-visible versions come from the returned documents. This permits updating an ordinary conversation document without creating a same-title copy and rejects concurrent edits made after target selection.

Technical-plan saves in ordinary chat and Workshop automatically run one separate, tool-free review with the current Session model. `aipm_review` reruns review for an exact document id and observed version. Reports are saved separately under reviews and identify the source revision; findings never rewrite the plan. Missing requirements, contradictory rules, feasibility, failure handling, acceptance and unnecessary complexity are checked as model suggestions. Invalid, truncated, timed-out or cancelled reviews are reported as incomplete while the saved plan remains intact. The bundle sets review.maxInputBytes to 120000, review.maxOutputTokens to 6000 and review.timeoutMs to 120000; the plugin requires these explicit bounds. Exact auxiliary inputs and settled output/usage are recorded as aipm/review-request and aipm/review-result Session events.

Workshop also offers reverse PRD and project gap analysis. An explicit source folder is read-only, and reports go to a separate workbench project. The optional selected requirements file is relative to that source. aipm_inspect scan/read/save uses the Host-selected scope, skips hidden, credential, dependency, generated and linked paths, and returns bounded file/line excerpts. Saved claims reference real evidence ids and unchanged file hashes; implementation claims require code, and requirement differences require both selected requirements and code. Reports distinguish observed code, inference, requirement differences, engineering recommendations and unknowns. They state read coverage and never claim code or tests were executed. The optional inspection config enables the tool and requires maxEntries, maxFiles, maxDepth, maxFileBytes, maxReadLines, maxIndexBytes, maxEvidenceBytes and maxReportBytes; the shipped bundle supplies all bounds. Reports create separate documents and preserve existing PRDs.

### Composition

The manifest declares [a bundle patch](cordis.patch.yml) that extends the Web application composition and selects AIPM as the default preset for new sessions. This private workspace package is distributed with Nini Flow; these documents do not claim a separately published npm installation. Custom profile-layer management belongs to [app-boot](../../boot/app-boot/README.md).


### Bundled skills

| Skill | Purpose |
|---|---|
| [ai-project-initiation](skills/ai-project-initiation/SKILL.md) | Initiation reports and scope decisions |
| [human-writing](skills/human-writing/SKILL.md) | Chinese writing and revision |
| [interview-me](skills/interview-me/SKILL.md) | Requirements interviews |
| [idea-refine](skills/idea-refine/SKILL.md) | Idea refinement and tradeoffs |
| [agent-workshop](skills/agent-workshop/SKILL.md) | AI product PRDs, component selection and versioned technical plans |
| [product-prd](skills/product-prd/SKILL.md) | PRDs, requirements reviews, and acceptance criteria |
| [baoyu-design](skills/baoyu-design/SKILL.md) | HTML prototypes, diagrams, and visual design |
| [prototype](skills/prototype/SKILL.md) | Interaction and state-validation prototypes |
| [product-teardown-standard](skills/product-teardown-standard/SKILL.md) | Competitor experience and product teardown |
| [ai-company-research](skills/ai-company-research/SKILL.md) | Company and customer research |
| [ai-concept-learning](skills/ai-concept-learning/SKILL.md) | AI concept and technology learning |
| [planning-and-task-breakdown](skills/planning-and-task-breakdown/SKILL.md) | Development tasks, dependencies, and ordering |
| [spec-driven-development](skills/spec-driven-development/SKILL.md) | Engineering specifications and constraints |

Load only the skills needed for the current task. Templates, scripts, and methodology files ship with each skill; resolve relative paths from its directory. Use ask_user_question for questions and present for file delivery. Plans and specifications are not implementation or acceptance results. Browsers, Office, image generation, and cloud services require actual tools; this skill set does not promise those external capabilities.

A new idea starts with grouped questions about the main problem, the work goal, and competitor research. Goal and research choices include recommendations that require submission; known answers are skipped. An explicit one-at-a-time preference uses one independent question per turn, and clear tasks skip unrelated intake questions. Conversation preferences stay out of product summaries; ordinary questions omit backend registration fields and do not present unconfirmed user behavior as fact.

Nini Flow starts each new idea as an ungrouped conversation in an independent directory; choosing an existing Workspace continues that project. Draft conversations do not initialize product metadata until the user requests saved material or a deliverable. Initialization uses `aipm_stage`, registers the directory as a Workspace when needed, names it for the product, and attaches the current Session. Direction assessment uses `idea-refine`; only an explicit initiation deliverable request loads `ai-project-initiation`. Confirmed intake answers and research choices carry across skills.

An ungrouped conversation is not a registered product project. The project page lists registered projects only; saving a product initializes its Workspace without changing the conversation directory.

Agent Workshop uses the current conversation model with the native `aipm_workshop` tool. `get`, `select` and `check` do not initialize a product; `save` requires an initialized current project, validates again, refuses stale workflow versions and uses the shared document writer. Each requested document increments its own revision; internal proposal snapshots are referenced by the same catalog commit. Existing `03-PRD/Agent工坊/V<n>/` records remain readable. Requested PRD or plan files and automatic plan-review reports are emitted. Old versions, including manual edits, remain unchanged. The adapter ports the upstream feature-to-component rules and retains its MIT license; it runs no Python service or second model connection.

-----

Workshop impact and handoff tasks require an explicit project and selected current document versions. `aipm_delivery get` records their hashes before returning analysis text or archive metadata. `impact` validates exact document quotations and optional read-only code evidence, then saves a separate advisory report; supported code claims require implementation evidence. `package` assembles only selected original files, a version/hash checklist and coding-AI instructions into a downloadable ZIP. Missing PRD or plan is noted rather than generated. Both tasks reject changed inputs and preserve original documents. The optional nullable delivery configuration sets document count, per-file/model-input/report byte limits and compressed/uncompressed archive bounds; omitting it disables these tools.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

[The stage definitions](src/stages.ts) associate independent progress stages with typical outputs and legacy directory identities. [The store](src/store.ts) owns the project JSON, writes through a temporary file and rename, and preserves existing project instructions. Stage updates share the project metadata writer lock with user renames and re-read state after acquiring it, preserving a newly edited name and concurrent stage progress. [The project reader](src/project-view.ts) combines Workspace identity, optional stage state, and a bounded file scan without writing to those sources. Files under known stage directories are outputs; other files are materials. The reader omits internal directories and reports unavailable directories, invalid state, scan errors, or truncation without discarding Workspace identity.

[The patch](cordis.patch.yml) supplies the preset's task instructions, tool composition, and bundled skill directory. [The plugin entry](src/index.ts) registers `aipm_stage`, `aipm_document` and `aipm_workshop` in the mounting agent scope; tool execution requires a Session with a working directory. Workspace persistence and user-interface presentation remain owned by their consuming packages.

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

The declaration stays stable while the stage definitions remain unchanged. Calls add results to tool history; changing project state changes subsequent result text, not previously recorded results. Plan saves and explicit reviews start one independent model request; other operations do not. No provider-cache reuse is guaranteed. Document and Workshop schemas add fixed operation descriptions. get returns document identities, paths and revision metadata; save receives requested text or a local file reference and returns the committed identity, revision and paths. Source text enters the author conversation through explicit reads; independent review receives the selected snapshots. History metadata grows with retained revisions; normal tool-history retention and compaction apply. Review input includes only the selected plan revision and latest PRDs, under the configured byte bound; it does not replay author reasoning or tools. Review requests use a separate prompt prefix and add input/output tokens and latency. Delivery get returns only explicitly selected revision metadata and, for impact, text under maxInputBytes; snapshots and tool results are logged. Handoff bytes stay outside model context. Impact input varies with the selected documents and change, while package assembly uses no additional model request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Workshop checks validate structure and citation consistency, not source truth, design semantics or actual acceptance. Upstream model voting, simulated playground and code generation are not part of this adapter.
- Launch and retrospective work have no dedicated skill. Acceptance work reuses product-prd for planning; executed tests require available tools and real evidence.
- Project file views are bounded by explicit host-supplied depth and file-count limits. They are not an exhaustive file index, and they do not follow symbolic-link entries.
- Stage progress and document commits are separate. A progress-update failure after a document commit does not roll back the saved document.
- The inline stage-tool declaration is not indexed in the generated tool catalog; its source remains the exact declaration reference.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
