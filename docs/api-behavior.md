# API behavior and contracts

[Documentation index](./README.md) · [Complete signatures and types](./api-reference.md)

This guide explains runtime behavior. The generated reference lists all public exports and every declared option field. Import from the package root or a documented subpath; internal source files are not supported import paths.

## Choose the entry point

| Import                      | Main API                                                          | Additional peer                                   |
| --------------------------- | ----------------------------------------------------------------- | ------------------------------------------------- |
| `@vampaz/webmcp-kit`        | Tools, registry, validation, planners, command input, diagnostics | None                                              |
| `/pi`                       | `createPiHarness`, `createPiRuntime`, `createRegistryToolHost`    | Pi Durable, Pi AI, Chord when running Pi          |
| `/pi/worker`                | `installPiServiceWorker`                                          | Pi Durable, Pi AI, Chord                          |
| `/chat`                     | `defineWebMCPChat`, `WebMCPChatElement`, `WebMCPChatOptions`      | None when supplied a controller                   |
| `/vue`, `/react`, `/svelte` | `useWebMCPTool` and framework-specific types                      | The selected framework                            |
| `/zod`                      | `defineZodTool`                                                   | Zod 4                                             |
| `/devtools`                 | `mountDevtoolsOverlay`                                            | None                                              |
| `/testing`                  | Planner evaluations and Playwright helpers                        | None; supply a planner or compatible browser page |
| `/testing/playwright`       | Page bridge helpers without evaluation imports                    | None; supply a compatible browser page            |
| `/mcp-bridge`               | `createLocalMCPBridge`                                            | None                                              |

The package is ESM-only. Importing core, `/pi`, or `/chat` is safe during SSR. Browser initialization, DOM registration, and worker installation belong in client lifecycle code. `/pi/worker` runs in a service-worker context. See the [dependency model](./getting-started.md#dependency-model) for exact peer package names and development-only tooling.

## Define and register tools

`defineTool()` validates the definition and preserves it. It does not register or execute the tool. Literal JSON Schema infers the input type through `InferToolInput`; an explicit generic can supply a type for a separately defined schema. Inference does not replace runtime validation.

| `WebMCPTool` field        | Contract                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `name`, `description`     | Required nonempty strings. Use stable names and descriptions that state the action and its limits.                       |
| `inputSchema`             | Required schema, checked at definition and before invocation. Prefer strict object schemas.                              |
| `outputSchema`            | Optional schema checked after execution. An invalid output does not roll back an action.                                 |
| `annotations`             | Browser/tooling hints such as `readOnlyHint`; hints are not authorization.                                               |
| `confirmation`            | `required`, user-facing `reason`, and optional per-tool `handler`.                                                       |
| `scope()`                 | Synchronous current-state availability. Throwing fails the invocation.                                                   |
| `guard(input)`            | Input-specific check, optionally async. `false` or any string blocks execution. Return `true` to allow.                  |
| `execute(input, context)` | Returns output or a promise. `context.source` identifies the caller; `context.signal` supports cooperative cancellation. |
| `examples`                | Example inputs for documentation and tooling; not executable tests.                                                      |

`registerTool()` adds the tool to the shared fallback registry and attempts native registration when supported. The returned `RegisteredTool` contains `tool`, `mode`, `warnings`, `ready`, and `unregister()`. Await `ready` before asserting native registration has settled. Native failure preserves fallback registration and records a warning.

Re-registering a name replaces the current registration. An old handle cannot unregister its replacement. Prefer unregistering on component or route teardown. `unregisterTool(name)` returns whether it found a registration. `getTool(name)` returns a registration or `undefined`; `listTools()` and `getRegistrySnapshot()` expose current registrations. Treat those definitions as application-owned objects, not detached serialized snapshots.

The reserved core names are `tool_sequence`, `needs_clarification`, and `no_tools_match`. Pi additionally rejects a catalog containing `pi_reply`. The runtime owns that reply tool.

## Invocation, approval, and results

`invokeTool({ toolName, input, source?, signal?, confirmed? })` returns a `ToolInvocationResult`. Default source is `fallback`. The normal path validates input, checks availability, asks for approval, checks the guard, executes, and validates output. Cancellation and stale registration/schema/scope checks run again across asynchronous approval and guard boundaries.

`setConfirmationHandler(handler)` installs the application's global approval UI. A tool's own `confirmation.handler` takes precedence. Handlers receive `(tool, input, reason, context?)`; when supplied, `context.signal` tells the UI to close a cancelled request. Passing `undefined` removes the global handler. Without a handler, the browser uses `window.confirm()`; without a browser confirmation API, approval is denied.

Never pass planner-provided `confirmed` values through to `invokeTool()`. `confirmed: true` is reserved for trusted application code that has already completed approval. The test bridge strips caller-provided bypasses, and the local MCP bridge does not expose one.

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

Successful results contain `status: 'success'`, `toolName`, `output`, and `durationMs`. Registry invocations also receive an `invocationId`. Missing `output` is valid. Native wrappers turn non-success results into errors for the browser API. The command input converts planning outcomes into blocked/unavailable results without executing an application tool.

## Schemas, forms, and server actions

`validateJsonSchema(schema)` and `validateJsonValue(value, schema)` return error strings; an empty array means validation passed. `formatJsonValueValidationError()` formats those errors. The supported vocabulary includes types, properties, required fields, additional properties, arrays/items, enums/constants, `anyOf`/`oneOf`, numeric bounds, length/count bounds, patterns, and known string formats. See [getting started](./getting-started.md) and the `JsonSchema` contract for details; this is not a general JSON Schema reference resolver.

`objectInputSchema`, `stringParam`, `numberParam`, `integerParam`, `booleanParam`, `arrayParam`, and `enumParam` construct schema objects. `objectInputSchema` defaults to `required: []` and `additionalProperties: false`. Other helpers add only the supplied constraints; array items are required as the first argument. `enumParam` requires at least one value and infers a shared primitive type when possible. The [reference](./api-reference.md) lists every option. These helpers do not replace runtime validation.

`inferFormInputSchema(form)` reads supported native form constraints. `registerFormTool(options)` registers a form-backed tool, fills fields, and checks native validity. Its default execution returns `FormData`; it does not automatically submit an HTTP request. Provide `execute(input, form)` to call the application's submit path. Unregistering restores the declarative attributes installed by the helper. For conversation tools, return a small JSON-safe result instead of `FormData`.

`defineServerTool(options)` creates a definition; call `registerTool()` or a framework helper to register it. Its `endpoint`, optional `headers`, and optional `fetch` determine the request. Server tools POST `{ toolName, input, source }` as JSON. A successful response must contain JSON, or use status 204 for `undefined`. A non-2xx response fails the invocation. The browser forwards cancellation, but the server must independently authenticate, authorize, validate, and enforce idempotency where needed.

`defineZodTool({ schema, ...toolOptions })` derives JSON Schema from Zod and parses input with Zod before execution. Unsupported Zod transformations/schema constructs can fail conversion; use schemas representable by the kit's JSON Schema subset. Keep Zod installed as an explicit peer.

## Setup and planner factories

| API                                       | Behavior                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `initWebMCP(options)`                     | Synchronously registers tools and configures an existing or created command element. An explicit `planner` takes precedence; otherwise, `accessKey` requires `model` and creates a hosted planner. Returns registrations, element, optional planner, and `destroy()`. Duplicate tool names are rejected by this convenience initializer. |
| `createWebMCPKit({ planner? })`           | Asynchronously resolves a planner and returns `{ planner, plannerConfig }`. It does not register tools or mount UI.                                                                                                                                                                                                                      |
| `createBestPlanner()`                     | Selects Chrome AI when available, otherwise a heuristic planner.                                                                                                                                                                                                                                                                         |
| `createChromeAIPlanner(strict = false)`   | Detects browser AI. Strict mode refuses heuristic fallback and advertises conversational capability when available. Session creation is deferred until planning. Cancellation reaches inference.                                                                                                                                         |
| `createHeuristicPlanner()`                | Deterministic local command planning; not a conversational planner.                                                                                                                                                                                                                                                                      |
| `createConfiguredPlanner(config?)`        | Dispatches `auto`, `local`, `chrome-built-in`, or remote provider configuration.                                                                                                                                                                                                                                                         |
| `createRemotePlanner(config)`             | Creates a remote/server planner. No inference request is made until `plan()`.                                                                                                                                                                                                                                                            |
| `createHostedOpenAIPlanner(options)`      | Uses hosted session and planning endpoints; requires the host's supported access/session setup.                                                                                                                                                                                                                                          |
| `createHostedOpenAIPlannerOption(config)` | Wraps hosted planning as a command-input option with model choices.                                                                                                                                                                                                                                                                      |

`PlannerProviderConfig` selects `provider`, optional `model` and `baseUrl`, and `auth`. Server auth sends requests to an application endpoint. User-key mode exposes the key to the browser and is restricted in production unless explicitly allowed. Browser-local storage of a user key is not a place for application secrets.

OpenAI-compatible configuration supports `responseFormat` (`json_object` by default or `json_schema`), `maxTokens` (1–65,536), `temperature` (0–2; default 0), and optional `reasoningEffort`. These provider-specific settings apply to direct OpenAI-compatible requests; a server endpoint owns its own model policy. Truncated output with finish reason `length` fails planning.

`ToolPlanner.plan(message, tools, context?, options?)` returns a `ToolPlan`. `options` supports `signal`, `singleStep`, and `maxRequestBytes`. `singleStep` forbids `steps` and `tool_sequence`. Built-in HTTP planners enforce the byte budget on the complete serialized body. Chrome checks the prompt and response constraint; server-added content and the browser model's retained session history are outside that limit. Custom planners must enforce their transport budget themselves.

`validateToolPlan(plan, tools, { singleStep?, messageStyle? })` throws for invalid output, unknown tools, invalid tool inputs, and invalid sequences. It does not execute a plan. Ordinary sequences contain 1–5 steps. `plannerOutcomeToolNames`, `isPlannerOutcomeToolName`, and `toolPlanSchema` expose the non-executing outcome names and ordinary plan schema. `normalizeJsonText()` normalizes supported JSON text wrappers; it does not validate or authorize a plan.

A custom conversational planner must be available, declare `capabilities: { conversation: true }`, honor cancellation and request limits, validate its response, and report provider failures. Do not advertise conversation support for a heuristic or silent fallback. The host must call a planner's optional `dispose()` when it no longer owns that planner.

## Command input

`defineWebMCPCommandInput()` registers `<webmcp-command-input>`. `configure()` accepts the full `WebMCPCommandInputConfigureOptions` contract. Use properties for objects/functions; use attributes for supported primitive configuration. The element exposes `run(message?, { signal? })`, `openPanel()`, `closePanel()`, `togglePanel()`, and `panelOpen`.

App-supplied `planner`, `provider`, or `model` fixes those choices. `plannerOptions` and `endpointOptions` provide developer choices; `initialPlannerOptionId`, `initialProvider`, and `initialModel` choose defaults without fixing them. `showChromeAI` controls whether browser AI appears. `context` supplies current, deliberately selected app state. `floating` controls the command panel, independently of the separate chat component.

| Custom event                  | `detail`                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------- |
| `webmcp-command-plan`         | `message`, validated `plan`, `planner`                                          |
| `webmcp-command-planner`      | Active `planner`                                                                |
| `webmcp-command-step`         | `message`, `phase`, `plan`, `step`, `stepIndex`, `stepCount`, optional `result` |
| `webmcp-command-result`       | `message`, `plan`, `result`                                                     |
| `webmcp-command-error`        | `message`, error text                                                           |
| `webmcp-command-panel-toggle` | `open`                                                                          |

Events bubble and cross the shadow boundary. `run()` can return `undefined` when no command executes; inspect events/results rather than assuming a resolved promise means success. See the [README command-input examples](../README.md#ready-made-command-input) for provider controls and CSS properties.

## Pi controller and custom hosts

`createPiHarness(options)` connects the page to an application-compiled worker. Required options are `session`, `worker: { url, scope }`, and `planner`. Optional `context` supplies fresh state, `host` replaces the registry-backed tool host, `limits` sets budgets, and `onCancel` closes application-owned pending UI. A custom `host` owns context selection; the separate `context` option is used only by the default host.

`createPiRuntime({ session, planner, host, limits? })` runs in the current browser context without the worker connection. Both factories require IndexedDB and Web Locks. The page harness additionally requires a secure context and service-worker support. Initialization can reject or return a controller whose snapshot contains a recoverable error; handle both paths.

| Controller method     | Contract                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getSnapshot()`       | Detached state, normalized messages, optional error. No mutable runtime handles.                                                                                          |
| `subscribe(listener)` | Immediately calls the listener and returns an unsubscribe function.                                                                                                       |
| `send(text)`          | One active operation at a time. Accepts nonempty text up to 16,000 characters. Returns a `PiTurnOutcome`; a completed turn may be a clarification rather than a mutation. |
| `stop()`              | Cancels work and waits for settlement. No rollback guarantee.                                                                                                             |
| `clear()`             | Clears this session's persisted history under its lock. Rejects while a local turn is active. Does not undo application actions.                                          |
| `destroy()`           | Stops this controller, clears its subscriptions, and preserves history. Does not unregister the shared worker or dispose the host's planner.                              |

See [Pi](./pi.md#persistence-and-limits) for exact budget defaults and bounds. Session fields must each be 1–200 printable characters with nonblank content. The runtime requires one explicit owner partition per account/anonymous session.

`PiToolHost.discover(signal)` returns `{ revision, tools }`. Change the revision whenever tool identity, schema, availability, or relevant execution scope changes. `context(signal)` returns current safe state. `invoke({ name, input, revision }, signal)` must validate the revision and enforce the same input, authorization, scope, confirmation, and guard rules as the ordinary UI. It returns a real `ToolInvocationResult`. A custom host must never treat model output as a confirmation bypass.

| Pi error code       | Interpretation                                                       |
| ------------------- | -------------------------------------------------------------------- |
| `unsupported`       | Browser prerequisites or worker activation are unavailable.          |
| `configuration`     | Invalid session, limits, worker layout, text, or planner capability. |
| `storage_failed`    | History could not be opened, committed, or cleared.                  |
| `provider_failed`   | Planning failed; no heuristic retry is performed.                    |
| `stale_document`    | Document/catalog changed or a request was cancelled.                 |
| `action_denied`     | Application confirmation denied the action.                          |
| `tool_failed`       | Action failed, was unavailable, or returned an invalid outcome.      |
| `limit_reached`     | Tool, request, or history budget was reached.                        |
| `conversation_busy` | Another operation owns this controller or conversation lock.         |
| `transport_failed`  | Worker communication failed; action outcome can be unknown.          |

`installPiServiceWorker(scope = self)` installs lifecycle/message listeners and returns a listener cleanup function. Compile the wrapper into its dedicated scope. Do not call this function in the page.

## Chat UI

`defineWebMCPChat()` registers `<webmcp-chat>` once. `element.configure(options)` requires `harness` and accepts `mode`, `title`, `assistantLabel`, `placeholder`, `emptyState`, `suggestedPrompts`, and `disabled`. Supply the complete desired options on reconfiguration; omitted values return to defaults.

Defaults: inline mode, “Assistant” title/assistant label, “Ask the assistant” placeholder, and an empty-state invitation. Changing presentation with the same harness preserves history and the draft. Replacing the harness clears that view's draft and subscription; destroy the old controller yourself when its owner ends. `disabled` disables controls but does not cancel an active turn.

The component has no public imperative send or open-popup method. Use `harness.send()` for headless work and the visible launcher for popup interaction. Subscribe to the controller for state changes. Chat does not emit the command-input event family. See [chat behavior, keyboard controls, and all CSS properties](./chat.md).

## Framework lifecycle helpers

Each framework's `useWebMCPTool(tool, options?)` returns `unregister()` and `getRegistration()`. Use the helper inside the owning component/effect scope. Helpers delegate to the core registry.

- Vue watches `when`, which can be a boolean, ref, or getter, and unregisters on scope disposal.
- React synchronizes registration in an effect and accepts a boolean `when` from render. Stabilize a tool definition when appropriate so renders do not repeatedly replace it.
- Svelte registers in `onMount`; a readable-store `when` updates availability. A plain getter is evaluated on mount, not tracked as a reactive store.

Use `scope()` for current business-state availability during invocation, even when `when` controls registration. See each framework guide for the separate chat lifecycle.

## Diagnostics, catalogs, devtools, and bridges

`isWebMCPSupported()` and `getSupportLabel()` report native registration capability; neither proves a tool is registered or a model is available. `getIntegrationHealthReport({ planner? })` reports tool, schema, confirmation, scope, and planner diagnostics. `assertWebMCPIntegration()` throws only for report status `error`; it returns warning reports for inspection.

`createToolCatalog(listTools(), options?)` creates a descriptive catalog; `formatToolCatalogMarkdown()` renders it. `formatOpenAITool()` and `formatOpenAITools()` convert definitions to OpenAI function-tool descriptions. These functions do not execute tools or authorize a model call. `escapeHtml`, `escapeAttribute`, and `getErrorMessage` are small formatting helpers, not general sanitizers or security boundaries.

`subscribeWebMCPKitEvents(listener)` receives registry events and returns an unsubscribe function. Event types are `registered`, `unregistered`, `invoked`, `succeeded`, `failed`, and `blocked`. `detail` can include inputs and results; redact before logging or forwarding it. `emitWebMCPKitEvent()` publishes an application event to those listeners and does not execute an action.

`mountDevtoolsOverlay({ container?, initiallyOpen?, placement? })` mounts a developer tool catalog/invocation UI. The returned handle has `refresh()` and `destroy()`. Restrict developer tooling to environments where its actions are appropriate.

`createLocalMCPBridge()` exposes `listTools()`, `callTool(name, input)`, and `handleRequest(request)`. The request handler accepts `tools/list` and `tools/call`, uses JSON-RPC-style results/errors, and routes calls through core approval. It is an in-process adapter, not a network MCP server, authentication system, or complete MCP transport implementation.

## Testing and evaluations

`installWebMCPKitTestBridge()` installs `window.__webMCPKit` and returns cleanup. Enable it only in deliberate test/development environments. `clearToolsForTest()` clears the shared registry and belongs in test teardown.

The Playwright helpers `getWebMCPRegistrySnapshot`, `listWebMCPTools`, `waitForWebMCPTool`, and `invokeWebMCPTool` require that bridge. Wait for registration before invoking. Browser-side `AbortSignal` objects cannot be transferred as ordinary Playwright arguments; create a cancellation scenario in the page when testing cancellation.

`runWebMCPPlannerEvalCase` checks one plan against expected tools, inputs, sequences, or outcomes. `runWebMCPPlannerEvals` runs a list; `runWebMCPPlannerEvalSuite` adds repetitions and a pass-rate threshold. Evaluations invoke the supplied planner and can incur model usage, but do not execute application tools. See [evaluations](./evals.md) for complete cases and aggregation behavior.
