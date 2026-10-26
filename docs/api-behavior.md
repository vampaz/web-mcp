# API behavior and contracts

[Documentation index](./README.md) · [Complete signatures and types](./api-reference.md)

This guide explains runtime behavior. The generated reference lists all public exports and every declared option field. Import from the package root or a documented subpath; internal source files are not supported import paths.

## Choose the entry point

| Import                      | Main API                                                      | Additional peer                                    |
| --------------------------- | ------------------------------------------------------------- | -------------------------------------------------- |
| `@vampaz/webmcp-kit`        | Tools, registry, validation, resolvers, diagnostics           | None                                               |
| `/pi`                       | `createPiHarness`, `createPiRuntime`, `deletePiConversations` | None; Pi libraries are bundled                     |
| `/command-input`            | Command element and initializer                               | None                                               |
| `/hosted`                   | Hosted session resolver                                       | None                                               |
| `/chat`                     | `defineWebMCPChat`, `WebMCPChatElement`, `WebMCPChatOptions`  | None when supplied a controller                    |
| `/vue`, `/react`, `/svelte` | `useWebMCPTool`, `useWebMCPTools`                             | The selected framework                             |
| `/zod`                      | `defineZodTool`                                               | Zod 4                                              |
| `/devtools`                 | `mountDevtoolsOverlay`                                        | None                                               |
| `/testing`                  | Resolver evaluations and Playwright helpers                   | None; supply a resolver or compatible browser page |
| `/testing/playwright`       | Page bridge helpers without evaluation imports                | None; supply a compatible browser page             |
| `/mcp-bridge`               | `createLocalMCPBridge`                                        | None                                               |

The package is ESM-only. Importing core, `/pi`, or `/chat` is safe during SSR. Browser initialization and DOM registration belong in client lifecycle code. See the [dependency model](./getting-started.md#dependency-model) for exact peer package names and development-only tooling.

## Define and register tools

`defineTool()` validates the definition and preserves it. It does not register or execute the tool. Literal JSON Schema infers the input type through `InferToolInput`; an explicit generic can supply a type for a separately defined schema. Inference does not replace runtime validation.

| `WebMCPTool` field        | Contract                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `name`, `description`     | Required nonempty strings. Use stable names and descriptions that state the action and its limits.                       |
| `inputSchema`             | Required schema, checked at definition and before invocation. Prefer strict object schemas.                              |
| `outputSchema`            | Optional schema checked after execution. An invalid output does not roll back an action.                                 |
| `annotations`             | Browser/tooling hints such as `readOnlyHint`; hints are not authorization.                                               |
| `confirmation`            | Presence requires approval; user-facing `reason` and optional per-tool `handler`.                                        |
| `scope()`                 | Synchronous current-state availability. Throwing fails the invocation.                                                   |
| `parseInput(input)`       | Optional parser before approval; invalid input stops invocation.                                                         |
| `guard(input)`            | Input-specific check, optionally async. `false` or any string blocks execution. Return `true` to allow.                  |
| `execute(input, context)` | Returns output or a promise. `context.source` identifies the caller; `context.signal` supports cooperative cancellation. |
| `examples`                | Example raw inputs for documentation and resolvers; not executable tests.                                                |

`registerTool()` adds the tool to the shared fallback registry and attempts native registration when supported. The returned `RegisteredTool` contains `tool`, `mode`, `warnings`, `ready`, and `unregister()`. Await `ready` before asserting native registration has settled. Native failure preserves fallback registration and records a warning.

`registerTools(tools)` registers a set atomically: if one definition fails, the ones already registered are removed and the error is rethrown. It returns `{ registrations, unregister }`.

Re-registering an existing name throws; unregister it explicitly first. An old handle cannot unregister its replacement. Prefer unregistering on component or route teardown. A module that registers at top level must also unregister in `import.meta.hot?.dispose()`, or hot module replacement re-runs it against the existing name. `unregisterTool(name)` returns whether it found a registration. `getTool(name)` returns a registration or `undefined`; `listTools()` and `getRegistrySnapshot()` expose current registrations. Treat those definitions as application-owned objects, not detached serialized snapshots.

The reserved core names are `tool_sequence`, `needs_clarification`, and `no_tools_match`. Pi additionally rejects a catalog containing `pi_reply` or `pi_refresh_catalog`; the runtime owns those names.

## Invocation, approval, and results

`invokeTool({ id?, toolName, input, source?, signal? })` returns a `ToolInvocationResult`; it does not reject for invalid input. Default source is `fallback`. The normal path copies the input, validates it, checks availability, parses optional `parseInput`, asks for approval, checks the guard, executes, and validates output. Input must be plain JSON: plain objects, arrays, strings, finite numbers, booleans, and `null`. Other values, including `BigInt`, `Date`, `Map`, class instances, and cycles, return `invalid_input`; properties set to `undefined` are dropped. Changes to the caller's input during approval cannot change the copied invocation. Cancellation and stale registration/schema/scope checks run again after each asynchronous boundary.

`setConfirmationHandler(handler)` installs the application's global approval UI. A tool's own `confirmation.handler` takes precedence. Handlers receive `{ tool, input, reason, signal }`; the signal tells the UI to close a cancelled request. Only a result of exactly `true` approves; any other value denies the action. The returned disposer removes only this handler. Passing `undefined` clears all handlers. Without a handler, the browser uses `window.confirm()`; without a browser confirmation API, approval is denied.

There is no approval bypass on `invokeTool()`. Code that already approved an action inside the application should call the application's action function directly. The test bridge accepts only `id`, `toolName`, `input`, and `signal`, and always reports `source: 'fallback'`.

| `code`                | `status`      | Meaning and response                                                 |
| --------------------- | ------------- | -------------------------------------------------------------------- |
| `invalid_input`       | `error`       | Reject invalid input before approval or execution.                   |
| `cancelled`           | `error`       | Cancellation observed before execution.                              |
| `tool_changed`        | `unavailable` | Registration or schema changed; rediscover before a new request.     |
| `scope_unavailable`   | `unavailable` | Current application state does not permit this tool.                 |
| `scope_failed`        | `error`       | Scope callback threw; repair the application callback.               |
| `confirmation_denied` | `blocked`     | User denied the action. Do not retry automatically.                  |
| `confirmation_failed` | `error`       | Approval UI failed.                                                  |
| `guard_blocked`       | `blocked`     | Input-specific business rule rejected the action.                    |
| `guard_failed`        | `error`       | Guard callback threw.                                                |
| `execution_failed`    | `error`       | Execution threw; check application state before retrying.            |
| `invalid_output`      | `error`       | Output failed validation after execution; action may have completed. |
| `not_registered`      | `error`       | Tool no longer exists or the name is wrong.                          |
| `resolver_failed`     | `error`       | Command input only: the resolver failed before any tool ran.         |

Successful results contain `status: 'success'`, `toolName`, `output`, and `durationMs`. Native and registry invocations receive an `invocationId`. Missing `output` is valid. Native wrappers turn non-success results into errors for the browser API. The command input converts resolution outcomes into blocked/unavailable results without executing an application tool.

## Schemas, forms, and server actions

`validateJsonSchema(schema)` and `validateJsonValue(value, schema)` return error strings; an empty array means validation passed. `formatJsonValueValidationError()` formats those errors. The supported vocabulary includes types, properties, required fields, additional properties, `propertyNames`, `minProperties`/`maxProperties`, arrays with `items`/`prefixItems`/`uniqueItems`, enums/constants, `anyOf`/`oneOf`/`allOf`/`not`, inclusive and exclusive numeric bounds, `multipleOf`, length/count bounds, patterns, and the `email`, `date`, `time`, `date-time`, `uri`, `uuid`, `ipv4`, `ipv6`, and `hostname` formats. Other formats are annotations and produce a registration warning.

Definitions that use keywords the validator cannot enforce are rejected: `$ref`, `$defs`, `definitions`, `$dynamicRef`, `$anchor`, `if`/`then`/`else`, `patternProperties`, `dependentRequired`, `dependentSchemas`, `dependencies`, `contains`, `minContains`, `maxContains`, `unevaluatedProperties`, and `unevaluatedItems`. A failed length bound skips `pattern` and `format` checks, so `maxLength` also bounds regular-expression work. Error messages shorten long values.

`objectInputSchema`, `stringParam`, `numberParam`, `integerParam`, `booleanParam`, `arrayParam`, and `enumParam` construct schema objects. `objectInputSchema` defaults to `required: []` and `additionalProperties: false`. Other helpers add only the supplied constraints; array items are required as the first argument. `enumParam` requires at least one value and infers a shared primitive type when possible. The [reference](./api-reference.md) lists every option. These helpers do not replace runtime validation.

`inferFormInputSchema(form)` reads supported native form constraints. `registerFormTool(options)` registers a form-backed tool, fills fields, and checks native validity. Its default execution returns `FormData`; it does not automatically submit an HTTP request. Provide `execute(input, form)` to call the application's submit path. Unregistering restores the declarative attributes installed by the helper. For conversation tools, return a small JSON-safe result instead of `FormData`.

Only named, editable controls become inputs. Disabled controls, disabled fieldsets, read-only fields, hidden inputs, file inputs, and action buttons are excluded. Single checkboxes use booleans; checkbox groups and multiple selects use arrays. Radio groups use one string. Other repeated field names are unsupported. Optional dropdowns can select an enabled empty option. HTML patterns match the whole field. The helper rechecks the current form schema before filling; native validation still checks constraints outside the supported schema subset. The default `FormData` can include existing hidden values, so do not forward it to a model.

`defineServerTool(options)` creates a definition; call `registerTool()` or a framework helper to register it. It forwards every tool field, including `parseInput`, and infers input types from a literal schema like `defineTool()`. Its `endpoint`, optional `headers`, and optional `fetch` determine the request. Server tools POST `{ toolName, input, source }` as JSON. A successful response must contain JSON, or use status 204 for `undefined`. A non-2xx response fails the invocation. The browser forwards cancellation, but the server must independently authenticate, authorize, validate, and enforce idempotency where needed.

`defineZodTool({ schema, ...toolOptions })` derives JSON Schema from Zod and parses input with Zod before confirmation, guards, or execution. `examples` take raw input (`z.input`); `guard` and `execute` receive parsed output (`z.infer`). Unsupported Zod transformations/schema constructs can fail conversion; use schemas representable by the kit's JSON Schema subset. Keep Zod installed as an explicit peer.

## Setup and resolver factories

`await createResolver(config?)` selects `auto`, `local`, `chrome-built-in`, or a remote provider. Automatic mode alone may fall back to deterministic resolution. Explicit providers report failure. `/hosted` provides the separate hosted session adapter. See [resolver providers](./resolver-providers.md) for request contracts and configuration.

`ToolResolver.resolve(message, tools, context?, options?)` returns a `ToolResolution`. Options include cancellation, `singleStep`, `purpose: 'summary'`, and `maxRequestBytes`. Built-in resolvers enforce the byte limit on serialized requests; custom resolvers must implement that boundary too and preserve the summary-only contract.

Built-in remote, server-endpoint, and hosted resolvers throw `ResolverError` for HTTP failures. `code` is `context_overflow` when the provider says the input exceeded its context, otherwise `provider_failed`; `status` and a bounded provider message are included. A resolution that does not match the offered tools, and model text that is empty or is not JSON, throws `ToolResolutionValidationError`. Pi uses both types: overflow starts compaction, and an invalid resolution gets one correction round.

`initWebMCP()` from `/command-input` registers optional tools and configures a supplied or newly created command element. It returns registrations, element, optional supplied resolver, and `destroy()`. Duplicate names fail before mounting. Floating elements start closed; an element created by `initWebMCP()` shows a launcher unless `launcher: false`. `destroy()` clears the resolver and context it set on a host-supplied element. Hosts supply a resolver explicitly for hosted integration.

## Command input

Configure one resolver instance or a list of `resolverOptions`. Each option has a unique ID, label, factory, and optional model choices. The first is selected unless the host specifies an initial choice. User selections survive cosmetic reconfiguration.

Only presentation attributes are supported: `button-label`, `disabled`, `floating`, `label`, `launcher`, and `placeholder`. `disabled` and `floating` reflect their properties. Properties set before the element is defined are applied when it upgrades. Provider credentials and resolver settings belong in JavaScript factories. Errors and clarification appear in a visible status region with an error, success, or info tone. Changing resolver or model cancels active work; cosmetic configuration, and an equal new `resolverOptions` array, preserve it. Moving the element in the DOM does not cancel a command.

During a run the submit button becomes Stop and cancels the command; Escape cancels first and closes the floating panel on a second press. Closing the panel returns focus to the control that opened it. `label` sets the field's visible label and accessible name (default “Command”), and `labels` replaces any visible string (see `WebMCPCommandInputLabels`). `launcher: true` adds a button that toggles the floating panel. Style the element through `part` names (`form`, `input`, `run`, `feedback`, `panel`, `launcher`) and the custom properties below.

`run(message?, { signal }?)` resolves and executes a command and returns a result. Failed runs carry `code: 'cancelled'` or `code: 'resolver_failed'`. Events include resolution, result, error, resolver status, step progress, and floating-panel toggles; see the generated interfaces. A supplied resolver belongs to the host. Factory-created resolvers belong to the element and are disposed when replaced or disconnected.

### Command input styling

Set these properties on `webmcp-command-input`; its shadow styles use them across the panel, controls, settings, and feedback.

| Property                             | Default               | Purpose                                           |
| ------------------------------------ | --------------------- | ------------------------------------------------- |
| `--webmcp-ink`                       | `#141414`             | Text and primary button background.               |
| `--webmcp-muted`                     | `#5d5d58`             | Secondary text.                                   |
| `--webmcp-line`                      | `#d8d1c7`             | Borders and dividers.                             |
| `--webmcp-paper`                     | `#fffaf1`             | Panel and feedback surfaces; primary button text. |
| `--webmcp-field`                     | `#f7f3ec`             | Command field and select background.              |
| `--webmcp-accent`                    | `#2458ff`             | Focus rings and informational feedback.           |
| `--webmcp-accent-dark`               | `#141414`             | Primary button hover background.                  |
| `--webmcp-dark`                      | `#141414`             | Diagnostics surface and shadows.                  |
| `--webmcp-danger`                    | `#b42318`             | Error feedback.                                   |
| `--webmcp-success`                   | `#067647`             | Success feedback.                                 |
| `--webmcp-floating-panel-max-height` | `calc(100svh - 16px)` | Floating panel height limit.                      |

## Pi controller and custom hosts

`createPiHarness(options)` runs Pi in the page. Required options are `session` and `resolver`. Optional `context` supplies fresh state, `host` replaces the registry-backed tool host, `limits` sets budgets, and `onCancel` closes application-owned pending UI. A custom `host` owns context selection; the separate `context` option is used only by the default host.

`createPiRuntime({ session, resolver, host, limits? })` runs in the current browser context with an explicit tool host. Both factories require IndexedDB and Web Locks. The page harness additionally requires a secure context. Initialization can reject or return a controller whose snapshot contains a recoverable error; handle both paths.

| Controller method     | Contract                                                                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `getSnapshot()`       | Deeply frozen state, normalized messages, optional error, `activity` while a turn runs, and storage `usage`. The same object is shared by readers until the next change.                   |
| `subscribe(listener)` | Immediately calls the listener and returns an unsubscribe function. Changes within one task notify once with the latest snapshot.                                                          |
| `send(text)`          | One active operation at a time. Accepts nonempty text up to `limits.maxMessageChars` (default 16,000). Returns a `PiTurnOutcome`; a completed turn may be a clarification, not a mutation. |
| `stop()`              | Cancels work and waits for settlement. No rollback guarantee.                                                                                                                              |
| `clear()`             | Deletes this session's IndexedDB database under its lock. Rejects while a local turn is active. Does not undo application actions.                                                         |
| `refresh()`           | Reloads saved history. Other controllers for the same conversation call it automatically when a turn or clear finishes there.                                                              |
| `destroy()`           | Stops this controller, clears its subscriptions, and preserves history. Does not dispose the host's resolver.                                                                              |

`activity` is `{ kind: 'resolving' }`, `{ kind: 'compacting' }`, or `{ kind: 'tool', toolName, phase }`, where `phase` is `'approval'` while the application asks the user and `'running'` otherwise. Tool messages carry `input`, `status`, and `output`; `status: 'unknown'` means the turn stopped after the action reached the application, so its outcome must be checked.

`deletePiConversations({ namespace, ownerId })` deletes every stored conversation for one account, for example on sign-out; destroy that account's controllers first, because a conversation with an active operation is reported as `conversation_busy`. `listPiConversations()` returns the stored conversation IDs. Both need `indexedDB.databases()`.

See [Pi](./pi.md#persistence-and-limits) for exact budget defaults and bounds. Session fields must each be 1–200 printable characters with nonblank content. The runtime requires one explicit owner partition per account/anonymous session.

`PiToolHost.discover(signal)` returns `{ revision, tools }`. Discovery and context must answer within `limits.requestTimeoutMs`; invocation is not time-limited because it can wait for approval. Change the revision whenever tool identity, schema, availability, or relevant execution scope changes. `context(signal)` returns current safe state. `invoke({ name, input, revision }, signal, progress?)` must validate the revision and enforce the same input, authorization, scope, confirmation, and guard rules as the ordinary UI. It returns a real `ToolInvocationResult`. A custom host must never treat model output as a confirmation bypass. Call the optional `progress('approval')` and `progress('running')` to drive the snapshot's activity.

| Pi error code       | Interpretation                                                  |
| ------------------- | --------------------------------------------------------------- |
| `unsupported`       | Browser prerequisites are unavailable.                          |
| `configuration`     | Invalid session, limits, text, or resolver capability.          |
| `storage_failed`    | History could not be opened, committed, or cleared.             |
| `provider_failed`   | Resolving failed; no heuristic retry is performed.              |
| `stale_document`    | Document/catalog changed or a request was cancelled.            |
| `action_denied`     | Application confirmation denied the action.                     |
| `tool_failed`       | Action failed, was unavailable, or returned an invalid outcome. |
| `limit_reached`     | Tool, request, or history budget was reached.                   |
| `conversation_busy` | Another operation owns this controller or conversation lock.    |

`reason` narrows the remedy: `tool_calls`, `request_bytes`, `history_bytes`, `tool_result_bytes`, `storage_quota`, `context_overflow`, or `timeout`. `actionMayHaveRun: true` means an application action was invoked during the failed turn and its outcome was not recorded; check application state before retrying. `PiFailure` and `isPiError` are exported for custom hosts and resolvers.

## Chat UI

`defineWebMCPChat()` registers `<webmcp-chat>` once. `element.configure(options)` requires `controller` and accepts `mode`, `placement`, `theme`, `title`, `assistantLabel`, `placeholder`, `emptyState`, `suggestedPrompts`, `disabled`, `labels`, `locale`, `maxMessageLength`, and `renderMessage`. Supply the complete desired options on reconfiguration; omitted values return to defaults. Setting `element.controller` replaces only the controller.

Defaults: inline mode, light theme, “Assistant” title/assistant label, “Ask the assistant” placeholder, a 16,000-character message limit, and an empty-state invitation. Changing presentation with the same controller preserves history and the draft. Replacing the controller clears that view's draft and subscription; destroy the old controller yourself when its owner ends. `disabled` disables controls but does not cancel an active turn.

`open()`, `close()`, `toggle()`, `focusComposer()`, and `setDraft(text)` control the element; the popup methods do nothing in inline mode. The element dispatches `webmcp-chat-toggle` and `webmcp-chat-send`, which bubble and are composed. Use `controller.send()` for headless work. New chat immediately calls `controller.clear()` without confirmation. `renderMessage` receives untrusted text; sanitize anything inserted as HTML. See [chat behavior, keyboard controls, labels, parts, slots, and CSS properties](./chat.md).

## Framework lifecycle helpers

Each framework's `useWebMCPTool(tool, options?)` returns `unregister()` and `getRegistration()`. `useWebMCPTools(tools, options?)` registers a list atomically through `registerTools()` and returns `unregister()` and `getRegistrations()`. Use the helpers inside the owning component/effect scope. Helpers delegate to the core registry.

- Vue watches `when`, which can be a boolean, ref, or getter, and unregisters on scope disposal.
- React synchronizes registration in an effect and accepts a boolean `when` from render. Inline rerenders update committed callbacks without replacing registration; changed schemas or metadata replace it.
- Svelte registers in `onMount`; a readable-store `when` updates availability. Getter functions are not supported; with Svelte 5 runes, wrap state with `toStore(() => flag)` from `svelte/store`.

Use `scope()` for current business-state availability during invocation, even when `when` controls registration. See each framework guide for the separate chat lifecycle.

## Diagnostics, catalogs, devtools, and bridges

`isWebMCPSupported()` and `getSupportLabel()` report native registration capability; neither proves a tool is registered or a model is available. `getIntegrationHealthReport({ resolver? })` reports tool, schema, confirmation, scope, and resolver diagnostics. `assertWebMCPIntegration()` throws only for report status `error`; it returns warning reports for inspection.

`createToolCatalog(listTools(), options?)` creates a descriptive catalog; `formatToolCatalogMarkdown()` renders it. `formatOpenAITool()` and `formatOpenAITools()` convert definitions to OpenAI function-tool descriptions. These functions do not execute tools or authorize a model call. `getErrorMessage` formats errors.

`subscribeWebMCPKitEvents(listener)` receives registry events and returns an unsubscribe function. Event types are `registered`, `unregistered`, `invoked`, `confirmation-requested`, `confirmation-settled`, `succeeded`, `failed`, and `blocked`. Confirmation events carry `{ id, toolName, source, approved? }` with the invocation ID. Listeners receive deep copies of inputs and results, so redacting or changing them in place cannot change the invocation or the caller's result. Output that cannot be cloned, such as `FormData`, is left out of the event. `detail` can include inputs and results; redact before logging or forwarding it.

`mountDevtoolsOverlay({ container?, initiallyOpen?, placement?, position? })` mounts a developer tool catalog/invocation UI inside a shadow root. `position` picks a corner in logical terms (default `bottom-end`); `--wmk-devtools-accent` sets its accent colour. It keeps the last 50 invocations with time, source, and approval outcome, filters tools, shows required fields and types, reports JSON errors beside the input, and copies an `invokeTool()` snippet. The returned handle has `refresh()` and `destroy()`. Restrict developer tooling to environments where its actions are appropriate, for example:

```ts
if (import.meta.env.DEV) {
  const { mountDevtoolsOverlay } = await import('@vampaz/webmcp-kit/devtools')
  mountDevtoolsOverlay({ initiallyOpen: false })
}
```

`createLocalMCPBridge()` exposes `listTools()`, `callTool(name, input)`, and `handleRequest(request)`. The request handler accepts `tools/list` and `tools/call`, uses JSON-RPC-style results/errors, and routes calls through core approval with `source: 'mcp-bridge'`. `tools/list` returns only currently available tools, with `outputSchema` and `annotations` when defined; successful calls to tools with an output schema include `structuredContent`, which can be any JSON value the schema allows. The bridge reads the schema before the call, so a tool that unregisters itself still returns it. It is an in-process adapter, not a network MCP server, authentication system, or complete MCP transport implementation.

## Testing and evaluations

`installWebMCPKitTestBridge()` installs `window.__webMCPKit` and returns cleanup. Enable it only in deliberate test/development environments. `clearToolsForTest()` clears the shared registry and belongs in test teardown.

The Playwright helpers `getWebMCPRegistrySnapshot`, `listWebMCPTools`, `waitForWebMCPTool`, and `invokeWebMCPTool` require that bridge. Wait for registration before invoking. Browser-side `AbortSignal` objects cannot be transferred as ordinary Playwright arguments; create a cancellation scenario in the page when testing cancellation.

`runWebMCPResolverEvalCase` checks one resolution against expected tools, inputs, sequences, or outcomes. `runWebMCPResolverEvals` runs a list; `runWebMCPResolverEvalSuite` adds repetitions and a pass-rate threshold. Evaluations invoke the supplied resolver and can incur model usage, but do not execute application tools. See [evaluations](./evals.md) for complete cases and aggregation behavior.
