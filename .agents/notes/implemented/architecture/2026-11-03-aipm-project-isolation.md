# Agent Note: AIPM project isolation

Status: implemented

English | [中文](2026-11-03-aipm-project-isolation.zh.md)

## Problem

New conversations inherited the default Workspace, so unrelated product ideas received its project name, AGENTS.md and stage history. New-idea intake also treated direction assessment as permission to produce a complete initiation report.

## Decision

Use existing Workspace identity and immutable Session cwd. The Host prepares each idea directory under a configurable parent outside registered Workspace trees, resolving symlinks before creation, but does not register it as a Workspace. Nini Flow enables `isolatedIdeas`; other profiles retain their existing start policy. Global New Session opens an ungrouped isolated conversation, reusing an available blank and sharing pending creation across rapid clicks. Explicit Workspace selection continues that project. Creation failures stay visible without falling back to an old directory. A later navigation supersedes an unfinished opening.

Existing nonblank conversations remain restorable. Cold start with no saved conversation opens an isolated blank instead of inheriting a recent project. The picker and conversation header expose the new-idea action; the header labels ungrouped conversations as unassigned. AIPM initialization stays in `aipm_stage`, occurs when saved material is requested, registers the existing directory when needed, names the Workspace and attaches the current Session without changing its identity or path. Cross-product requests in an existing conversation cannot replace that project's metadata.

Direction assessment uses `idea-refine`; initiation requires an explicit initiation deliverable request. Skills reuse confirmed intake answers and research choices. A skipped competitor choice never authorizes research. Ordinary conversation preferences remain outside product requirements.

An isolated conversation has no Workspace until its project is saved. The project catalog filters registered Workspaces by project metadata, not by titles, folder names or conversation count. Invalid existing metadata remains visible for repair. Legacy draft Workspaces retain their histories and files until explicitly removed.

New-task navigation creates a fresh Session by default even when a blank Session exists. Host blankness cannot establish that a browser draft is empty. Text, references and attachments remain in their original Sessions; startup restores the selected draft, while a Workspace picker carries it to a fresh target. Workshop sends user text with Host-owned workflow context.

## Consequences

Existing project files, Workspace identities, Session directories and histories are retained. New ideas create additional directories; the user can rename their Workspace or continue it explicitly. No Session format or second mutable project binding is introduced. The Host must have access to Documents or a configured ideas parent. A real Client boot is necessary to verify Cordis Remote namespace injection in addition to isolated navigation tests.

## Verification

Host tests cover unique directories, preservation of existing project files, nested-root rejection and creation failures. Client tests cover default isolation, explicit continuation, visible failure and navigation supersession. A keyless authored Session loads the current AIPM persona and interview skill through the shipped headless profile. Browser verification uses the running authenticated Web application; private QA records retain exact results and pre-existing unrelated GUI failures. Build, documentation gates and static checks cover the affected packages and generated catalogs.

## Alternatives considered

Prompt-only suppression leaves old instructions in the active directory. A second mutable project binding could disagree with filesystem tools and would require Session migrations. Relocating existing project directories risks files and history. Independent Workspace directories preserve explicit continuation and keep one source for task ownership.
