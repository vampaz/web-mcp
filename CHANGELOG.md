# Changelog

## 0.8.1 — 2026-10-29

- **LM Studio:** explain server, CORS and browser permission recovery when model discovery fails or times out. Caller cancellation remains unchanged.

## 0.8.0 — 2026-10-29

- **Native WebMCP:** return structured failure envelopes instead of rejecting application failures. Native callers must check `isError`; successful output is unchanged.
- **Core/Pi:** add `ToolExecutionError` and preserve JSON-safe partial-result details through invocation and conversation outcomes.
- **Testing:** add native browser agent journeys with live discovery, guarded execution, bounded correction and call/payload metrics.

## 0.7.0 — 2026-10-28

- **Pi:** preserve tool annotations and output schemas, filter host controls from discovery and invocation, and stop unchanged read loops with one bounded correction.
- **Resolvers:** preserve tool metadata across native, direct and hosted provider paths.
- **LM Studio:** expose `listLmStudioModels()` for shared chat model settings using the server’s actual model and loaded-instance IDs.

## 0.6.2 — 2026-10-28

- **Chat:** keep the header and message input visible when many suggested prompts need scrolling.
- **Chat:** hide suggestions during pending turns and scroll to the latest message when history first arrives in an empty conversation.
- **Accessibility:** keep suggested prompts outside the nested message log. The scrolling `::part(transcript)` now uses `role="region"`.

## 0.6.1 — 2026-10-27

- **Chat:** remove the redundant settings introduction and use the shared **Settings** labels in integrations. Retain the deprecated `settingsIntro` label for source compatibility.

## 0.6.0 — 2026-10-27

- **Chat:** add an optional settings module with an in-chat icon, provider/model selectors, app-owned approval preferences, status/error feedback, and a slot for diagnostics. Preserve conversation state and keyboard focus while switching views.
- **Local demo:** select LM Studio chat models or Chrome built-in AI through shared settings, retain model preferences, and move Presentation into chat settings. Keep automated test responses and conversations on the separate test server.
- **Documentation:** document settings configuration, callbacks, labels, slots, and application ownership in the chat guide and API reference.

## 0.5.2 — 2026-10-26

- **Documentation:** keep package guides self-contained and clarify application-owned Astro deployment resources.
- **Packaging:** remove an obsolete internal document exclusion and update the package contents check.

## 0.5.1 — 2026-10-26

- **Chat:** restore immediate New chat when the plus button is clicked, without a confirmation step. Keep the history and draft if clearing fails.

## 0.5.0 — 2026-10-21

Breaking release; see the [migration guide](./docs/migration-0.5.md).

- **Node:** require Node 24 or newer (`engines: >=24`), matching the development baseline.
- **Approval and invocation:** remove the `confirmed` bypass from `invokeTool()`; approve only on an explicit `true`; accept only plain JSON input and return `invalid_input` instead of rejecting; give event listeners copies; emit `confirmation-requested` and `confirmation-settled` events; report unvalidatable output as `invalid_output`; add `'pi'` and `'mcp-bridge'` sources; add atomic `registerTools()`.
- **Schemas:** enforce exclusive bounds, `multipleOf`, `uniqueItems`, property counts, `propertyNames`, `prefixItems`, `allOf`, `not`, and the `uuid`, `ipv4`, `ipv6`, and `hostname` formats; reject unsupported keywords such as `$ref` at definition; skip pattern checks after a failed length bound; cache patterns; shorten values in errors; warn about unchecked formats and inflected mutation verbs.
- **Resolvers:** stop the heuristic resolver from matching schema keywords or inventing optional inputs; add `ResolverError` with context-overflow detection and provider messages; add `ToolResolutionValidationError`; omit default `temperature`; report Chrome download progress and let callers cancel the wait; share hosted sessions and add challenge timeouts; forward `parseInput` and infer types in `defineServerTool()`.
- **Pi:** send earlier turns' actions and the checkpoint as untrusted data; mark interrupted invoked actions as outcome unknown; expose `activity`, `usage`, structured tool messages, `refresh()`, cross-tab reloads, `deletePiConversations()`, and `listPiConversations()`; keep wrapped storage error codes; add `reason` and `actionMayHaveRun`; add one correction round for invalid model output; make request timeout, context size, and message length configurable; compact from measured request size; share frozen snapshots; delete the database on clear.
- **Chat:** rename `harness` to `controller`; confirm New chat; show activity, error tones, Edit last message, and structured tool details; add labels and locale, themes, parts, slots, `renderMessage`, an imperative API and events, mobile, RTL, forced-colors, and container-filling fixes.
- **Command input and devtools:** add Stop and Escape cancellation, focus restoration, labels, a launcher, parts, documented tokens, property upgrades, and stable shadow DOM; keep resolver sessions and running commands across equal reconfiguration; render devtools in a shadow root with keyed updates, longer history, filtering, schema hints, inline JSON errors, and copyable snippets.
- **Helpers and tooling:** add `useWebMCPTools()` for Vue, React, and Svelte; type Zod `examples` as raw input; return MCP `structuredContent`; split the release workflow by permission and pin actions; add coverage, link checks, bundle budgets, an all-entries package fixture, a lint configuration, and a fixtures lab mode.

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
