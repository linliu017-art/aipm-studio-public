# Privacy

English | [中文](privacy.zh.md)

AIPM Studio stores project files and session history on your machine. It is not an offline model: configured model providers, account services, searches, and web fetches receive the inputs needed by the features you use. Never put confidential information into a task unless you permit those services to process it.

## Extra uploads are off by default

| Mechanism | Shipped setting | What explicit enablement sends |
|---|---|---|
| Extra official-model session log | `session-log-deepseek.enabled: false` | Canonical session events in the additional `dsh_session_log` model-request field, beyond ordinary model input |
| Feedback telemetry | `session-telemetry-otel.mode: DISABLED` | The complete session-log prefix through explicit feedback, rating, edit, or withdrawal, including context and tool results |
| Desktop product analytics | `product-analytics.enabled: false` | Selected interaction events, with available device, account, OS, and application identifiers |

Disabling one mechanism does not disable the others. Feedback telemetry has no shipped collector URL; opting in requires both `DSH_TELEMETRY_MODE=FEEDBACK_ONLY` and an explicit `DSH_TELEMETRY_OTLP_URL`. Desktop analytics retains the upstream exporter's DeepSeek collector unless `DSH_PRODUCT_ANALYTICS_OTLP_URL` overrides it. Do not enable collection without choosing and disclosing its destination. Sending a model request still sends the model's required messages and tool context.

## Existing installations

Profile, home, and command-line patches take precedence over bundle defaults. Upgrading does not erase an earlier explicit setting. Inspect the effective configuration locally with:

```sh
pnpm dsh --profile web --dump-config
```

Review the three settings in the table for each profile you use, including `desktop`. Set the two `enabled` fields to `false` and feedback mode to `DISABLED` in any saved override. A nonempty `DSH_TELEMETRY_DISABLED` hard-disables feedback telemetry only. Already queued or previously delivered data cannot be recalled by changing these defaults. Read the [migration guide](../upgrade-guide/v0.2.1-alpha.1/private-telemetry-defaults/guide.md) before re-enabling a mechanism.

## Local files and credentials

The Web CLI normally uses `~/.dsh`; Desktop normally uses `~/.aipm-studio`. An explicit `DSH_HOME` overrides the location. Project documents remain in the project folder you select. Local credentials and sessions are not part of the source distribution. Do not upload a credential file, session export, project document, or a tokenized local URL with a bug report. The ignore rules reduce accidental commits but do not remove files already tracked by Git.
