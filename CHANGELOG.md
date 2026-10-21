# Changelog

## 0.4.5 — 2026-10-21

- Align structured single-step JSON examples with the action envelope.
- Add an LM Studio check that the model fills arguments whose meaning only the input schema descriptions state. LM Studio applies `response_format` only as an output constraint, so prompts keep tool input schemas.
- Mark history-summary requests explicitly and exclude action-selection prompts and resolver outcomes from their schemas and validation, including server and hosted request contracts.
- Strengthen repeated-compaction coverage and correct runtime, provider, and browser-test documentation.

## 0.4.4 — 2026-10-21

- Constrain OpenAI-compatible single-step structured output to the selected tool's argument schema, including conversation replies. Keep the public tool-resolution result unchanged.
- Avoid repeating structured-output schemas in model prompts, leaving more of the request budget for application context and conversation history.

## 0.4.3 — 2026-10-21

- Automatically compact older Pi context through the configured resolver, without offering application actions to the summarizer.
- Preserve the full visible history, saved outcomes, and interrupted-turn recovery across compaction and reopening.

## 0.4.2 — 2026-10-21

- Enforce Pi's two-minute resolver deadline, including providers that ignore cancellation.
- Release the conversation after a timeout and reject late model actions without replay or fallback.

## 0.4.1 — 2026-10-20

- Refresh Pi's tool snapshot when components finish mounting between model rounds.
- Discard choices made against a catalog that changed during inference, then resolve again before invoking an application action.
- Keep invocation-time stale checks, cancellation, tool budgets, and recovery without replay.

## 0.4.0 — 2026-10-20

- Run Pi in the page; remove the Pi service worker and worker protocol.
- Bundle Pi implementation dependencies and emit NodeNext-compatible declarations.
- Use one `createResolver()` factory and separate `/command-input`, `/hosted`, and `/testing` entry points.
- Configure command input with a resolver or resolver choices; remove credential attributes.
- Require confirmation when metadata is present; use object handler arguments and owner-specific disposal.
- Reject duplicate names consistently and keep framework registration tied to lifecycle.
- Parse Zod inputs before approval and retain schema-builder input types.
- Repair command feedback, resolver/session behavior, and native invocation events.

See the [migration guide](./docs/migration-0.4.md).

## 0.3.0

Renamed the model-provider adapter from planner to resolver. See [migration](./docs/migration-0.3.md).

## 0.2.1

Made Pi libraries runtime dependencies so consumers did not need to install them separately.

## 0.2.0

Introduced the Pi controller and independent chat entry points.
