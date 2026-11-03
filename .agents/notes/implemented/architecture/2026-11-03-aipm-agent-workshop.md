# Agent Note: Native Agent Workshop adapter

Status: implemented

English | [中文](2026-11-03-aipm-agent-workshop.zh.md)

## Problem

The workbench has product skills but no executable component-selection or versioned-delivery operation for Agent product plans. Running the downloaded Python application separately would create another model configuration, workspace tree and delivery path.

## Decision

Adapt Agent Workshop's MIT feature catalog and deterministic selection into the existing AIPM package. A discoverable skill performs reasoning with the active Session model; aipm_workshop owns read, select, check and save operations. PRD-only requests omit engineering design and only requested artifacts are saved. Ordinary product PRDs retain product-prd routing. No external research, code generation or additional model invocation follows from this integration.

Use the current immutable Session cwd and existing aipm_stage initialization. Reads and checks do not register projects. Saves validate source quotes and applicable design rules, then use the [shared document catalog](2026-11-03-project-documents.md). Its atomic commit links requested document revisions and the internal Workshop proposal snapshot. Each document and the workflow have separate version counters. Legacy Workshop metadata remains readable; old files and manual edits remain available. Existing path ancestors and revision metadata must resolve inside the selected project.

The dedicated Workshop navigation opens a read-only landing page. Start sends the user task once with structured workflow choices. The Host loads the scoped skill and logs its body and selected workflow as skill-invocation context, keeping infrastructure prose out of the user message. Acceptance precedes navigation; failures leave the form available for retry. Modes do not inherit project context; only an explicit project selection attaches a launch to that project. This keeps other unsent drafts intact and prevents page navigation from registering Workspaces.

Project details allow users to edit the generated project name. The Host commits project metadata and the Workspace title together and restores metadata if title persistence fails. Shared file locking with stage updates protects the edited name and progress; directories and exported documents keep their original paths and contents.

## Consequences

No Python runtime or extra credentials are required. Proposals and save requests remain visible in ordinary tool history. Component assessments and source material are still model inputs; quote matching does not prove truth or user approval. Mechanical checks do not provide independent review, implementation or acceptance evidence. Version folders are immutable exports rather than a mutable current-document mirror. A corrupt latest version blocks another save instead of silently falling back.

## Verification

Real Loader tests exercise the registered tool and disposal. Filesystem tests cover requested artifacts, preserved manual edits, rejected source claims, malformed revisions, concurrent stale writes and redirected paths. A keyless authored Session covers model-facing invocation through the shipped headless profile. Browser checks exercise discovery, actual model drafting, project outputs and versioned iteration. Source/license records and bundled resource validation cover the imported method.

## Alternatives considered

A link or copied Skill alone would not execute rules or protect versions. Launching the upstream application would duplicate model configuration and project storage. Hidden extra model calls would require additional logged orchestration and would misrepresent current review evidence; the adapter therefore reports mechanical checks explicitly.
