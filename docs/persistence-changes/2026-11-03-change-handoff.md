---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-03-change-handoff

English | [中文](2026-11-03-change-handoff.zh.md)

## Summary

Records explicit impact/handoff document selections and the hashes observed before analysis or packaging.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-03-change-handoff
baseline: false
changes:
  - root: "event:workshop/delivery-snapshot"
    previous: null
    after: "db9a7e49b39f4fe1fbdf51d339fe3284bfb63a2145243f25a902bafc72316891"
    decision: same-version
  - root: "event:workshop/delivery-start"
    previous: null
    after: "173d76748eb49a48ede72c1f858b465abc620ee59cfc7ee726a473b85e9e3871"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Two additive ordinary Session events feed a host-only projection. Existing payloads, author messages and the Session format version remain unchanged. Existing logs continue to read; older readers without these definitions may refuse newly recorded tasks. The next human request releases the selected-document scope.

<a id="verification"></a>
## Verification

Focused Loader, Session admission and UI tests cover explicit selection, idempotent requests, input hashes, stale revisions and bytes, quote validation, source evidence, read-only scope, cancellation, ZIP byte fidelity, safe filenames, missing materials and bounded inputs/outputs. Browser download uses the existing Session file byte service.

<a id="dev-note"></a>
## Dev Note

None.
