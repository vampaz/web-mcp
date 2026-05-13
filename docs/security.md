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

The fallback registry enforces confirmation before execution. Native browser behavior depends on the browser API, but the metadata is still part of the registered tool definition.

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
