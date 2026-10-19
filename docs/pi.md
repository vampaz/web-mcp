# Pi conversation harness

[Documentation index](./README.md) · [Complete integration](./integration.md) · [API reference](./api-reference.md)

`@vampaz/webmcp-kit/pi` provides a headless, persistent conversation controller. Core remains responsible for application validation, scope, guards, approval, and execution. Pi requests exactly one action, receives its actual result, refreshes context, and chooses the next step. The command input's bounded resolution remains a separate core surface with its own sequence contract.

`resolver` in this guide means the model-provider adapter you configure (type `ToolResolver`) and pass to `createPiHarness()` or `createPiRuntime()`. It is not a UI mode, and the kit ships no model endpoint of its own; configure your provider as described in [Where inference comes from](./resolver-providers.md#where-inference-comes-from).

Install `0.2.1` or newer. The kit declares its Pi runtime libraries as dependencies, so npm installs them automatically:

```sh
npm install @vampaz/webmcp-kit@^0.2.1
```

Core and chat with an application-supplied controller do not load the Pi runtime. Importing `/pi` does not start a worker, access storage, or contact a model. Public controller types do not contain Pi or Chord types.

## Embedded website

Create an application-owned worker wrapper and serve its compiled JavaScript below a dedicated same-origin scope. The following recipe targets Vite 8 applications, including Vue. It uses the application's existing Vite and TypeScript dependencies.

Create `worker.ts` in the application root:

```ts
import { installPiServiceWorker } from '@vampaz/webmcp-kit/pi/worker'

installPiServiceWorker()
```

Create `vite.worker.config.mjs` next to it:

```js
import { fileURLToPath } from 'node:url'

export default {
  publicDir: false,
  build: {
    outDir: 'public/webmcp-pi',
    emptyOutDir: true,
    lib: {
      entry: fileURLToPath(new URL('./worker.ts', import.meta.url)),
      formats: ['es'],
      fileName: function name() {
        return 'worker.js'
      }
    },
    rollupOptions: { output: { codeSplitting: false } }
  }
}
```

This bundles the worker and its runtime dependencies into one module. `publicDir: false` prevents the worker build from copying the application's public assets into its own output. Reserve `public/webmcp-pi/` for generated files; this build empties that directory. Add it to `.gitignore`.

Give the worker its own `tsconfig.worker.json`. Page code uses DOM types; the worker uses WebWorker types:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": false,
    "lib": ["ES2022", "WebWorker"],
    "types": []
  },
  "include": ["worker.ts"]
}
```

Exclude `worker.ts` from the page's TypeScript project if that project includes all root TypeScript files. Add these scripts to the application's `package.json`, preserving any existing page typecheck and build steps:

```json
{
  "scripts": {
    "typecheck:worker": "tsc --project tsconfig.worker.json",
    "build:worker": "vite build --config vite.worker.config.mjs",
    "watch:worker": "npm run build:worker -- --watch",
    "dev": "npm run build:worker && vite",
    "build": "npm run typecheck:worker && npm run build:worker && vite build"
  }
}
```

Run `npm run dev` for local development and open the HTTPS domain advertised by your TLS plugin. When changing worker code, also run `npm run watch:worker` in another terminal, then reload the page after compilation. The worker does not use page HMR. Production builds compile the worker first so Vite copies it from `public/` into the final site. Deploy both the page and generated worker assets over HTTPS.

Configure the page independently from the chat. Use Vite's base path for both the worker URL and scope, including deployments below paths such as `/nested/`:

The page registers the worker script under a protocol-versioned URL and checks for a newer script before it connects. A browser that still holds an older worker script therefore fetches the current one instead of pairing a stale worker with a newer page. Application changes to the worker bundle are picked up by the same check, so the script must be served with revalidation headers.

```ts
import { createRemoteResolver } from '@vampaz/webmcp-kit'
import { createPiHarness } from '@vampaz/webmcp-kit/pi'

const workerScope = `${import.meta.env.BASE_URL}webmcp-pi/`
const harness = await createPiHarness({
  session: { namespace: 'my-app', ownerId: 'anonymous-session', conversationId: 'support' },
  worker: { url: `${workerScope}worker.js`, scope: workerScope },
  resolver: createRemoteResolver({
    provider: 'openai-compatible',
    baseUrl: '/my-local-model-proxy/v1',
    model: appConfig.modelId,
    responseFormat: 'json_schema',
    maxTokens: 1024,
    temperature: 0.2,
    reasoningEffort: 'none',
    auth: { mode: 'none' }
  }),
  context: getSafeCurrentApplicationContext
})
```

The host defines `appConfig`, the proxy, and the context callback. For hosted inference, supply `createHostedOpenAIResolver()` instead. Provider credentials belong on the server. A custom `ToolResolver` must declare `capabilities: { conversation: true }`, honor `ResolverRunOptions.singleStep` and `maxRequestBytes`, and reject failures instead of returning a heuristic fallback. Check the UTF-8 size of the complete serialized request before dispatch, including prompts and schemas. Hosted endpoints receive a single-step schema and flag; they must honor that contract before production conversational use. Strict Chrome resolvers advertise this capability; deterministic resolvers do not.

Catch initialization errors in the host's mounting code and show them next to the assistant launcher. The [Vue](./vue.md#independent-conversation-ui), [React](./react.md#independent-conversation-ui), and [Svelte](./svelte.md#independent-conversation-ui) examples include this handling and cleanup. A missing worker usually means `build:worker` did not run or the deployed base path differs. Check that the worker URL returns JavaScript rather than the site's HTML fallback. The packaged consumer fixture uses this worker configuration under a nested base path.

The worker does not install a fetch handler, claim pages, or replace the application's root PWA worker. The page connects to the activated registration directly; the page need not be controlled by the dedicated scope. Worker replacement or failed communication interrupts the current turn. A new user turn checks the connection and reconnects deliberately if the idle worker terminated. An already dispatched turn is never retried.

## Controller and tool hosts

Both `createPiHarness()` and `createPiRuntime()` return `PiController`. The latter runs Pi in the current browser context and requires an explicit `PiToolHost`; it is useful for a future extension side panel. `createRegistryToolHost(context)` supplies the application's existing registry and shared invocation pipeline.

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

Application confirmation handlers can receive an optional fourth argument, `{ signal }`. Close pending approval UI when that signal aborts. The harness also accepts `onCancel` for host UI cleanup. Input validation precedes approval. Scope, registration identity, schema, cancellation, and guards are checked before execution. Cancellation after execution starts is cooperative. An interrupted channel can leave an unknown action outcome; check current application state before another request. Stop never promises rollback.

## Persistence and limits

History is stored in `webmcp-kit-pi-v1:` IndexedDB databases partitioned by the explicit namespace, owner, and conversation. The owner is a storage partition, not verified account identity. Each conversation uses one Web Lock across readers, writers, clear, tabs, and worker replacements. Contention reports `conversation_busy`; it never interrupts another tab's active work.

Commits reach IndexedDB before snapshots are published. Reopening aborts unfinished Pi tasks before allowing resolver or application requests. Completed dialogue and outcomes remain visible. The interrupted state survives reopening until a new user turn completes or the conversation is cleared. Recovery never replays previous actions.

Defaults and accepted bounds:

| `limits` field    | Default     | Bound        |
| ----------------- | ----------- | ------------ |
| `maxToolCalls`    | 12 per turn | 1–50         |
| `maxHistoryBytes` | 8 MiB       | 64 KiB–8 MiB |
| `maxRequestBytes` | 128 KiB     | 1 KiB–1 MiB  |

Built-in resolvers enforce `maxRequestBytes` on the serialized HTTP body, or the Chrome prompt and response constraint. This bounds data sent by the browser; server-added context and the model's internal session history are outside this limit. Custom resolvers must enforce the same boundary for their transport.

Each model request has a two-minute timeout. A turn can span multiple requests and wait for application approval without a total turn deadline. Worker health checks and Stop still interrupt a disconnected or cancelled turn.

Entering the browser's back/forward cache stops the active turn while preserving the controller for restoration. A new user request reconnects if necessary. Actual document disposal destroys the controller.

Automatic retry and compaction are disabled. Keep conversations short and use Clear chat when a budget is reached. The initial adapter replays a bounded commit log into Pi's reference store; it is not designed for unlimited histories. The adapter reports neither token streaming nor measured usage; Pi's required zero-valued usage fields are placeholders and must never be billed.

The host selects safe context and safe tool outputs. Context is requested afresh per round. After a successful action, Pi refreshes available tools before preparing its next round. A tool that opens an editor can therefore expose the editor's save action in the same turn. Catalog changes while a request or approval is pending still reject the stale action. Never include credentials or hidden server values. Browser storage can be evicted; `navigator.storage.persist()` is an optional host request and cannot guarantee retention.

The local demo has a new namespace. No legacy pathname-based history is migrated. See [later demo adoption](./demo-integration.md) before handling existing anonymous history.
