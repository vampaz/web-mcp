# Upgrade to 0.4.0

This is a breaking release. No compatibility aliases are included. Install `@vampaz/webmcp-kit@0.4.0` and apply the changes below.

## Imports and resolver setup

| Previous API                                | New API                                                     |
| ------------------------------------------- | ----------------------------------------------------------- |
| Root command-input exports and `initWebMCP` | `@vampaz/webmcp-kit/command-input`                          |
| Root hosted resolver exports                | `@vampaz/webmcp-kit/hosted`                                 |
| Root test bridge and `clearToolsForTest`    | `@vampaz/webmcp-kit/testing`                                |
| `createConfiguredResolver(config)`          | `await createResolver(config)`                              |
| `createRemoteResolver(config)`              | `await createResolver(config)`                              |
| `createBestResolver()`                      | `await createResolver()`                                    |
| `createChromeAIResolver(true)`              | `await createResolver({ provider: 'chrome-built-in' })`     |
| `createHeuristicResolver()`                 | `await createResolver({ provider: 'local' })`               |
| `createWebMCPKit({ resolver: config })`     | `await createResolver(config)` returns the adapter directly |

`normalizeJsonText` and resolution validation remain public for custom resolver and server implementations. HTML escaping and event emission internals are no longer public. `AnyWebMCPTool` and unused framework aliases are removed; use `WebMCPTool` and the helper result types.

## Pi runs in the page

Remove `worker` from `createPiHarness()` options, the `/pi/worker` import, the Pi worker wrapper, worker-only TypeScript/Vite configs, and their build/watch scripts. Keep unrelated PWA or model inference workers.

The controller still requires a session partition and conversational resolver. Existing `webmcp-kit-pi-v1:` IndexedDB names and stored history remain unchanged. Reloading restores history and never resumes unfinished actions. Page navigation stops work; back/forward cache restoration accepts only a new user turn. There is no background execution after the page closes.

An old Pi service worker can remain registered in a browser that used 0.3.x, but 0.4.0 does not connect to it. If the host removes old registrations, match only its own former Pi scope. Never unregister all origin service workers.

## Approval and input

Presence of `confirmation: { reason }` requires approval. Remove `required: true`.

```ts
import { setConfirmationHandler } from '@vampaz/webmcp-kit'

const disposeApproval = setConfirmationHandler(function approve({ tool, input, reason, signal }) {
  return showApprovalDialog({ tool, input, reason, signal })
})
// During host teardown:
disposeApproval()
```

The example's `showApprovalDialog` is application code. It must resolve false and close when the signal aborts. A handler disposer removes only its own registration, even when hosts are destroyed out of order.

Zod parsing, refinements, defaults, and supported transforms now run before approval and guards. Confirmation sees the parsed value that execution receives. Zod JSON Schema conversion uses input mode. Standard `z.object()` can strip unknown properties; use `z.strictObject()` when extra keys must be rejected.

Readonly JSON Schemas and schema builders retain literal types. An executor annotation that contradicts the schema is now a type error. Keep explicit input generics for a dynamically constructed schema whose type is known by the application.

## Command input

Configure either a supplied `resolver` or `resolverOptions`. Remove `resolverConfig`, `endpointOptions`, provider/auth/model configuration properties, and credential attributes. Each resolver option owns its factory and optional model list. `initialResolverOptionId` and `initialModel` choose initial values; the user's later selection is retained.

Without a supplied resolver, automatic Chrome/local resolution remains available. For guaranteed offline deterministic behavior, supply `await createResolver({ provider: 'local' })`. `initWebMCP()` no longer creates a hosted resolver from a key.

Cosmetic updates preserve active work. Changing the selected resolver/model cancels the active command. Errors and clarification requests appear in the status text. Floating panels start closed; connect your application's launcher to `openPanel()` or `togglePanel()`.

## Registration and frameworks

Duplicate names now throw in direct, form, and initializer registration. Explicitly unregister the old tool before replacing it. A stale unregister handle cannot remove a later registration.

React keeps inline definitions stable across committed rerenders and updates their callbacks. Changes to metadata, schema, or availability replace registration. Vue component tools register on mount and remain absent during SSR. Svelte accepts a boolean or readable store for `when`; replace getter functions with a readable store to observe changes.

## Package and consumer checks

Pi libraries are bundled into the distribution with third-party notices. Consumers need no direct Pi/Chord dependencies. Framework/Zod peers remain optional. Public declarations use `.js` import specifiers for NodeNext; all runtime entry points remain ESM. There is no `prepare` build on installation.

Before a consumer release, verify its installed tarball, framework lifecycle, approval/denial, cancellation, reload without replay, shared registry, and deployed HTTPS policy. The local MCP bridge stays available; external transport, `initialize`, and `ping` support remain backlog work.
