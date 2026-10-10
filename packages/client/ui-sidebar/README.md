---
description: "Fixed sidebar shell plugin for the dsh web client: brand row, New Session action, navigation rail, workspace region, and Settings seat."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sidebar

English | [中文](README.zh.md)

Desktop product events use the optional [product analytics service](../product-analytics/README.md); ordinary Web interactions are excluded.

## Summary

The dsh web client has full-width top navigation and a permanent left rail below it. The conversation history pane appears on Agent chat only, not Projects or Task center. Brand registrations render in the top navigation; quick actions and session browsing retain their existing behavior.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The sidebar is the fixed navigation shell: users see the brand, start new sessions, browse history, and reach Settings. Feature plugins fill its seats — ui-workspace fills `sidebar.workspaces`, ui-settings registers the trigger row and settings panel at `sidebar.settings`.

### Brand and New Session

The sidebar renders `sidebar.brand.mark` at the top of the permanent navigation rail and `sidebar.brand.name` above the Agent heading in the conversation detail pane. Both are independent single slots owned by `sidebar`; the full-width top row shows only the selected page title. On Web and Windows desktop, clicking the brand starts a new session; hovering or focusing it shows no tooltip. Without occupants, the shell uses the fish mark and a localized local-build label. A complete build stacks a code badge below the label as `version[-commit][-dirty]`, using `DSH_CLIENT_VERSION`, the optional 7-character `DSH_CLIENT_COMMIT_HASH`, and `DSH_CLIENT_GIT_DIRTY=true`; missing version metadata omits the badge. New Session targets the explicit Workspace used by a scoped action, otherwise the automatic default Workspace, otherwise the current or most recently active Workspace; when none exists it clears into the blank New Session page. The New Session button displays the effective binding as trailing grey text on hover or keyboard focus. While the shortcut is visible, the centered icon and label fade before it when space is narrow; CSS reserves the shortcut’s width without measuring the button. Icon-only controls retain tooltips with platform-formatted keycaps. All controls expose `aria-keyshortcuts`.

### Global panel entries

Plugins add an icon component to the root-scoped `sidebar.panellist` list with an `id`, optional `order`, and a string or locale-aware `label`. The same id addresses the component registered in the layout's root-scoped `main` keyed slot; selecting a missing main entry throws without changing the current selection. The label supplies plain visible text, the accessible name, and the collapsed tooltip. Each row reads its own selected state through `usePanelInfo`; moving DOM focus to search or a directory picker does not change the displayed panel or its selected row. With no registrations, neither the list nor spacing for it is rendered. The shipped composition registers the Projects panel; project deliverables are displayed within project details rather than in a separate global panel.

### Fixed-column behavior

The left sidebar has no collapse command, toggle button, hover preview, or responsive auto-collapse. `sidebar.left.toggle`, `sidebar.toggle.badge`, and the `shell.leading` reopen seat are intentionally absent.

On Windows Electron, `html[data-windows-titlebar]` reserves the caption strip above the fixed sidebar. The brand and New Session action remain in the detail pane, while caption controls exclude themselves from the window drag region.

### macOS desktop

Under `html[data-platform='darwin']`, the full-width top navigation clears the hiddenInset traffic lights horizontally. The rail and content start below that row. The [Desktop reference](../../../apps/desktop/README.md) owns window integration.

### Scrollbars

The fixed column uses the normal theme scrollbar tokens. Gutter reservation belongs to the scrolling region (ui-workspace), so scrollbar painting does not change row geometry.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The shell is pure composition: `SidebarRootComponentProps` composes the layout owner share, the global `useSessions` and `useWorkspaces` hooks, the declared brand, the `sidebar.workspaces` and `sidebar.settings` child slots, and injected navigation callbacks. Panel entries and their optional titles use the same composition path. Panel metadata is derived from list registrations and locale changes; selection belongs to the layout store.

The Projects panel reads `.aipm/project.json` through an existing Session and recursively scans project files. A single document tree combines materials and outputs, with folders initially expanded and no separate Overview or Directory tabs. Markdown rows use unfilled document glyphs; stage folders use a faint accent background. Opening a file selects its producing or reader Session without leaving the project page and opens the optional right preview. Closing the preview releases its column.

Only stages with files or an in-progress/done state appear as compact cards above the document tree. Each card shows its stage number, name, and file count. Blue in-progress and green output/done numbers retain dot/check marks and localized hover, click, and keyboard-focus hints. Cards wrap within the available content width, including when an open preview narrows the page.

### Slot discipline

Declaration-aware `slots.inject()` lets a replacing package activate before or after the sidebar. The foot is the `sidebar.settings` seat: the sidebar renders only the bottom-pinned layout slot and shares its column state (`wide`). The `/client` exports are the plugin body (`apply`/`inject`) plus the contract types only; SidebarRoot, the row components, and the tree derivation remain package-internal behind the slot registration.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

These pages cover the surfaces that fill the shell's seats and the composition model.

- [ui-workspace](../ui-workspace/README.md) — the Workspace and Session browser rendered into `sidebar.workspaces`.
- [ui-settings](../ui-settings/README.md) — the settings domain base registering the trigger row at `sidebar.settings`.
- [ui-layout](../ui-layout/README.md) — the layout owner that supplies the fixed column width.
- [ui-theme](../ui-theme/README.md) — the scrollbar token indirection the shell rebinds.
- [Slot system standard](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md) — the composition model behind the seats.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package is a browser-side UI plugin layer that registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define what the shell owns versus what its occupants own; they are current package constraints.

- **Session state-dot rendering is owned by ui-workspace** — no done/error notification sources are available to this shell.
- **Workspace browser behavior is composition-owned** — grouping, ordering, search, and row state belong to ui-workspace, not this shell.
- **"New task completed" unread marking is local viewing state** — completion-time > last-seen never reaches the host.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
