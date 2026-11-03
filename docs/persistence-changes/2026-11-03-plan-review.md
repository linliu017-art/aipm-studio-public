---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-03-plan-review

English | [中文](2026-11-03-plan-review.zh.md)

## Summary

Adds separate technical-plan review request and settlement records.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-03-plan-review
baseline: false
changes:
  - root: "event:aipm/review-request"
    previous: null
    after: "7a019f248466b740d92341b1456a09f6d57f3abea1c4db8d8238b515c93aafd1"
    decision: same-version
  - root: "event:aipm/review-result"
    previous: null
    after: "3a43f85618197d8cb0f83119affc05ecc6f1da176417071b888127bcba2a6b27"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing Session records and event payloads remain unchanged. New aipm/review-request and aipm/review-result events record an auxiliary tool-free model call without entering author conversation history or changing replay. The writer remains on the current Session format. Older readers without these event definitions may refuse new review records rather than silently drop them.

<a id="verification"></a>
## Verification

Focused AIPM, sidebar and Session admission tests passed: 18 files, 146 tests. Review tests verify pre-dispatch input logging, route selection, saved reports, invalid/truncated output, deadlines, cancellation and preservation of source revisions.

<a id="dev-note"></a>
## Dev Note

None.
