# Changelog

## Unreleased

### Core

- **Scope:** fail closed when `scope()` returns `undefined`, `null`, or an object without a boolean `available`. The invocation ends with `scope_failed` instead of running the tool; tools without `scope` stay available.
- **Fenced JSON:** parse fenced model JSON with linear slicing instead of a backtracking regex, so malformed output cannot stall the main thread. Well-formed input is unchanged.
- **Validation:** cap reported schema errors at 20 plus one "More errors omitted." entry, shorten long property names in messages, stop `uniqueItems` at the first duplicate, and reject sparse arrays instead of passing holes to the tool as `undefined`.
- **Diagnostics:** warn when a string property uses `pattern` without `maxLength`, when a form tool declares `confirmation` while native WebMCP is present, and when that form also uses `toolautosubmit`.
- **Approval input:** give confirmation handlers and guards their own copy of the parsed input so they cannot change what executes. Parser outputs that cloning would change semantically or cannot copy, such as class instances or null-prototype objects, keep their original reference and remain application-owned.
- **Approval metadata:** the test bridge, MCP bridge, and catalog adapter return detached schema copies. The MCP bridge also copies annotations; the test bridge and catalog expose confirmation as `{ reason }` only. Confirmation handlers receive optional `source`, `invocationId`, and `callerRequired`, and the `window.confirm()` fallback shows the tool name plus a bounded JSON argument summary. `callerRequired` is true when the caller added the requirement, such as Pi's untrusted-content rule; a source-scoped preference can use it to preserve the approval, and the handler still decides.
- **Per-invocation approval:** allow `requireConfirmation: { reason }` on `invokeTool()` and pipeline options. It can add approval to one invocation but never removes a tool's own confirmation.
- **Tool definitions:** `defineTool()` may omit `inputSchema` and defaults to a strict empty object. The resulting `WebMCPTool` still requires a schema, and hand-built `registerTool()` definitions must still declare one.
- **Errors and diagnostics:** add `WebMCPKitError` with `duplicate_tool`, `invalid_definition`, and `invalid_configuration` codes while preserving messages, plus `isWebMCPKitError()`, `isToolExecutionError()`, and `lintTool()`. `lintTool()` has stable rule IDs and adds missing-description and sensitive-name `readOnlyHint` rules; `RegisteredTool.warnings` stays a string list.
- **Duplicate copies:** warn once in development when another module instance of the kit marks the shared registry symbol, including copies bundled under one URL. Production builds write no marker and emit no warning.
- **Page bridge:** reject a second in-flight invocation that reuses a `requestId` with an error reply, and keep the first invocation cancellable.
- **MCP bridge:** return a JSON-RPC `-32600` error for a request that is not an object, and report output that JSON cannot serialize as `isError: true` instead of throwing.
- **Command input:** apply the untrusted-content approval rule across resolved sequences, so a later non-read-only step requires approval after an untrusted-content step. The requirement resets for each command.
- **Resolvers:** direct `user-key` and `none` requests follow no redirects and omit credentials on cross-origin calls. User-key mode rejects an effective `http:` destination unless the host is loopback, including relative and protocol-relative base URLs resolved against the page.
- **Resolvers:** redact `Bearer` tokens and `sk-` keys from provider error messages before shortening them.

### Pi

- **Untrusted content:** after a successful call to a tool with `untrustedContentHint`, every later non-read-only call in the same Pi turn requires approval with the reason "This action follows content from an untrusted source." `PiToolHost.invoke` accepts `requireApproval`, and the requirement resets each user turn.
- **Tool outcomes:** keep the stable tool outcome `code` on persisted Pi messages, including `confirmation_denied` after reopening, so chat and application code can distinguish denials from failures.

### Chat

- **Declined actions:** show a denied action as "Declined" with neutral styling and a "You declined this action. Nothing was changed." status before and after reload.
- **Provider failures:** map `provider_failed` to a retryable message and add a safe "Try again" action that resends the last user message once. It stays hidden after denials, unknown outcomes, actions that may have run, and any tool call that completed or failed, so a retry cannot repeat a write. When a completed action precedes the provider failure, the status asks the user to check application state instead of suggesting a retry.
- **Height:** default the inline panel to a stable block size at its previous minimum while preserving host `block-size` overrides.
- **Suggestions:** add `suggestionAction: 'draft' | 'send'`; the default remains `'draft'`.
- **Readability and touch:** raise small text to at least `.86em` and make icon, send, stop, and copy targets at least 44px under coarse pointers.
- **Tool rows:** add `toolLabel()` display names and `toolDetails: 'hidden'` for non-expanding rows without argument previews; screen-reader labels use the display name.
- **Unread replies:** show a launcher dot and an `openChatUnread(title)` accessible label when a reply arrives while the popup is closed; clear it when the popup opens.
- **Popup persistence:** add opt-in `persistKey` storage for open state, launcher position, and panel size only, ignoring malformed or blocked storage and never storing messages or drafts.
- **History warning:** show a neutral "This conversation is almost full. Start a new chat soon." status at 90% of the history limit, with errors taking priority.
- **Attributes:** accept `mode`, `theme`, `placement`, `heading`, and `placeholder` attributes as defaults below `configure()` options.
- **In-chat approval:** add `requestApproval()` with a state-machine-backed approval card. It opens a closed popup, focuses Deny, and resolves false on abort, disconnect, controller replacement, or replacement requests; the application still owns the confirmation handler.
- **Markdown:** add the `/chat/markdown` entry with a dependency-free `renderMarkdown()` that builds DOM and text only, limits links to `http:`, `https:`, and `mailto:`, and adds the required styles inside `.body[data-custom]`.
- **Lab approval:** scope the demo approval preference to `source === 'pi'` so page-bridge, native, devtools, resolver, and MCP-bridge calls still open the approval dialog.

### Assistant

- **New entry:** add `/assistant` with `mountAssistant()` and `createDialogApproval()`. `mountAssistant()` creates the Pi harness and chat element, resolves `ready` after mounting or a late teardown, rejects it after cleanup on initialization failure, and waits for pending initialization and a controller that finishes after `destroy()` before teardown settles. Repeated `destroy()` calls return the same promise, cleanup failure rejects it, and the borrowed resolver and application tools stay application-owned.
- **Dialog approval:** `createDialogApproval()` extracts the documented dialog flow with abort and replacement handling, a bounded input summary, and an unreadable-input fallback.

### Server

- **New entry:** add `/server` with `createResolverHandler(options): (request: Request) => Promise<Response>` for `createResolver({ auth: { mode: 'server' } })`. It validates the resolver wire format, bounds the body stream without trusting `Content-Length`, enforces the server-owned provider, model, key, and base URL policy, and requires an `authorize` hook that must return literal `true`.
- **Request handling:** forward cancellation, honor `singleStep` and `purpose: 'summary'`, validate upstream results with the existing resolution validator, and return `{ error }` with a non-2xx status without exposing the provider key or request body.

### Testing

- **Scripted resolver:** add `createScriptedResolver()` to `/testing` with ordered `match`, `times`, and `repeat` steps, fallback handling, configured errors, exhaustion failures, and abort-based cancellation.
- **Framework runtimes:** add real React StrictMode and Svelte mount tests that prove one registration remains across re-renders, in-flight calls survive, and unmount unregisters.
- **Mobile browser:** add the `mobile-chromium` Playwright project and `chat-mobile.spec.ts`, covering the touch bottom sheet, Enter adding a newline instead of sending, Send-button submission, and 44px New chat, Send, Stop, and Copy targets.

### Tooling

- **CDN bundle:** add the self-contained `dist/cdn/webmcp-kit.js` ES module with core, chat, Pi, and assistant bundled, no bare imports, and no extra chunks for script-tag use.
- **Coverage:** enforce whole-percent coverage floors (statements 90, branches 84, functions 93, lines 93) and run `npm run test:coverage` in the validation workflow.
- **Changelog checks:** add `scripts/check-changelog.ts` and wire it into `npm run check`. Release notes extract the exact version section from `CHANGELOG.md`, pass it with `--notes-file`, and fail on a missing or whitespace-only section.
- **Package job:** split the validation workflow into a minimal `package` job that builds, packs, and uploads `webmcp-kit-package`, and a validate job that downloads the built artifact and tests those bytes with `npm run test:package`.
- **Artifact lint:** run strict `publint` and `attw --profile esm-only` against the packed tarball in the package suite.
- **Dependabot:** give bundled `@earendil-works/*` dependencies their own update group and keep the general npm group separate. No cooldown override is configured because Dependabot applies its documented default to version updates.
- **CI traces:** upload `test-results/browser` when e2e fails, using the existing SHA-pinned upload action.
- **Repository hygiene:** remove stale `.astro` and `.wrangler` ignore entries after confirming the repository does not produce either directory.

### Documentation

- **Version notices:** replace stale hardcoded 0.5 and 0.6 version notices with pointers to the changelog and migration guides.
- **Page bridge:** document `/page-bridge`, `installPageBridge()`, the `webmcp-kit-bridge/v1` protocol, and its trust model; add it to the README entry table, contributor list, and project shape.
- **Upgrade guide:** add `docs/upgrading.md` covering consumer-visible changes from 0.5 through 0.9.
- **Roadmap:** refresh `docs/next-features.md` and mark `mountAssistant()`, the dialog approval helper, the `/server` helper, and the duplicate-copy warning as delivered.
- **First run:** add the TLS trust prompt, `vite-local-tls doctor`, model-free tabs, and fixtures command to `CONTRIBUTING.md`, and align install commands on `npm ci --ignore-scripts`.
- **API JSDoc:** add concise JSDoc to the most-used public functions across core, Pi, chat, command input, devtools, page bridge, testing, zod, and the React, Svelte, and Vue helpers.
- **New entries:** document `/assistant`, `/server`, `/chat/markdown`, the CDN script-tag example, and the packed `mountAssistant()` consumer as the reference example.

## 0.9.1 — 2026-11-16

- **Core:** tag every tool invocation outcome with the invocation id used to correlate it, including outcomes that occur before tool execution, and fail guarded tool calls closed when a guard does not approve.
- **Chat:** keep the working indicator driving transcript scrolling and operation-notice clearing.
- **Vue:** re-sync watched tool sets when tools change and un-register stale registrations when tools are renamed.
- **React:** fail guarded tool calls closed while preserving the guard method receiver.

## 0.9.0 — 2026-11-13

- **Page bridge:** add the `@vampaz/webmcp-kit/page-bridge` entry with `installPageBridge()`. It exposes the fallback registry over a versioned `window.postMessage` protocol (`webmcp-kit-bridge/v1`) so embedded agents such as browser extensions can discover tools and invoke them through the normal pipeline, including website confirmation handlers, when the browser has no native WebMCP. Registry changes announce themselves with a bumped catalog revision. Invocations report the `page-bridge` source. Replies are JSON: framework-reactive (Proxy) outputs are unwrapped before posting, and unserializable outputs produce an error reply. Any script in the page can message the bridge, which adds no trust beyond that script running in the page; sites opt in by calling `installPageBridge()`.
- **Chat:** refine the default look. User messages are bubbles, assistant replies are plain text with a Copy button, and role labels are visually hidden but still announced. Consecutive tool calls form one “Used N tools” block with status icons and argument previews. Stop replaces Send while a turn runs, and errors replace the send hint under the composer.
- **Chat:** move provider and model choice from the settings selects to a composer model picker (listbox with groups, details, badges and search). Settings open as a full view with a back button. `WebMCPChatSettings` providers accept `description`, `detail`, `badge` and `icon`; models accept `detail` and `badge`. `onChange` now reports the chosen model across providers.
- **Chat:** add the `identity` and `before-composer` slots, the `model-button` and `model-picker` parts, `openSettings()` and `openModelPicker()`, and the `--webmcp-chat-surface`, `--webmcp-chat-line-strong`, `--webmcp-chat-success`, `--webmcp-chat-warning` and `--webmcp-chat-mono` properties. The `conversationModel` and `provider` labels are unused.

## 0.8.5 — 2026-11-04

- **Chat:** give the settings selects a spaced custom chevron so the native arrow no longer sits against the border. Preserve dark theme, RTL, disabled and forced-colors behavior.

## 0.8.4 — 2026-11-04

- **Chat:** add the `composer-meta` slot for host content at the start of the row under the composer, beside the send hint. Existing slots and labels are unchanged.

## 0.8.3 — 2026-11-03

- **State management:** replace implicit lifecycle flags with explicit typed machines and enforced transition actions across Pi, command input, hosted and Chrome AI resolvers, chat, and popups. Public exports remain unchanged.
- **Pi:** preserve refresh cancellation and overlapping cached-page suspensions, deliver closed snapshots, and prevent stale work after shutdown. Distinguish received action results from durable outcomes when reporting interruption risks.
- **Chat and resolvers:** preserve pending requests across DOM moves, recover interrupted popup gestures, and ignore stale resolver and hosted-session completions.

## 0.8.2 — 2026-10-30

- **Pi:** base history compaction on the selected model's context and output limits instead of the request-byte threshold. Unknown capacity no longer triggers speculative summaries; actual overflow recovery and conversation history remain intact.
- **Resolvers:** expose model limits from documented OpenAI capacities, OpenRouter metadata, loaded LM Studio instances and Chrome AI sessions. Custom resolvers can report their own model limits.

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
