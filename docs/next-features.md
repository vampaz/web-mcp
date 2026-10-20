# Next Features: Making WebMCP Kit Really Usable

This roadmap starts from the current implementation. The first foundation layer is now in place: runtime input and output validation, Zod tool definitions, Vue/React/Svelte helpers, app-level confirmation handlers, scope-aware tool selection, bounded tool sequences, explicit resolver outcomes, server-backed tools, and repeatable resolver eval suites.

This file contains proposals, not additional exports. Version `0.2.0` adds the implemented [Pi](./pi.md) and [chat](./chat.md) surfaces. Use the [API reference](./api-reference.md) to distinguish implemented APIs from the illustrative proposals below.

## Existing foundations

These capabilities are part of the current API and should be treated as baseline behavior:

- Runtime input validation runs before scope, confirmation, guards, and `execute()`.
- Declared `outputSchema` values are validated before an invocation reports success.
- `defineZodTool()` is available from `@vampaz/webmcp-kit/zod` for single-source schema and TypeScript inference.
- Vue, React, and Svelte helpers register tools with lifecycle cleanup and return `{ unregister, getRegistration }`.
- `setConfirmationHandler()` lets apps provide their own approval UI, with `window.confirm()` as the browser fallback.
- The command input excludes scope-unavailable tools before asking a resolver to choose an action.
- Resolvers can return a single tool, a bounded `tool_sequence`, `needs_clarification`, or `no_tools_match`.
- `defineServerTool()` lets browser-visible tools delegate execution to an app-owned server endpoint.
- Resolver eval helpers, including repeated runs and minimum pass-rate summaries, are available from `@vampaz/webmcp-kit/testing`.

## Tier 1 - Resolver Reliability

### 1. Richer Agent-Loop Semantics

**Current state**: The command input supports bounded tool sequencing. A resolver can return `toolName: "tool_sequence"` with ordered `steps`; each step is validated, executed in order, and still uses the normal scope, confirmation, guard, and execution path. Pi already re-resolves from actual tool results one action at a time. The proposal below concerns explicit data references inside a pre-resolved command sequence.

**Needed**: Later steps should be able to consume earlier tool outputs in a typed, inspectable way.

```ts
interface ToolResolutionStep {
  toolName: string
  input: Record<string, unknown>
  confidence: number
  reason: string
  inputFrom?: Record<string, string>
}
```

This would let a workflow search for a product, pass the selected product ID to `add_to_cart`, then call `checkout_cart` without asking the resolver to invent intermediate IDs.

### 2. Structured Error Responses

**Current state**: Invocation results already expose a typed `ToolInvocationErrorCode` alongside an error string. These classify kit-level validation, availability, approval, guard, and execution failures. They do not represent application-specific error categories or authorize retries.

**Needed**: Tools should be able to throw or return typed errors.

```ts
class WebMCPToolError extends Error {
  code: 'RETRY' | 'BAD_INPUT' | 'UNAUTHORIZED' | 'NOT_FOUND' | 'RATE_LIMITED' | 'INTERNAL'
  retryable = false
}
```

Resolver and eval tools could then classify failures without parsing prose.

### 3. Better Resolver Outcome UX

**Current state**: `needs_clarification` and `no_tools_match` are valid resolver outcomes, and the command input returns blocked or unavailable results for them.

**Needed**: First-class UI affordances for clarification prompts and unsupported requests, including event detail that lets apps render a reply, collect missing fields, and rerun the command.

## Tier 2 - Workflow Authoring

### 4. Tool Composition and Recipes

**Current state**: Tools are atomic, and resolvers can compose short sequences dynamically.

**Needed**: A `defineRecipe()` helper that makes common workflows explicit and discoverable.

```ts
const checkoutRecipe = defineRecipe({
  name: 'checkout_workflow',
  description: 'Search for a product, add it to the cart, and check out.',
  steps: [
    { toolName: 'search_products', inputFrom: { query: 'userRequest' } },
    { toolName: 'add_to_cart', inputFrom: { productId: 'steps.0[0].id', quantity: 1 } },
    { toolName: 'checkout_cart' }
  ]
})
```

Recipes should still execute through the same validation, confirmation, guard, and event pipeline as normal tools.

### 5. Undo / Rollback Support

**Current state**: Once a destructive tool runs, WebMCP Kit does not know how to reverse it.

**Needed**: An optional `undo` handler on tool definitions.

```ts
defineTool({
  name: 'void_invoice',
  description: 'Void an invoice and mark it as cancelled.',
  execute(input) {
    return voidInvoice(input.invoiceId)
  },
  undo(input, output) {
    return restoreInvoice(input.invoiceId, output.previousStatus)
  }
})
```

The registry could track recent invocations for undoable tools, and the devtools overlay could expose a safe "Undo" action during development.

## Tier 3 - Production Operations

### 6. Observability and Analytics

**Current state**: The event system can be subscribed to, and events contain enough detail for app-owned audit trails.

**Needed**: An observability helper that turns event streams into useful metrics.

```ts
import { createToolMetrics } from '@vampaz/webmcp-kit'

const metrics = createToolMetrics()
metrics.invocations.create_invoice.count
metrics.invocations.create_invoice.errorRate
```

The same metrics should be visible in devtools and exportable to app-owned analytics after redaction.

### 7. Tool Discovery Manifest

**Current state**: Agents can discover tools on the current page through native WebMCP or the fallback registry.

**Needed**: A static or server-rendered manifest endpoint that lists tools across the app with route and scope hints.

```json
{
  "tools": [
    { "name": "create_invoice", "route": "/invoices", "description": "Create a draft invoice." },
    { "name": "search_products", "route": "/products", "description": "Search visible products." }
  ],
  "generatedAt": "2026-06-10T10:00:00Z"
}
```

This would help multi-page apps, documentation, and pre-navigation agent workflows.

## What Not To Build Yet

| Idea                                | Why defer                                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Streaming tool results              | The execute-then-return model is enough for most current workflows. Revisit when browser WebMCP streaming semantics stabilize. |
| Cross-tab/origin tool orchestration | Tools should remain page-scoped for now.                                                                                       |
| Built-in rate limiting              | Policy belongs to the app. Provide hooks and metrics first.                                                                    |
| Tool-to-OpenAPI generator           | Useful, but secondary to resolver reliability and workflow authoring.                                                          |
| Visual tool builder / no-code       | The kit is aimed at developers integrating existing apps.                                                                      |

## Summary

The next useful layer is resolver reliability: output-aware sequences, structured errors, and clearer clarification UX. After that, recipes, undo, observability, and manifests make WebMCP Kit easier to operate in larger applications.

## Deferred from the 0.4.0 refactor

These additions remain backlog work:

- `mountAssistant()` and reusable dialog approval helpers.
- A `/server` resolver endpoint helper.
- External MCP transport and connection lifecycle, including `initialize` and `ping`. The existing local bridge remains available.
- Bulk `registerTools()` and React `useWebMCPTools()`.
- A command-input launcher, chat dark mode, parts, configurable labels, and renaming `harness` to `controller`.
- Account-wide conversation deletion and development warnings for duplicate package copies.
- Incremental durable replay, a long-lived storage connection, and cross-tab notifications. These need a separate concurrency design and measured benefit.
- Semantic conversation compaction. The refactor removes request metadata but keeps conversation content and stored history intact.

Invocation still rechecks registration, schema, scope, and cancellation across asynchronous boundaries. Replacing those checks with frozen definitions needs a separate contract decision; this refactor preserves their safety behavior.
