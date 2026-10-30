# Pi conversation harness

[Documentation index](./README.md) · [Complete integration](./integration.md) · [API reference](./api-reference.md)

`@vampaz/webmcp-kit/pi` provides a headless, persistent conversation controller. Core remains responsible for application validation, scope, guards, approval, and execution. Pi requests exactly one action, receives its actual result, refreshes context, and chooses the next step. The command input's bounded resolution remains a separate core surface with its own sequence contract.

`resolver` in this guide means the model-provider adapter you configure (type `ToolResolver`) and pass to `createPiHarness()` or `createPiRuntime()`. It is not a UI mode, and the kit ships no model endpoint of its own; configure your provider as described in [resolver providers](./resolver-providers.md#one-factory).

From 0.4.0, Pi's implementation libraries are bundled in the package. Core and chat with an application-supplied controller do not load Pi. Imports do not access storage or contact a model.

## Embedded website

Initialize after the browser page mounts:

```ts
import { createResolver } from '@vampaz/webmcp-kit'
import { createPiHarness } from '@vampaz/webmcp-kit/pi'

const resolver = await createResolver({
  provider: 'openai',
  model: 'your-server-approved-model',
  auth: { mode: 'server', endpoint: '/api/webmcp/resolve' }
})
const harness = await createPiHarness({
  session: { namespace: 'my-app', ownerId: 'anonymous-session', conversationId: 'support' },
  resolver,
  context() {
    return { page: 'support' }
  }
})
```

Register application tools and approval handling before accepting requests. Add `/chat` or subscribe from your own UI. Catch initialization errors and display them. If initialization finishes after unmount, destroy the late controller. The complete [example](./examples/counter-assistant.ts) handles these races.

Pi runs in the page. No Pi service worker, wrapper, worker configuration, watch process, or worker CSP exception is needed. Use HTTPS, IndexedDB, and Web Locks. An existing PWA remains independent.

The resolver must be available, declare `capabilities: { conversation: true }`, honor cancellation and serialized request limits, and return exactly one next action. Explicit providers never silently switch to heuristics. Server endpoints must honor `singleStep: true` and the offered response schema. See [providers](./resolver-providers.md).

## Controller and tool hosts

Both `createPiHarness()` and `createPiRuntime()` return `PiController`. Both run in the current browser context. The harness adds page lifecycle handling and a default registry host; the runtime requires an explicit `PiToolHost`. `createRegistryToolHost(context, { include })` optionally filters discovery and invocation; use it to keep a chat’s own controls out of its action catalog. Omit the options to include all available tools. It preserves each tool’s annotations and output schema. `createRegistryToolHost(context)` supplies the application's existing registry and shared invocation pipeline.

| Method                | Behavior                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------ |
| `getSnapshot()`       | Returns the current deeply frozen snapshot, shared by all readers until the next change.   |
| `subscribe(listener)` | Immediately supplies the current snapshot; returns an unsubscribe function.                |
| `send(text)`          | Admits one turn and resolves with `completed`, `interrupted`, or `error`.                  |
| `stop()`              | Cancels resolution and pending approvals; waits for cancellation.                          |
| `clear()`             | Deletes this conversation's database under its writer lock; rejects during an active turn. |
| `refresh()`           | Reloads saved history; runs automatically when another controller finishes a turn.         |
| `destroy()`           | Cancels work, closes local resources and subscriptions, and preserves history.             |

Snapshots contain user messages, assistant prose, and tool results. Tool messages carry the chosen `input`, the outcome `status`, and successful `output`; their `text` is the output or the error message. Tool-call-only assistant entries stay in the durable log and are omitted from the display snapshot. Failed assistant messages retain `failed: true` after reopening.

While a turn runs, `activity` says what it is doing: `resolving`, `compacting`, or `tool` with `phase: 'approval'` while the application asks the user and `phase: 'running'` otherwise. The registry host reports the approval phase from core confirmation events; a custom host calls the `progress` callback of `invoke()`. `usage` reports the durable log size against `maxHistoryBytes`, so a UI can warn before the limit.

Before Pi gives a call to the application, it records a durable marker. If the turn stops after that point, the tool message shows `status: 'unknown'`: the action may have run, so check application state. A call stopped before it reached the application shows “Not run”.

States are `loading`, `idle`, `running`, `stopping`, `interrupted`, `error`, and `closed`. Errors distinguish prerequisites/configuration, storage, provider, document/catalog changes, denial, tool failures, budgets, writer contention, and communication failures. `reason` narrows budgets and failures (`tool_calls`, `request_bytes`, `history_bytes`, `tool_result_bytes`, `storage_quota`, `context_overflow`, `timeout`), and `actionMayHaveRun` marks a failed turn whose invoked action has no recorded outcome. Storage errors wrapped by Pi's libraries keep their original code.

Call `destroy()` on framework teardown, navigation, sign-out, account switch, or provider change. On sign-out, destroy the account's controllers, then call `deletePiConversations({ namespace, ownerId })` to remove its stored history; `listPiConversations()` lists it first if needed. Create a new controller for the new partition/configuration. Removing the chat element only unsubscribes its view; the host owns controller destruction.

Application confirmation handlers can receive one object, `{ tool, input, reason, signal }`. Close pending approval UI when that signal aborts. The harness also accepts `onCancel` for host UI cleanup. Input validation precedes approval. Scope, registration identity, schema, cancellation, and guards are checked before execution. Cancellation after execution starts is cooperative. An interrupted page can leave an unknown action outcome; check current application state before another request. Stop never promises rollback.

## Persistence and limits

History is stored in `webmcp-kit-pi-v1:` IndexedDB databases partitioned by the explicit namespace, owner, and conversation. Opening a controller creates its database, so unavailable storage is reported at once. Where the browser can list databases, a reload never recreates a database that another controller cleared. The owner is a storage partition, not verified account identity. Each conversation uses one Web Lock across readers, writers, clear, tabs, and controller instances. Contention for a send, clear, or explicit refresh reports `conversation_busy`; it never interrupts another tab's active work. When a turn finishes, the controller announces the change on a `BroadcastChannel`, and idle controllers for the same conversation reload their history. Background reloads wait for the lock and keep their current view meanwhile. Stop and destroy cancel both queued reloads and active discovery. A clear announces the deletion instead; other controllers show an empty conversation without reopening, and so recreating, the deleted database. A controller opened while another tab was busy therefore recovers on its own; `refresh()` reloads explicitly, and a send or clear waits for a running reload instead of failing.

Commits reach IndexedDB before snapshots are published. Reopening aborts unfinished Pi tasks before allowing resolver or application requests. Completed dialogue and outcomes remain visible. The interrupted state survives reopening until a new user turn completes or the conversation is cleared. Recovery never replays previous actions.

Defaults and accepted bounds:

| `limits` field     | Default                                                    | Bound         |
| ------------------ | ---------------------------------------------------------- | ------------- |
| `maxToolCalls`     | 12 per turn                                                | 1–50          |
| `maxHistoryBytes`  | 8 MiB                                                      | 64 KiB–8 MiB  |
| `maxRequestBytes`  | Four bytes per model context token; 128 KiB if unknown     | 1 KiB–8 MiB   |
| `requestTimeoutMs` | 120,000                                                    | 1,000–600,000 |
| `contextTokens`    | Selected resolver's context window; unknown if unavailable | 0–2,000,000   |
| `maxMessageChars`  | 16,000                                                     | 1–100,000     |

Built-in resolvers enforce `maxRequestBytes` on the serialized HTTP body, or the Chrome prompt and response constraint. This bounds data sent by the browser; server-added context and the model's internal session history are outside this limit. Custom resolvers must enforce the same boundary for their transport.

Each model request, including a summary request, times out after `requestTimeoutMs`. A timeout aborts the resolver request and ends the turn with a provider failure, even if the resolver ignores cancellation. One compaction pass is bounded to four request timeouts in total. Tool discovery and context from the page are bounded by the same timeout; invocation is not, because it can wait for approval. A late answer cannot invoke an application action. A turn can span multiple requests and wait for application approval without a total turn deadline. Stop interrupts both action resolution and summarization.

Entering the browser's back/forward cache stops the active turn while preserving the controller for restoration. A new user request reconnects if necessary. Actual document disposal destroys the controller.

Automatic history compaction is enabled. Before the model context grows too large, Pi summarizes older entries through the configured resolver with `purpose: 'summary'`. The summarizer receives only the `pi_reply` tool, never application actions. Summary prompts omit action-selection instructions, and summary schemas and validation reject `needs_clarification` and `no_tools_match`. Custom resolvers and server endpoints must honor this purpose. Large transcripts are summarized in bounded parts. The current user request remains explicit after compaction, while recent results stay verbatim. Original user messages, completed assistant replies, and action results remain in storage and in the chat, including after reopening. A failed inference that recovers through overflow compaction remains in the durable log and is omitted from the chat.

Checkpoints are model-generated and can omit details. Current application state, input validation, guards, and approval remain authoritative.

During an active turn, `piCompletedActions` supplies exact tool names, inputs, and outcome statuses independently of the model-written checkpoint. Compaction cannot summarize away that record. The record belongs to the current turn; a later user request can explicitly ask for another action on the same target.

The resolver message places earlier turns in a labeled historical-reference JSON section before the current user request. Its `piPreviousActions` lists up to 20 earlier actions with their inputs and outcomes; long results are shortened. `piPreviousConversation` retains earlier dialogue and `piCheckpoint` carries the untrusted model-written summary. These fields stay outside current application context, so an old success does not appear to describe present state. This preserves the evidence needed to “continue” after a failed turn. Current-turn tool results remain parsed `result` objects in `piConversation`, without invocation IDs or timing.

If the resolver returns a resolution that does not match the offered tools, or model text that cannot be parsed as JSON, Pi asks once more with the validation error in `piCorrection`. The retry counts toward `maxToolCalls`; a second invalid answer ends the turn.

Pi detects repeated successful reads marked `annotations.readOnlyHint: true`. After two identical results for the same tool, arguments and catalog revision, it gives the model one correction before another identical call. Continued repetition stops with `limit_reached` and reason `no_progress`. A changed result or an intervening mutation resets progress tracking. Read tools may return `{ status: 'pending' }` while an asynchronous operation is still in progress; these remain pollable within the normal call limit. Prefer awaiting the existing save handler and rejecting on failure.

Compaction runs when needed before the next model request, without background inference. It requires `maxRequestBytes` of at least 8 KiB; smaller budgets keep direct resolution without automatic summarization. The final serialized request still enforces its byte limit independently of model capacity. An actual request-byte or provider-context overflow can trigger one compaction before retrying inference. Stop cancels summarization, and a failed summary ends the turn without replaying completed actions. A single oversized input, tool result, action record or catalog can still exceed the request budget. Compaction does not remove stored history or increase `maxHistoryBytes`.

Pi calls the selected resolver's optional `getModelLimits(signal)` before each user turn. The proactive trigger is the model's context window minus its output allowance, capped by `maxInputTokens` when reported. The byte budget does not lower this trigger. For example, GPT-6 Luna reports a 1,050,000-token context, a 922,000-token input limit and a 128,000-token output limit, so its trigger is 922,000 estimated input tokens. If the resolver does not report capacity, Pi does not invent a context window or proactively summarize; actual overflow recovery still works. `limits.contextTokens` can explicitly override the context window. Where an output limit is not reported, Pi reserves up to 2,048 tokens for a reply (at most one quarter of a small context).

The usage estimate is based on serialized resolver input (about four bytes per token), not the provider's tokenizer or billed usage. Tool definitions and current page context are included. Summarizing history does not shrink a large tool catalog. Original messages and outcomes remain visible after compaction. See [model capacity discovery](resolver-providers.md#model-capacity) for built-in and custom resolvers.

Choose a request budget that fits the configured model's context. The byte limit does not measure tokens or discover the model's context capacity. A recognized provider context overflow reduces the transcript chunk before trying again. Built-in resolvers report overflow as `ResolverError` with `code: 'context_overflow'`; custom resolvers can throw the same error so Pi compacts instead of failing. Rate limits and other provider failures end the turn.

General provider-failure retries remain disabled. The validation correction and overflow-compaction retries described above are bounded exceptions. The initial adapter replays a bounded commit log into Pi's reference store; it is not designed for unlimited stored histories. The adapter does not stream tokens. Its usage fields hold the estimated request size for compaction only and must never be billed.

The host selects safe context and safe tool outputs. Context is requested afresh per round. After a successful action, Pi refreshes available tools before preparing its next round. A tool that opens an editor can therefore expose the editor's save action in the same turn. If the catalog changes during model resolution or finishes mounting before the next model round, Pi discards the stale choice and resolves again through an internal refresh round. Internal refresh rounds count toward `maxToolCalls`. Catalog changes during approval still reject the stale action. Never include credentials or hidden server values. Browser storage can be evicted; `navigator.storage.persist()` is an optional host request and cannot guarantee retention.

Changing a namespace creates a separate history partition. Decide how to handle existing anonymous history before changing a namespace.
