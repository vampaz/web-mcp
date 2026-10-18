# Integrate WebMCP Kit

[Documentation index](./README.md) · [Architecture](./architecture.md) · [API reference](./api-reference.md)

This walkthrough adds a persistent assistant to an existing HTTPS application. The application keeps its own actions, authentication, approval UI, and model endpoint. Use only core registration if you need callable tools without conversation history.

## 1. Choose the integration

| Need                                      | Install and initialize                           |
| ----------------------------------------- | ------------------------------------------------ |
| Expose existing app actions               | Core and `registerTool()` or a framework helper  |
| Execute short natural-language commands   | Core plus a planner and `<webmcp-command-input>` |
| Persistent conversations with your own UI | `/pi` and an application worker                  |
| Persistent conversations with supplied UI | The preceding setup plus `/chat`                 |
| Use chat with your own controller         | `/chat` and an implementation of `PiController`  |

Install `0.2.1` or newer. npm installs the Pi runtime libraries automatically:

```sh
npm install @vampaz/webmcp-kit@^0.2.1
```

For local package development, use the verified tarball described in [operations](./operations.md#validation-in-this-repository). Do not use a source alias as proof that the published package works. Keep the kit dependency deduplicated so the page's tool definitions, framework helpers, and harness use one registry.

The package's Node requirement for tooling is `>=24.12.0`; this repository pins its development baseline in `.nvmrc`. Browser execution requires the APIs listed in [operations](./operations.md#browser-prerequisites). Framework and Zod peers are needed only for those subpaths. The [dependency model](./getting-started.md#dependency-model) maps every feature to its peers and separates application runtime requirements from repository tooling.

## 2. Register the application's actions

Register the same narrow operations that the ordinary UI uses. Return current identifiers and concise JSON-safe results. Do not ask a model to manipulate internal DOM selectors when the application already has an action function.

```ts
import { defineTool, registerTool } from '@vampaz/webmcp-kit'

let counter = 0
const registration = registerTool(
  defineTool({
    name: 'read_counter',
    description: 'Read the current application counter.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    execute() {
      return { value: counter }
    }
  })
)

// During route/component teardown:
registration.unregister()
```

For a mutation, declare `confirmation`, validate all required input, and use `scope()` or `guard()` for application rules. Browser checks improve interaction; server authorization must still run on every server mutation. Use `defineServerTool()` when execution belongs on your server.

The complete [counter assistant example](./examples/counter-assistant.ts) registers read and confirmed-write actions, supplies fresh context, mounts chat, and handles teardown during asynchronous initialization. The package-consumer suite typechecks this example against the actual tarball. Copy it into your app as a starting point, then replace its in-memory counter with your application's action functions. Mount one instance because its tool names are fixed.

## 3. Compile the application worker

Create `worker.ts` in the application root:

```ts
import { installPiServiceWorker } from '@vampaz/webmcp-kit/pi/worker'

installPiServiceWorker()
```

Use the complete [Vite worker configuration and worker TypeScript project](./pi.md#embedded-website). Compile to `public/webmcp-pi/worker.js` before starting the site or producing the site artifact. The configuration bundles the worker's dependencies and reserves that directory for generated files. Keep the normal page Vite configuration and TLS plugin.

The page and worker must share an origin. Use a dedicated non-root scope ending in `/`, with the worker script below that scope. For an app hosted at `/nested/`, use `/nested/webmcp-pi/worker.js` and scope `/nested/webmcp-pi/`. In Vite page code, derive both from `import.meta.env.BASE_URL`. Never replace the root PWA worker to install the assistant.

During development, open the HTTPS URL advertised by the existing TLS plugin. When changing worker code, rebuild/watch the worker and reload the page. Page HMR does not update the worker runtime automatically.

## 4. Configure model access

This example uses an application-owned planner endpoint. It receives selected tool schemas, the request, and safe current context. Your backend chooses an approved model, keeps provider credentials, validates the request, and returns a `ToolPlan`.

```ts
import { createRemotePlanner } from '@vampaz/webmcp-kit'

const planner = createRemotePlanner({
  provider: 'openai',
  model: 'your-server-approved-model',
  auth: { mode: 'server', endpoint: '/api/webmcp/plan' }
})
```

Replace the example model identifier with one allowed by your server. [Planner providers](./planner-providers.md) describes the endpoint protocol and other providers. For Pi, the server must honor `singleStep: true` and the supplied response schema. It must return exactly one action, a clarification, an unavailable outcome, or the offered `pi_reply` tool. It must not precompute a sequence that depends on unknown results.

For browser AI, use `await createChromeAIPlanner(true)` and check availability before mounting the assistant. Trigger session/model setup from the required browser user interaction. For local development, the lab's same-origin HTTPS proxy keeps the model service and credentials out of browser configuration. A custom planner needs explicit conversational capability, cancellation, response validation, and serialized-request limits; see [API behavior](./api-behavior.md#setup-and-planner-factories).

## 5. Mount the interface and approval UI

Add application markup:

```html
<output id="counter">0</output>
<p id="assistant-status" role="status"></p>
<div id="assistant"></div>
<dialog id="approval" aria-labelledby="approval-title">
  <form method="dialog">
    <h2 id="approval-title">Approve application action</h2>
    <pre data-approval-text></pre>
    <button value="deny" autofocus>Deny</button>
    <button value="approve">Approve</button>
  </form>
</dialog>
```

Copy the [example module](./examples/counter-assistant.ts) into your client source. Run the following from browser mounting code, after the markup exists. The host supplies the current authenticated account ID; use a distinct explicit anonymous-session ID for a guest.

```ts
import { createDialogApproval, mountCounterAssistant } from './counter-assistant'

// `planner` comes from step 4; `signedInUserId` comes from your authenticated application.
const approval = createDialogApproval(document.querySelector<HTMLDialogElement>('#approval')!)
const assistant = mountCounterAssistant({
  container: document.querySelector<HTMLElement>('#assistant')!,
  workerScope: `${import.meta.env.BASE_URL}webmcp-pi/`,
  session: { namespace: 'my-app', ownerId: signedInUserId, conversationId: 'counter' },
  planner,
  approve: approval.confirm,
  onValue(value) {
    document.querySelector('#counter')!.textContent = String(value)
  }
})

try {
  await assistant.ready
} catch (error) {
  document.querySelector('#assistant-status')!.textContent =
    error instanceof Error ? error.message : 'The assistant could not start.'
}

// Call from the owning route/component's teardown and before account/provider replacement.
async function teardown() {
  approval.cancel()
  await assistant.destroy()
  planner.dispose?.()
}
```

The module uses popup mode. Set `mode: 'inline'` in its `element.configure()` call to render in your layout. The [chat guide](./chat.md) lists text options, CSS variables, resizing, keyboard behavior, and draft preservation. Approval is a separate application dialog; chat itself does not approve mutations.

The sample's `ready` promise rejects on initialization failure, and its `destroy()` closes a controller that finishes initialization after teardown. Wire teardown immediately in the framework lifecycle rather than waiting for initialization to finish. Do not destroy the controller merely because a popup closes. To support the back/forward cache in a custom document teardown handler, preserve the controller when `pagehide.persisted` is true; the harness already stops the active turn in that case.

## 6. Own account, route, and planner changes

Destroy the old controller and cancel approval UI before creating a replacement for another account, conversation partition, or planner. Unsubscribe old views and unregister route-owned tools. A supplied planner belongs to the host; the harness does not dispose it automatically.

Use a stable, application-specific namespace and an explicit conversation ID. `ownerId` partitions storage but does not authenticate the user. Never assign legacy anonymous history to the next signed-in account. Clear browser history according to your application's retention policy, including sign-out if required.

Pass only current, visible, necessary app state through `context()`. Tool inputs, results, and history can reach the configured model. Keep credentials, hidden server fields, other accounts' data, and unnecessary personal data out of these values.

Framework equivalents: [Vue](./vue.md#independent-conversation-ui), [React](./react.md#independent-conversation-ui), [Svelte](./svelte.md#independent-conversation-ui), and [Astro](./astro.md). The tool registration helpers and chat lifecycle are separate concerns.

## 7. Verify the consuming application

Test the installed artifact with the application's actual routes and authenticated actions:

1. Read application state through a registered tool and compare it with the visible UI.
2. Approve and deny a mutation. Confirm denial prevents execution and another model round.
3. Cancel during planning and during approval. Confirm the approval UI closes and no later action starts.
4. Reload after an interrupted turn. Confirm history restores and no action is replayed.
5. Switch accounts and confirm storage partitions and tool permissions change.
6. Open two tabs on the same conversation and verify writer contention is visible.
7. Test the deployed base path, compiled worker URL, existing PWA, and production CSP over HTTPS.
8. Exercise keyboard input, popup/inline mode, narrow screens, long output, and Clear chat.

Use a deterministic planner for repeatable integration tests. Run separately authorized model evaluations against the intended provider. Passing package tests proves packaging and supported fixtures; it does not prove your backend policy or deployed worker path. See [operations](./operations.md) for commands and troubleshooting.
