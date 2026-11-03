---
kind: upgrade-guide
description: Nini Flow starts new conversations in independent idea directories instead of inheriting the default project.
---

# Nini Flow independent ideas

English | [中文](guide.zh.md)

## Change

Nini Flow enables `isolatedIdeas` in the Workspace UI. Global New Session opens an ungrouped conversation with an independent directory, without adding a Workspace or inheriting an existing project. Repeated clicks reuse an available blank and concurrent clicks share one creation. Saving the project registers that directory and attaches its Session. Explicit Workspace selection continues that project. Existing directories, Session identities and histories are retained. Other profiles keep their existing start policy.

Only registered projects appear in the project catalog. Existing draft Workspaces stay in conversation history and keep their files, but no longer create project cards. Saving a draft as a project makes it appear without moving the directory.

## Migration

1. To continue an existing project, select its Workspace or reopen its conversation. Use the new-idea action for another product.
2. On hosts without system Documents lookup, configure `documentsDirectory` or a fully qualified `ideasDirectory` on `workspace-controller`. The ideas parent must be outside registered Workspace directories.
3. Refresh the browser and confirm that New Session does not add a Workspace, while its unassigned conversation contains no old project instructions or stage files. Creation errors remain visible and never select an existing project.
