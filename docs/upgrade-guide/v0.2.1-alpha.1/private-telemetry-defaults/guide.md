---
kind: upgrade-guide
description: "AIPM Studio disables extra Session uploads and Desktop analytics in shipped profiles."
---

# Private telemetry defaults

English | [中文](guide.zh.md)

## Change

AIPM Studio's base-backed profiles default feedback telemetry to `DISABLED` and no longer supply a collector URL. All shipped profiles, including the independent `sdk-minimal` tree, set `session-log-deepseek.enabled` to `false`. Desktop sets `product-analytics.enabled` to `false`. Ordinary model input still reaches the selected provider. These independent settings do not erase old profile overrides or recall data already queued or sent.

## Migration

1. Inspect each active profile's effective configuration locally. For Web, run `pnpm dsh --profile web --dump-config`. Review the desktop profile's saved patch separately.
2. In saved profile, home, or CLI patches, set `session-log-deepseek.enabled` and `product-analytics.enabled` to `false`, and `session-telemetry-otel.mode` to `DISABLED`. Each row replaces its entire configuration; retain the other fields required by that row. Remove obsolete upload-enabling environment overrides.
3. Restart the application and verify the three effective values. `DSH_TELEMETRY_DISABLED=1` is an additional hard-disable for feedback telemetry only.
4. To opt in later, read the [privacy policy](../../../user/privacy.md), choose the destination, and explicitly enable only the intended mechanism. Feedback upload requires both `DSH_TELEMETRY_MODE=FEEDBACK_ONLY` and `DSH_TELEMETRY_OTLP_URL`; omitting the URL fails activation instead of using an upstream collector. Re-enabling official-model Session logs can send events recorded while the feature was disabled.
