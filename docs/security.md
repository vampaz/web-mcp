# Security

WebMCP tools turn app behavior into callable actions. Treat every tool input as untrusted, even when the request comes from a local planner or browser API.

## Tool Design

- Use stable, specific tool names.
- Write descriptions that explain when the tool should be used.
- Use strict JSON Schema objects with `required` fields and `additionalProperties: false`.
- Keep tools narrow. Prefer `send_invoice` over `manage_invoice`.
- Do not expose secrets, tokens, passwords, or hidden fields as tool inputs.

## Confirmation

Require confirmation for actions that create, delete, send, pay, charge, export, publish, or otherwise mutate important state.

```ts
confirmation: {
  required: true,
  reason: 'Checkout clears the cart and represents a purchase action.'
}
```

Configure one app-level confirmation handler so tools can use your modal or approval UI instead of blocking browser prompts:

```ts
import { setConfirmationHandler } from '@vampaz/webmcp-kit'

setConfirmationHandler(async function confirmTool(tool, input, reason) {
  return showConfirmationModal({
    title: `Run ${tool.name}?`,
    body: reason,
    preview: JSON.stringify(input, null, 2)
  })
})
```

WebMCP Kit enforces confirmation before execution in both fallback and native wrapper paths. If no handler is configured, browser runtimes fall back to `window.confirm()`.

The internal `confirmed: true` invocation flag is only for code paths that already performed approval inside the trusted app boundary. Public bridges and test helpers must not accept caller-provided confirmation bypasses; they should rely on `setConfirmationHandler()` or the browser confirmation fallback.

Chained planner output does not change this rule. A `tool_sequence` executes as individual tool invocations, so each mutating step still runs its own guard and confirmation check before execution. If the user rejects a confirmation or a guard blocks a step, the sequence stops and later steps do not run.

Planner outcomes are non-executing. `needs_clarification` returns a blocked command result, and `no_tools_match` returns an unavailable result. They cannot include steps, and app tools cannot use `tool_sequence`, `needs_clarification`, or `no_tools_match` as names.

## Server-Backed Tools

Use `defineServerTool()` for actions that need app-owned secrets, private APIs, payments, email, or database writes. The browser-visible tool still validates input and enforces scope, confirmation, and guards before it posts to the endpoint.

Server endpoints must validate authorization and input again. Treat the browser request as untrusted even when WebMCP Kit already validated it client-side.

## Guards And Scope

Use guards for input-specific blocking:

```ts
guard(input) {
  return isKnownProduct(input.productId) || 'Product is not available.'
}
```

Use scope for app-state availability:

```ts
scope() {
  return {
    available: cartHasItems(),
    reason: 'Cart is empty.'
  }
}
```

## Audit Hooks

Subscribe to WebMCP Kit events when you need local audit trails or analytics.

```ts
import { subscribeWebMCPKitEvents } from '@vampaz/webmcp-kit'

const unsubscribe = subscribeWebMCPKitEvents(function handleEvent(event) {
  console.log(event.type, event.toolName)
})

unsubscribe()
```

Event payloads can include invocation details in `detail`, including tool inputs and outputs for invocation events. Treat event subscribers as trusted application code, and do not forward event details to analytics, logs, or third-party services without redaction.

## Demo Admin Toggle

The demo exposes planner provider/model controls when `localStorage.setItem('webmcp:admin', 'true')` is set. This is a **development-only convenience** and is trivially discoverable by any user with browser devtools access. Do not rely on this mechanism for production access control. In production, pass app-owned planner configuration to keep provider/model choices hidden from end users.
