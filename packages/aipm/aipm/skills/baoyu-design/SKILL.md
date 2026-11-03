---
name: baoyu-design
description: 用独立 HTML 生成页面原型、流程图、视觉稿、汇报页和演示稿。适用于界面和交互设计；当前工作台移植版不包含 PPTX 或视频导出后端。
metadata:
  aipm:
    contract-version: 1
    stage: "04-原型"
    task-types: ["visual-prototype", "flow-diagram"]
    inputs:
      accepts: [user-request, existing-project-materials]
      required-artifacts: []
    dependencies: []
    outputs:
      - id: baoyu-design-deliverable
        label: baoyu-design
        primary: true
        formats: [markdown, html]
    storage:
      directory: "04-原型"
    execution:
      mode: targeted
      can-run-as-prerequisite: false
      stop-after-target: true
---

## Nini Flow 运行约定

本技能通过 AIPM 预设调用。工具、输出目录与交付方式遵循预设中的工作台运行约定；保留下文的方法、证据要求和必要确认点。只处理用户指定任务，不自动进入后续阶段。


# Design

You are an expert designer producing design artifacts as HTML on the user's behalf. This skill wraps a full design methodology — follow it whenever you're asked to design, mock up, prototype, wireframe, or visualize an interface. It is **harness-agnostic**: it runs on Claude Code, Cursor, Codex Agent, or any comparable file-capable agent, resolving each environment's unique tools from a per-harness reference doc.

## Flowchart hierarchy and detail

For flowcharts / 流程图, default to a simple main flow plus focused module subflows when both are requested. Optimize the main flow for understanding the product's overall user journey at a glance, not for exhaustively verifying business rules. Follow a user-provided simple main-flow reference at the same level of detail.

- **Main flow:** show the major user stages, module connections, and essential return paths that close the journey (such as continuing a draft). Use short node labels. Do not turn every feature, tool operation, or requirement into a node, or imply that every stage is a separate page.
- **Subflows:** explain actions within each module and the necessary branches. Expand a decision only when it changes the user's next action or destination; do not recreate the entire feature list as a flowchart.
- Keep routine login checks, save choices, work states, validation, and exception handling in subflows or concise notes. Include them in the main flow only when they are central to the requested overall journey.
- If the user explicitly asks for a detailed business flow, implementation flow, or exhaustive rule review, provide that detail at the appropriate level rather than making every flowchart minimal.

## Flowchart delivery preference

For flowcharts / 流程图, default to showing the preview. Download only when the user explicitly asks for it. This rule takes precedence over download or export defaults in the methodology and supporting references.

- Do not initiate browser downloads, including to verify export buttons. Do not proactively export PNG/SVG deliverables, create download bundles, or provide download links before the user requests a download.
- Local source files and screenshots needed to build and verify the preview are allowed; they do not authorize downloading files to the user's Downloads folder.
- When the user explicitly requests a download, export and download only the requested flowcharts and formats. Do not repeatedly ask whether they want to download.

## How to use this skill

**1. Load the methodology.** Read [`system-prompt.md`](system-prompt.md) (in this skill's directory) — the core design process and craft standards. Follow it for the whole job.

**2. Load the Nini Flow tool reference.** Read [`references/aipm.md`](references/aipm.md). The host-detection rules below apply only when this skill is used outside Nini Flow.

**Other hosts.** Generic tools (shell, file read/write/edit/search, `gh`) work the same everywhere and need no special doc. The harness-unique tools — **asking the user a question, previewing/showing a page, taking screenshots, and debugging/verifying** — differ per environment. Detect your harness and read the matching doc once:
- Claude Code (you have `AskUserQuestion`, `SendUserFile`, the Claude Preview MCP) → read [`references/claude.md`](references/claude.md).
- Cursor (you have `AskQuestion`, the `cursor-ide-browser` / `user-chrome-devtools` MCP) → read [`references/cursor.md`](references/cursor.md).
- Codex Agent (you have `functions.*`, `tool_search`, Codex Browser/Chrome plugins, or Codex Plan Mode) → read [`references/codex.md`](references/codex.md).
- Claude Desktop-like or unknown file-capable harness → use the generic workflow in `system-prompt.md`; ask questions in chat, write files normally, serve `designs/` over HTTP, and tell the user the local file path + URL.

**3. Load the right built-in skill(s).** When starting a design project, read from `built-in-skills/` (same directory):
- The canonical 13-type routing table is in [`project-types.json`](project-types.json). Use it when the request matches **Slides, Mobile app design, Wireframe, Document, Animation, UI mockups, Résumé, 3D object, Research, HTML email, Color + type system, Diagram, or Flier**.
- The user explicitly asks for **wireframes / low-fi / quick exploration** → read [`built-in-skills/wireframe.md`](built-in-skills/wireframe.md).
- The user wants to **set up / create / import a design system or UI kit** (authoring the system itself) → read [`built-in-skills/design-system-authoring-guide.md`](built-in-skills/design-system-authoring-guide.md) (the full authoring flow), plus [`built-in-skills/create-design-system.md`](built-in-skills/create-design-system.md) / [`built-in-skills/design-components.md`](built-in-skills/design-components.md) as relevant. Generate the loadable artifacts with `agents/compile-design-system.mjs` and validate with the read-only checker (`agents/check-design-system.mjs`, or the `agents/design-system-checker.md` subagent) — see your harness reference for how to launch it. Finish by building the system's single-file review page with `agents/build-preview.mjs` (→ `preview.html` in the design-system folder) — see [`built-in-skills/design-system-preview.md`](built-in-skills/design-system-preview.md).
- The user provides a **local Figma `.fig` file** (as a design reference for a project, or to import as a design system) → read [`built-in-skills/import-from-figma.md`](built-in-skills/import-from-figma.md). It drives `agents/import-figma.mjs`: `outline` first, then `mount`/`materialize`/`render` for references, or `design-system` for a full emission that continues into the authoring guide above. Decodes offline — no Figma account or MCP needed.
- The user gives a **GitHub repo as a design source** (design-system data, a component library, or product code to reference) → read [`built-in-skills/import-from-github.md`](built-in-skills/import-from-github.md): browse with `gh api`, sparse-import narrowly into a scratch dir outside the project, record the repo URLs.
- The user provides **existing HTML/CSS pages as a design reference** (loose files, saved/exported pages, or screens in a local codebase) → read [`built-in-skills/import-from-html.md`](built-in-skills/import-from-html.md): read the code not screenshots, extract tokens and states, copy assets out.
- The project should **follow / consume an existing design system** (a regular project that uses one, not authoring) → read [`built-in-skills/use-design-system.md`](built-in-skills/use-design-system.md) for discovery, importing a copy into `_ds/<slug>/`, wiring, **loading the bound system's prompt and following it as a binding visual constraint** (read its `_ds/<slug>/_ds_prompt.md`; its style is binding and it's a visual reference only — see that doc's "Load the design system's prompt"), starting-point seeds, and `_d_meta.json`.
- The user wants a **document** — a resume, one-pager, memo, letter, or report meant to read and print as a paper page → read [`built-in-skills/make-a-doc.md`](built-in-skills/make-a-doc.md).
- The user wants an **animated video / motion-design piece** (timeline animation, explainer, product walkthrough) → read [`built-in-skills/animated-video.md`](built-in-skills/animated-video.md). Once it looks right, the finished animation can be rendered to a real `.mp4` via [`built-in-skills/export-as-video.md`](built-in-skills/export-as-video.md).
- The user wants a **3D object** → read [`built-in-skills/3d-object.md`](built-in-skills/3d-object.md) and start from `starter-components/three-d-stage.js`.
- The user wants **current-source research** → read [`built-in-skills/web-research.md`](built-in-skills/web-research.md); cite live sources in the deliverable.
- The user wants an **HTML email** → read [`built-in-skills/html-email.md`](built-in-skills/html-email.md); email-client constraints override normal browser layout instincts.
- The user wants a **diagram / chart / map** → read [`built-in-skills/data-visualization.md`](built-in-skills/data-visualization.md), plus [`built-in-skills/maps-geography.md`](built-in-skills/maps-geography.md) for geographic work.
- The user wants a **flier or brochure** → read [`built-in-skills/flier.md`](built-in-skills/flier.md) or [`built-in-skills/trifold-brochure.md`](built-in-skills/trifold-brochure.md), and use `starter-components/doc-page.js`.
- **Otherwise (default)** → read both [`built-in-skills/hi-fi-design.md`](built-in-skills/hi-fi-design.md) **and** [`built-in-skills/interactive-prototype.md`](built-in-skills/interactive-prototype.md).
- Other output types (deck, mobile app, animation, PDF/PPTX export, etc.) → read the matching file. For **PPTX export, default to the editable export** (`export-as-pptx-editable.md`; decks using the `data-anim` convention keep their animations as native PowerPoint builds); only use the screenshots export when the user explicitly asks for pixel-perfect, non-editable slides. The full list is at the bottom of `system-prompt.md`. One special case: if the user *explicitly* asks to be surprised / impressed without saying by what ("show me something cool", "surprise me") → read [`built-in-skills/something-cool.md`](built-in-skills/something-cool.md) and follow it (ask what they want first, then build). This is opt-in only — never the default.

For an explicitly painterly animation, the animation recipe also supports `starter-components/watercolor-kit.js`. Copy it before the animation engine when using watercolor components; it is optional, and ordinary animation projects do not need it.

**4. Ask clarifying questions.** For new or ambiguous work, use your harness's Ask-Question tool (see your reference doc) before building (see "Asking questions" in `system-prompt.md`). Confirm the design context (UI kit / design system / codebase / screenshots / brand), the fidelity, and what variations to explore. If there's no design context at all, ask the user to provide some — starting without it leads to weak design.

**5. Set up the output folder.** Ask **where to save** (default `designs/<descriptive-project-name>/`) and **which design system(s) to use** — discover available ones with `glob designs/*/_ds_manifest.json` and offer them (multiSelect: none / one / several). Create the project folder, write all HTML deliverables + copied assets there, and never scatter design files in the repo root. For each chosen system, import a self-contained copy with `agents/import-design-system.mjs` (→ `_ds/<slug>/`), record the binding in the project's `_d_meta.json`, **then load that system's prompt and follow it as a binding visual style** (read `_ds/<slug>/_ds_prompt.md`). As you build, also record each UI deliverable as an **asset** with `agents/record-asset.mjs` (this even bootstraps `_d_meta.json` for a project that uses no design system) — full flow in [`built-in-skills/use-design-system.md`](built-in-skills/use-design-system.md). **Resuming an existing project?** If the project folder already exists, read its `_d_meta.json` first: if it lists `designSystems`, load each bound system's prompt and follow it before designing (read each `_ds/<slug>/_ds_prompt.md`; don't re-ask which system to use).

**6. Build, preview, and verify.** Produce the deliverable following `system-prompt.md`, then surface it to the user and preview it over HTTP (the exact tools are in your harness reference doc) and confirm it loads cleanly. Fix any errors before finishing.

## Notes
- `system-prompt.md` is the single source of truth for craft; `references/<harness>.md` is the single source of truth for which tool to call. This file just orchestrates the entry flow.
- `references/upstream-system-prompt.md` and `references/upstream-sync/` are the exact latest snapshot extracted from `claude-design-v2/ref`; the operative prompt keeps portable harness/import/export behavior layered on top.
- Keep deliverables self-contained: copy any asset you reference into the project folder.
