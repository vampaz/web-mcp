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

## Publishable WebMCP Access Keys

Any key used directly from the browser is visible in network calls, browser devtools, extensions, and copied frontend bundles. Treat WebMCP browser keys as publishable project identifiers, not secrets. They must be low-privilege, scoped to allowed services and origins, and revocable without touching the app bundle.

Security for WebMCP-hosted paid services comes from server-side controls: key hashing/fingerprints, project and service scope, allowed origins, rate limits, quotas, spend caps, model allowlists, revocation, last-used tracking, and audit events. Do not put provider API keys, signing secrets, account admin tokens, or unrestricted service credentials in browser config.

The OSS kit must continue to work without a WebMCP access key. A missing, invalid, expired, copied, or quota-exhausted publishable key should block only the WebMCP-hosted paid service that needs it, such as hosted OpenAI planning or hosted analytics.

Do not treat `Origin` as a cryptographic proof. Browsers set it for normal cross-origin requests, which is useful for reducing casual copied-key abuse, but non-browser callers can spoof it. Pair origin checks with quotas, per-IP and per-origin throttles, model allowlists, revocation, anomaly detection, and spend caps.

Publishable key lifecycle:

- Show raw keys once at creation, then display only their fingerprint.
- Store hashes or HMAC hashes server-side; never store raw browser keys as operational records.
- Scope keys to customer, project, service, allowed origins, and `test` or `live` environment.
- Keep test and live keys separate.
- Rotate by issuing a new key, updating the app config, and revoking the old key.
- Support immediate revocation, expiry, last-used tracking, and audit events.
- Enforce quotas, spend caps, model allowlists, rate limits, and origin checks before calling paid providers.

For stronger abuse resistance, a WebMCP-hosted service can exchange a valid publishable key for a short-lived service session token. The exchange still happens on WebMCP servers after validating the key, origin, rate limits, and optional abuse checks such as captcha or site verification. Session tokens should be scoped to one project, origin, and service, expire quickly, and never upgrade a browser publishable key into account-level authority.

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

WebMCP hosted analytics is opt-in. It is not required for OSS usage, does not start automatically, and should use the same publishable paid-service key path as other WebMCP-hosted services. Configure an explicit event-type allowlist and keep event detail disabled unless the app has reviewed and redacted it. Hosted analytics should support deletion/export, retention limits, and project-level disable controls in the admin panel.

## Demo Admin Toggle

The demo exposes planner provider/model controls when `localStorage.setItem('webmcp:admin', 'true')` is set. This is a **development-only convenience** and is trivially discoverable by any user with browser devtools access. Do not rely on this mechanism for production access control. In production, pass app-owned planner configuration to keep provider/model choices hidden from end users.
