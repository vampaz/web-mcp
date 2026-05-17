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
import { setConfirmationHandler } from '@webmcp-kit/core'

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
import { subscribeWebMCPKitEvents } from '@webmcp-kit/core'

const unsubscribe = subscribeWebMCPKitEvents(function handleEvent(event) {
  console.log(event.type, event.toolName)
})

unsubscribe()
```

Event payloads can include invocation details in `detail`, including tool inputs and outputs for invocation events. Treat event subscribers as trusted application code, and do not forward event details to analytics, logs, or third-party services without redaction.
