# Agent Note: Independent project document histories

Status: implemented

English | [中文](2026-11-03-project-documents.zh.md)

## Problem

Stage directories, skill sources and Workshop version folders formed the product-facing document hierarchy. Ordinary PRDs and Workshop plans followed different save rules, and a workflow V number did not identify each document's revision. Overwriting an ordinary file lost its previous contents.

## Decision

A document identity owns its title, kind and revision history. Ordinary conversations and Workshop use the same project-local writer. Immutable files are prepared under 文档 and published through an atomic replacement of the internal document catalog under a shared writer lock. Both ordinary and Workshop updates require the exact identity and observed document revision; matching titles never select a document. The same commit links the internal Workshop proposal snapshot, whose workflow counter remains separate from document counters.

Legacy stage outputs remain untouched. Organizing snapshots original bytes and records original paths; known Workshop versions group only by their exact stable document path. Ordinary and Workshop PRDs are not merged automatically. Existing Workshop proposal metadata remains readable until a new shared commit supersedes it. A malformed catalog, stale revision, missing indexed file or redirected path blocks writes rather than discarding history.

The project page groups documents by type and opens the current revision directly. History reveals old files, generation source and authorized producing conversations. Storage folders and internal JSON remain hidden; counts represent documents rather than revision files. Stage status uses separate metadata without visible numbering or automatic stage-folder creation.

## Consequences

Existing file links keep working. Imported history reflects bytes present when organized; earlier overwritten contents cannot be reconstructed. Uncommitted files left by process termination have no catalog entry and remain unpublished. Atomic replacement does not claim fsync crash durability. Manual edits to retained originals after organizing do not alter the committed current document; subsequent edits use the unified save operation.

## Verification

Filesystem tests cover independent versions, exact legacy grouping, original preservation, same-title separation, stale concurrent saves, rejected partial batches, corrupt catalogs and path redirection. Real Loader tests invoke ordinary and Workshop saves and verify tool removal on disposal. Component and reader tests cover document counts, current/history preview, authorized conversation links and hidden internal paths. Recorded-session replay pins model-visible tool and preset changes. Browser verification covers actual project documents, right preview, history and narrow/light/dark presentation.

## Alternatives considered

Flattening the old directory tree alone leaves two incompatible save rules. Merging files by their titles can combine unrelated documents. Moving or overwriting existing files breaks links and manual edits. A project-wide version counter makes independently changed documents appear synchronized.
