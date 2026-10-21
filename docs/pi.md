# Pi conversation harness

[Documentation index](./README.md) · [Complete integration](./integration.md) · [API reference](./api-reference.md)

`@vampaz/webmcp-kit/pi` provides a headless, persistent conversation controller. Core remains responsible for application validation, scope, guards, approval, and execution. Pi requests exactly one action, receives its actual result, refreshes context, and chooses the next step. The command input's bounded resolution remains a separate core surface with its own sequence contract.

`resolver` in this guide means the model-provider adapter you configure (type `ToolResolver`) and pass to `createPiHarness()` or `createPiRuntime()`. It is not a UI mode, and the kit ships no model endpoint of its own; configure your provider as described in [Where inference comes from](./resolver-providers.md#where-inference-comes-from).

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

Both `createPiHarness()` and `createPiRuntime()` return `PiController`. Both run in the current browser context. The harness adds page lifecycle handling and a default registry host; the runtime requires an explicit `PiToolHost`. `createRegistryToolHost(context)` supplies the application's existing registry and shared invocation pipeline.

| Method                | Behavior                                                                       |
| --------------------- | ------------------------------------------------------------------------------ |
| `getSnapshot()`       | Returns a detached normalized snapshot.                                        |
| `subscribe(listener)` | Immediately supplies the current snapshot; returns an unsubscribe function.    |
| `send(text)`          | Admits one turn and resolves with `completed`, `interrupted`, or `error`.      |
| `stop()`              | Cancels resolution and pending approvals; waits for cancellation.              |
| `clear()`             | Clears this conversation under its writer lock; rejects during an active turn. |
| `destroy()`           | Cancels work, closes local resources and subscriptions, and preserves history. |

Snapshots contain user messages, assistant prose, and tool results. Tool-call-only assistant entries stay in the durable log and are omitted from the display snapshot. Failed assistant messages retain `failed: true` after reopening.

States are `loading`, `idle`, `running`, `stopping`, `interrupted`, `error`, and `closed`. Errors distinguish prerequisites/configuration, storage, provider, document/catalog changes, denial, tool failures, budgets, writer contention, and communication failures.

Call `destroy()` on framework teardown, navigation, sign-out, account switch, or provider change. Create a new controller for the new partition/configuration. Removing the chat element only unsubscribes its view; the host owns controller destruction.

Application confirmation handlers can receive one object, `{ tool, input, reason, signal }`. Close pending approval UI when that signal aborts. The harness also accepts `onCancel` for host UI cleanup. Input validation precedes approval. Scope, registration identity, schema, cancellation, and guards are checked before execution. Cancellation after execution starts is cooperative. An interrupted page can leave an unknown action outcome; check current application state before another request. Stop never promises rollback.

## Persistence and limits

History is stored in `webmcp-kit-pi-v1:` IndexedDB databases partitioned by the explicit namespace, owner, and conversation. The owner is a storage partition, not verified account identity. Each conversation uses one Web Lock across readers, writers, clear, tabs, and controller instances. Contention reports `conversation_busy`; it never interrupts another tab's active work.

Commits reach IndexedDB before snapshots are published. Reopening aborts unfinished Pi tasks before allowing resolver or application requests. Completed dialogue and outcomes remain visible. The interrupted state survives reopening until a new user turn completes or the conversation is cleared. Recovery never replays previous actions.

Defaults and accepted bounds:

| `limits` field    | Default     | Bound        |
| ----------------- | ----------- | ------------ |
| `maxToolCalls`    | 12 per turn | 1–50         |
| `maxHistoryBytes` | 8 MiB       | 64 KiB–8 MiB |
| `maxRequestBytes` | 128 KiB     | 1 KiB–1 MiB  |

Built-in resolvers enforce `maxRequestBytes` on the serialized HTTP body, or the Chrome prompt and response constraint. This bounds data sent by the browser; server-added context and the model's internal session history are outside this limit. Custom resolvers must enforce the same boundary for their transport.

Each model request has a two-minute timeout. A timeout aborts the resolver request and ends the turn with a provider failure, even if the resolver ignores cancellation. A late answer cannot invoke an application action. A turn can span multiple requests and wait for application approval without a total turn deadline. Worker health checks and Stop still interrupt a disconnected or cancelled turn.

Entering the browser's back/forward cache stops the active turn while preserving the controller for restoration. A new user request reconnects if necessary. Actual document disposal destroys the controller.

Automatic retry and compaction are disabled. Keep conversations short and use New chat when a budget is reached. The initial adapter replays a bounded commit log into Pi's reference store; it is not designed for unlimited histories. The adapter reports neither token streaming nor measured usage; Pi's required zero-valued usage fields are placeholders and must never be billed.

The host selects safe context and safe tool outputs. Context is requested afresh per round. After a successful action, Pi refreshes available tools before preparing its next round. A tool that opens an editor can therefore expose the editor's save action in the same turn. Catalog changes while a request or approval is pending still reject the stale action. Never include credentials or hidden server values. Browser storage can be evicted; `navigator.storage.persist()` is an optional host request and cannot guarantee retention.

The local demo has a new namespace. No legacy pathname-based history is migrated. See [later demo adoption](./demo-integration.md) before handling existing anonymous history.
