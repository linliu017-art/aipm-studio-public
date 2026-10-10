---
description: "Nini Flow product-project packages, for readers locating the AIPM preset, stage state, and project file views."
kind: "package-group"
---

# packages/aipm

English | [中文](README.zh.md)

## Summary

The AIPM family supports product work in Nini Flow projects. Users can work on one requested deliverable without completing a fixed sequence of stages. The AIPM package supplies the preset, stage records, and project file views; Workspace storage owns project identity and session membership.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

This group contains the product-project composition and its project state helpers.

| Package | Role |
|---|---|
| [`aipm`](aipm/README.md) | Product-work preset, independent stage progress, bundled skills, and read-only project file views |

-----

<a id="related-documentation"></a>
## Related documentation

- [Workspace subsystem](../../docs/subsystems/workspace.md) — project identity and session membership used by AIPM project views.
- [Tools subsystem](../../docs/subsystems/tools.md) — registration and execution of the stage-state tool.

-----

<a id="dev-note"></a>
## Dev Note

None.
