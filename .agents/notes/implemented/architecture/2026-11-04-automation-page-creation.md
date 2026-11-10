# Agent Note: Create scheduled tasks on the task page

Status: implemented

English | [中文](2026-11-04-automation-page-creation.zh.md)

## Problem

The task page's New action navigated to a chat, so users could not create a scheduled task where they managed tasks. Schedule delivery still requires a Session and persists separately from Session creation.

## Decision

The page form gathers task name, instruction, optional Workspace, and one-time, daily, or weekly timing. A submission allocates a stable Session identity and request UUID before creating either resource. The client creates or adopts the Session and calls the Session-bound Schedule Remote. Schedule serializes writes and reuses the stored record for a retry with the same identity, so an unconfirmed response is not automatically duplicated. Cancellation before submission has no writes. The form retains its submission after a failure for an explicit retry. Existing model tools and task editing continue to use the same service.

## Advance notices

An optional browser-local lead time belongs to a task id. The shell overlay watches the authoritative catalog and saves an unacknowledged notice per occurrence. Notices persist across reloads only until dismissed or the scheduled time arrives. Settings and notices are scoped to the current browser and this does not deliver OS notifications. The compact notice opens its task or snoozes for five minutes when more than five minutes remain, without changing its scheduled execution.

## Reload and sound

The current main panel and selected task are retained in tab-scoped session storage and restored after the main slot registers. New advance notices play a short Web Audio cue after a user gesture; a restored notice does not replay it and unavailable audio does not block the notice.

## Alternatives considered

**Open a chat from New.** The previous action reused the conversation flow, but users had to leave the task list to enter the task and schedule. A form in the task page keeps creation and management together.

## Consequences

Users can create a task from the task list. The client must retain the Session and request identities across retries because Session creation and task storage are separate writes. Advance notices are local to the browser, so another device needs its own notice settings.

## Verification

Host idempotency and client form behavior are covered by focused tests. An isolated Web server was used to create a task and observe its catalog entry. The full GUI suite currently has unrelated failures; browser replay could not build its native addon under the installed macOS SDK.
