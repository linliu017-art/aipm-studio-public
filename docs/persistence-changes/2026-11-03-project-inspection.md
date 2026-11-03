---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-03-project-inspection

English | [中文](2026-11-03-project-inspection.zh.md)

## Summary

Records explicitly selected repository-analysis targets, bounded inventories and verified source excerpts.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-03-project-inspection
baseline: false
changes:
  - root: "event:workshop/inspection-evidence"
    previous: null
    after: "5cbaaf6710efabbb18a451b44077df955057bacb30cc5e78a3602b4f688d315c"
    decision: same-version
  - root: "event:workshop/inspection-scan"
    previous: null
    after: "2708e88655a5aef8d280c1d9c1ecc486b8727cb7cca08a25a0fd808d780f0f16"
    decision: same-version
  - root: "event:workshop/inspection-start"
    previous: null
    after: "e79d8ca6f25e5dcf951e9d772b65f09f20a6a3c7df66c259c6b3466b4a234f90"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing Session payloads remain unchanged. Three new ordinary workshop inspection events feed a host-only projection; they do not alter author-message reconstruction. The selected human request retains its scope, and a later human prompt releases the inspection guard. Existing logs read unchanged; older readers without these event definitions may refuse newly recorded analyses. The Session format version remains unchanged.

<a id="verification"></a>
## Verification

Focused source-tool, Workshop UI and Session admission tests exercise separate destinations, selected-root enforcement, bounded scans and reads, secret/link exclusion, real line evidence, stale hashes, claim categories and admission deduplication. Seven repository-evidence Loader tests pass, including runtime mutation denial and later-task scope release.

<a id="dev-note"></a>
## Dev Note

None.
