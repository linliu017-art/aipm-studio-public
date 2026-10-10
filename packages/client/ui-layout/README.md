---
description: "Shell layout for the Web GUI: the three-column AppFrame whose right column is a track for an edge-anchored panel, the panel-geometry service, and theme presentation; for users and maintainers of the window chrome."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-layout

English | [中文](README.zh.md)

## Summary

This package provides the Web GUI's three-column AppFrame, edge-column widths, and `ctx.layout` presentation control. The right column concedes space before the center; its occupant renders fullscreen while the frame retains the wide-screen track underneath. The theme presenter owns color scheme, alias tokens, content font size, and document metadata. Layout state resets on reload.

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

The root slot renders the full-width `shell.header` above the sidebar, main content, and optional right column. Conversation uses a 264–420px sidebar, initially 280px; Projects and Task center use only its fixed 58px navigation rail, preserving the conversation width for return navigation. The rail has no resize handle. The right panel first opens at 45% of the viewport, retains the user's pixel preference, and is capped at 70%. It shrinks to 300px before closing to protect 400px for the center. Dragging has no transition delay; the right handle is absent while closed or fullscreen.

Global panels occupy the root-scoped `main` keyed slot; `conversation` is the reserved key for the Conversation. `ctx.layout.selectPanel(id)` selects a registered panel, and `null` selects the Conversation without changing the current Session. The Plugins page contributes one of the shipped global panels.

The single root-scoped `shell.bottom` slot spans the full width below the three columns. Its occupant controls its own height and visibility; the columns shrink by that height, and empty content reserves no space. Main-panel navigation preserves the bottom component. Column resize handles stop above it, while `shell.overlay` covers the whole frame. The default composition leaves this slot empty.

<a id="window-chrome-seat"></a>
### Window-chrome seat

On macOS desktop (`html[data-platform='darwin']`), the top navigation clears the hiddenInset traffic lights horizontally; all columns start below it. Projects and Task center do not add a second native-titlebar clearance. The root's overlay clearance remains available to portalled dialogs and menus. Chrome rows mark their own drag region with `data-window-drag`, while controls remain clickable.

Windows Electron's `data-windows-titlebar` marker reserves the caption height above all columns and removes the collapsed sidebar rail. Only the content area's top-left corner has a 16px radius; the other corners and the internal divider remain square. The frame publishes `--dsh-windows-content-radius` and `--dsh-windows-sidebar-width` for ui-sidebar-right's fullscreen corner and sidebar clearance. Ordinary Web documents do not receive the marker; macOS retains its separate layout.

The root publishes `--dsh-frame-top-clearance` for the reserved strip (48px on macOS, the caption height on Windows), and `--dsh-frame-overlay-top` adds 20px for dialogs and menus. Native fullscreen reduces the overlay inset to 20px; dialogs retain their own 24px minimum. `--dsh-frame-chrome-top` excludes the Windows caption from modal mask painting and becomes zero in fullscreen. The full-viewport modal layer still blocks background clicks. Plain browser documents publish none of these values.

### Theme presentation

The presenter consumes resolved theme snapshots and projects them onto the document: `html { color-scheme }` for native UA chrome, `body[data-ds-dark-theme]` from the active color scheme, the theme's alias tokens and `--dsh-content-font-size` as inline variables on body, and one owned `<meta name="theme-color">` whose content follows the computed body background. Disposing the presenter removes its metadata node with its other global writes.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`selectPanel(id)` checks the live `main` registry before changing selection; an absent key throws and leaves the current panel intact. `beginNavigation()` returns an abort signal for an asynchronous UI navigation. A later call, a valid panel selection (including repeated selection), or layout disposal aborts that signal without cancelling underlying Session creation. Consumers check the signal before committing navigation or moving drafts.

One registration declares the frame slots and binds `ctx.layout` methods `selectPanel`, `toggleSidebar`, `setRightbarPosition`, `openRightbar(track, fullscreen)`, and `closeRightbar`. One root store separates `panelInfo` selection from `layoutInfo` measurements, width preferences, and presentation reports. `ctx.layout.panelInfo` and the standard `usePanelInfo` hook share the same selection source; AppFrame subscribes to the stable layout object. The `rightbar` owner supplies actual `width`, docked `position`, `viewportWidth`, and normal-presentation eligibility `canShow`; `position: 'center'` swaps the main and resource grid columns so the resource takes the flexible center while the Conversation remains in the fixed right column. Insufficient room causes a deterministic close, never automatic reopening on widening. Fullscreen hides the width handle without releasing a track the occupant retains. AppFrame keeps the column containers mounted. The right column's root controller renders `rightbar.session` through `SessionProvider` only while the Conversation is selected; its unmount report releases the track. The independent title component uses the selected Session title only while the Conversation is visible, with the build-configured product title or localized `common.brand.localBuild` as its fallback; locale revisions update that fallback. The theme presenter is a second effect: pure DOM writes from resolved snapshots — initial state through the getter once, then event-driven only, with no React path. It applies palette, font-size, and token variables before measuring the rendered background as the single color authority. Fullscreen presentation suppresses grid and handle transitions; its occupant reports the new columns only after covering the frame. Fullscreen exit keeps transitions suppressed while the frame installs its destination geometry: close removes the right track, and restore retains it. Subsequent normal geometry actions restore ordinary transitions.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the layout surface is not enough. They move from the frame to the columns it renders and the theme it presents.

- [ui-sidebar](../ui-sidebar/README.md) — occupies the `sidebar` column and its seats.
- [ui-conversation](../ui-conversation/README.md) — occupies the `main` key `conversation`.
- [ui-sidebar-right](../ui-sidebar-right/README.md) — occupies the `rightbar` column with one docking surface per session.
- [ui-theme](../ui-theme/README.md) — the theme seam whose resolved snapshots the presenter consumes.
- [Web client architecture](../../../docs/subsystems/web-client.md) — how browser plugin rows load and register slots.

-----

<a id="model-experience"></a>
## Model Experience

None, as the layout shell manages browser viewing state; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define the current layout behavior. They are current package constraints, not a general window-manager comparison or a task backlog.

- **Panel geometry is transient** — reload restores the sidebar default and the right panel hidden; each dragged width is one frame-wide preference, not a per-Session fact.
- **Extremely narrow windows** — after the right panel closes, the center may still fall below 400px; the left 56px rail remains.
- **Track and panel travel on one shared curve only while animating** — during a discrete open/close the frame sets `data-animating` and its track transition and the occupant's slide read the same duration and easing variables; an occupant that used its own would detach the panel's edge from the conversation's while squeezing. Drags and instant presentation switches run transition-free, so the curve does not cover them.
- **No scroll anchoring during squeeze reflow** — layout changes may move the reader's viewport.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
