# Security

WebMCP tools turn app behavior into callable actions. Treat every tool input as untrusted, even when the request comes from a local resolver or browser API.

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

setConfirmationHandler(async function confirmTool(tool, input, reason, context) {
  return showConfirmationModal({
    title: `Run ${tool.name}?`,
    body: reason,
    preview: JSON.stringify(input, null, 2),
    signal: context?.signal
  })
})
```

WebMCP Kit enforces confirmation before execution in both fallback and native wrapper paths. If no handler is configured, browser runtimes fall back to `window.confirm()`.

`showConfirmationModal()` is application code: resolve its promise with the user's decision and close it when the signal aborts. The [complete dialog example](./examples/counter-assistant.ts) handles cancellation and replacement approvals. Native declarative form submissions do not use the imperative wrapper; enforce approval in the form's actual submission handler as well.

When a tool declares `outputSchema`, WebMCP Kit validates the returned value before reporting a successful invocation. Treat an `invalid_output` result as a tool implementation failure; do not pass that output to another tool or UI assertion.

The internal `confirmed: true` invocation flag is only for code paths that already performed approval inside the trusted app boundary. Public bridges and test helpers must not accept caller-provided confirmation bypasses; they should rely on `setConfirmationHandler()` or the browser confirmation fallback.

Approval does not freeze application state. The kit rechecks registration identity, schema, scope, and cancellation across asynchronous approval and guard boundaries. Server authorization must still use current state. Cancellation after an action starts does not guarantee rollback or prove that a failed response means the action failed.

Chained resolver output does not change this rule. A `tool_sequence` executes as individual tool invocations, so each mutating step still runs its own guard and confirmation check before execution. If the user rejects a confirmation or a guard blocks a step, the sequence stops and later steps do not run.

Resolver outcomes are non-executing. `needs_clarification` returns a blocked command result, and `no_tools_match` returns an unavailable result. They cannot include steps, and app tools cannot use `tool_sequence`, `needs_clarification`, or `no_tools_match` as names.

## Server-Backed Tools

Use `defineServerTool()` for actions that need app-owned secrets, private APIs, payments, email, or database writes. The browser-visible tool still validates input and enforces scope, confirmation, and guards before it posts to the endpoint.

Server endpoints must validate authorization and input again. Treat the browser request as untrusted even when WebMCP Kit already validated it client-side.

Invocation cancellation is passed to server-backed tools as an `AbortSignal`. Forward it through downstream fetches so a cancelled command does not continue unnecessary work.

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

The built-in command input omits scope-unavailable tools from the resolver request. Scope is checked again during invocation so a tool cannot execute after the relevant app state changes.

## Audit Hooks

Subscribe to WebMCP Kit events when you need local audit trails or analytics.

```ts
import { subscribeWebMCPKitEvents } from '@vampaz/webmcp-kit'

const unsubscribe = subscribeWebMCPKitEvents(function handleEvent(event) {
  console.log(event.type, event.toolName)
})

// Call during teardown:
unsubscribe()
```

Event payloads can include invocation details in `detail`, including tool inputs and outputs for invocation events. Treat event subscribers as trusted application code, and do not forward event details to analytics, logs, or third-party services without redaction.

## Conversation data and application identity

Pi stores conversation data in origin-local IndexedDB, partitioned by explicit namespace, owner, and conversation IDs. `ownerId` is not authentication or encryption. Use the current application identity, destroy old controllers on account changes, and apply a retention policy. Keep secrets and hidden server values out of context, inputs, results, history, and diagnostics. See [operations](./operations.md#csp-endpoints-and-application-security) for storage, CSP, and worker boundaries.

## Developer controls

A browser local-storage toggle for provider controls is a development convenience, not access control. The in-repository lab configures LM Studio through server-side environment variables; its visible Presentation selector only changes chat layout. In production, supply app-owned resolver configuration and enforce provider permissions on the server. Hiding a control does not authorize or protect the underlying endpoint.
