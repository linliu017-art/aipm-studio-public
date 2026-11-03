# Nini Flow tools

Use this reference inside the AIPM workbench instead of Codex, Cursor, or Claude tool references. Read `system-prompt.md` and the relevant design resource; preserve the design methodology.

| Capability | Workbench operation |
|---|---|
| Clarifying questions | `ask_user_question` or ordinary chat; reuse answers already supplied. |
| Read and write files | Available filesystem tools and `bash` or `pwsh`; paths belong to the selected project. |
| Load another skill | `skill` for a registered skill; read `built-in-skills/*.md` directly for this skill's own resources. |
| Execute bundled helpers | Run scripts from this skill's resource directory with the available interpreter; inspect dependencies first. |
| Search and fetch | The available `web` tool; cite retrieved sources. |
| Deliver a design | `present` with the actual file path. Put prototypes under `04-原型/`, unless the user selected another directory. |
| Browser verification | If a browser tool or the locally installed `ego-browser` CLI is available and authorized, use it for rendered checks. Otherwise perform static checks and report that visual verification remains unperformed. |
| Preview | Deliver HTML with `present`. If HTTP serving is needed, start one loopback server on an available port and supply its real URL. Do not use a server merely to claim browser verification. |
| Verification agents | Perform verification in the current session. Delegate only when the user explicitly requests it and a delegation tool exists. |

The workbench does not supply Codex's `functions.*`, `tool_search`, native cloud artifact sessions, or an image-generation service. Do not invent calls to those APIs. Use CSS/SVG or supplied images for visual assets; report unavailable exports or provider-dependent features before promising them. Do not install software, publish a site, send messages, or invoke paid services solely because a design resource mentions them.

Keep images, templates and helper paths relative to the loaded skill directory; never assume the authoring machine's filesystem. For shell commands, verify an interpreter exists before using it. Do not copy this reference's file paths into product UI text.

This port includes HTML authoring resources and design-system helpers. It does not ship the optional gen-pptx or gen-video export backends. Do not execute commands referring to those directories or promise PPTX/video output; explain the unavailable export and deliver the requested HTML work that can be completed.
