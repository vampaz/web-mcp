# Next Features: Making WebMCP Kit Really Usable

This roadmap prioritizes features that would transform WebMCP Kit from a solid MVP into something teams genuinely depend on day to day. Every item below addresses a friction point that exists in the current API or unlocks a workflow that is currently missing.

---

## Tier 1 — Foundation Quality (do these first)

### 1. Runtime Input Validation

**Current state**: `defineTool` validates tool shape at definition time, and quality checks flag weak schemas. But the `execute` handler receives raw, unvalidated input. A poorly-formed or malicious input reaches the handler unchecked.

**Needed**: JSON Schema validation runs against the `input` before `execute` is called. If validation fails, the invocation returns `status: 'error'` with a structured message like `"Expected number at /amount, got string"`, and the handler never runs.

```ts
// What developers want:
const result = await invokeTool({
  toolName: 'create_invoice',
  input: { customerName: 123, amount: 'not-a-number' }
})
// result.status === 'error'
// result.error === 'input validation failed: /amount expected number, got string'
// handler never called — safe by default
```

This is the single most important safety improvement. Every tool should be validated, always, with no opt-out.

### 2. Zod Adapter For Type-Safe Tool Definitions

**Current state**: Developers write the JSON Schema and TypeScript types separately and keep them in sync by hand.

```ts
// Current: two sources of truth
defineTool<{ customerName: string; amount: number }>({
  inputSchema: {
    properties: {
      customerName: { type: 'string' },
      amount: { type: 'number', minimum: 0.01 }
    }
    // These must stay in sync with the TypeScript generic — nothing enforces it
  }
})
```

**Needed**: A `defineZodTool` function (or `z.tool()`) that takes a Zod schema and produces both the JSON Schema and the TypeScript type from it. One source of truth.

```ts
// Proposed: single source of truth
const createInvoiceTool = defineZodTool({
  name: 'create_invoice',
  description: 'Create a draft invoice.',
  schema: z.object({
    customerName: z.string().describe('Customer to invoice.'),
    amount: z.number().min(0.01).describe('Invoice amount in euros.')
  }),
  confirmation: { required: true, reason: 'Creates a billable invoice.' },
  async execute({ customerName, amount }) {
    // customerName: string, amount: number — fully inferred, no generic needed
    return createInvoice(customerName, amount)
  }
})
```

This would dramatically reduce boilerplate and eliminate a class of bugs. Ship it as `webmcp-kit/zod` or in core behind an optional peer dependency.

### 3. Reactive Framework Composables

**Current state**: The Vue/React/Svelte docs show manual `onMounted`/`useEffect`/`onMount` recipes. These work for static tools but break down with dynamic state: a tool should register only when the user is on a specific route, or only when an item is selected.

**Needed**: A small set of framework helpers that handle lifecycle, reactive scope, and auto-cleanup.

```ts
// Vue composable example
import { useWebMCPTool } from 'webmcp-kit/vue'

useWebMCPTool(createInvoiceTool, {
  // Tool auto-registers only when on /invoices route
  when: () => route.path.startsWith('/invoices')
})
```

```tsx
// React hook example
import { useWebMCPTool } from 'webmcp-kit/react'

useWebMCPTool(createInvoiceTool, {
  when: () => router.pathname.startsWith('/invoices')
})
```

This is the feature that makes the framework story feel real instead of "here's a recipe, you figure out the rest." Framework packages should be thin — delegate everything to core, own only lifecycle — as the FR extensions doc already prescribes.

### 4. Confirmation UI Bridge

**Current state**: The registry calls `window.confirm()` for tools that require confirmation. This is unusable in real apps: it blocks the thread, can't be styled, and provides no context beyond a raw string.

**Needed**: A confirmation provider that the app configures once, globally.

```ts
import { createWebMCPKit, setConfirmationHandler } from 'webmcp-kit'

setConfirmationHandler(async function onConfirm(tool, input, reason) {
  // Plug in your own modal, toast, or whatever
  return await showConfirmationModal({
    title: `Run ${tool.name}?`,
    body: reason,
    preview: JSON.stringify(input, null, 2)
  })
})
```

This should be a single global callback, not per-tool. The registry calls it instead of `window.confirm()`. If unset, fall back to `window.confirm()` (with a console warning in dev).

---

## Tier 2 — Agent Workflows (do these next)

### 5. Multi-Tool Planning

**Current state**: Basic bounded tool sequencing is implemented. A planner can return `toolName: "tool_sequence"` with ordered `steps`; each step is validated, executed in order, and still uses the normal guard and confirmation path. This covers direct workflows such as "select Stark Industries invoices, then mark them paid."

**Still needed**: Richer agent-loop semantics where later steps can consume earlier tool outputs, plus explicit `needsClarification` and `noToolsMatch` responses for ambiguous or unsupported requests.

```ts
interface ToolPlan {
  toolName: string
  input: Record<string, unknown>
  confidence: number
  reason: string
  steps?: ToolPlanStep[]
}

interface ToolPlanStep {
  toolName: string
  input: Record<string, unknown>
  confidence: number
  reason: string
}
```

### 6. Tool Composition and Recipes

**Current state**: Every tool is a leaf. There is no way to compose tools into higher-level workflows.

**Needed**: A `defineRecipe` function that composes existing tools into a named, discoverable sequence.

```ts
const checkoutRecipe = defineRecipe({
  name: 'checkout_workflow',
  description: 'Search for a product, add it to the cart, and check out.',
  steps: [
    { toolName: 'search_products', inputFrom: { query: 'userRequest' } },
    { toolName: 'add_to_cart', inputFrom: { productId: 'steps.0[0].id', quantity: 1 } },
    { toolName: 'checkout_cart', confirm: true }
  ]
})

registerTool(checkoutRecipe) // recipes are tools too
```

This makes the most common agent use case — "do a multi-step thing for me" — a first-class concept. Recipes can be registered like tools so agents discover them alongside atomic tools.

### 7. Undo / Rollback Support

**Current state**: Once a destructive tool runs, there is no way back.

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

The registry tracks the last `N` invocations per tool. The devtools overlay gets an "Undo" button for undoable tools. If the native WebMCP API eventually exposes undo semantics, the kit already has the metadata.

---

## Tier 3 — Production Readiness (medium-term)

### 8. Server-Delegated Tools

**Current state**: All tool handlers run in the browser. Many real actions need server-side execution (calling a payment API, sending email, querying a database).

**Needed**: A way to declare a tool whose handler lives on the server. The frontend registers it as a native/fallback tool, but execution calls a server endpoint.

```ts
const sendInvoiceTool = defineServerTool({
  name: 'send_invoice',
  description: 'Send a finalized invoice to the customer by email.',
  endpoint: '/api/tools/send-invoice'
  // Frontend validates the schema and sends input to endpoint
  // Server handles execution with secrets
})
```

This is the single most-requested pattern in real enterprise apps. Most meaningful tools do things that shouldn't happen in a browser.

### 9. Structured Error Responses

**Current state**: Tool errors are strings or generic `Error` objects. An agent can't programmatically decide what to do next.

**Needed**: Tools should throw (or return) typed errors.

```ts
class WebMCPToolError extends Error {
  code: 'RETRY' | 'BAD_INPUT' | 'UNAUTHORIZED' | 'NOT_FOUND' | 'RATE_LIMITED' | 'INTERNAL'
}

// Agent sees:
{ status: 'error', error: 'No such invoice.', code: 'NOT_FOUND', retryable: false }
```

Planners can use error codes to decide whether to retry, ask for clarification, or give up. This is critical for agent reliability.

### 10. Observability and Analytics

**Current state**: The event system exists and can be subscribed to, but there's no built-in way to get useful metrics.

**Needed**: An observability helper that turns the event stream into actionable data.

```ts
import { createToolMetrics } from 'webmcp-kit'

const metrics = createToolMetrics()
// metrics.invocations.create_invoice.count — total calls
// metrics.invocations.create_invoice.p50 — median latency
// metrics.invocations.create_invoice.errorRate — failure ratio
// metrics.invocations.create_invoice.blockedFromGuard — guard rejections
```

Expose this data in the devtools overlay (per-tool latency histograms, error breakdowns) and make it available programmatically so teams can ship it to their own analytics.

### 11. Tool Discovery Manifest

**Current state**: Agents can only discover tools on the current page. Multi-page apps, SEO, and offline tool catalogs get nothing.

**Needed**: A static manifest endpoint (`/webmcp.json` or `/tools.json`) that lists all tools across the app with their routes/scopes.

```json
{
  "tools": [
    { "name": "create_invoice", "route": "/invoices", "description": "..." },
    { "name": "search_products", "route": "/products", "description": "..." }
  ],
  "generatedAt": "2026-05-14T10:00:00Z"
}
```

Generated at build time or served by a lightweight endpoint. Agents can prefetch this before navigating. Lighthouse can consume it for the WebMCP audit. Docs can render it.

---

## What _Not_ To Build Yet

| Idea                                | Why defer                                                                                                                                    |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Streaming tool results              | Adds complexity; the execute-then-return model is sufficient for most use cases. Revisit when Chrome's WebMCP streaming semantics stabilize. |
| Cross-tab/origin tool orchestration | Massive scope creep. Tools should be page-scoped.                                                                                            |
| Built-in rate limiting              | App-level concern. Provide hooks for it but don't enforce policy.                                                                            |
| Tool-to-OpenAPI generator           | Niche. The OpenAI adapter already covers the main interoperability case.                                                                     |
| Visual tool builder / no-code       | Not the target audience. This kit is for developers who already have apps.                                                                   |

---

## Summary

The immediate priority should be **validation, Zod, composables, and confirmation** — features that fix real pain in every tool definition today. After that, **multi-tool planning and server tools** unlock the workflows that make agent interaction feel genuinely useful rather than demo-only. Everything else builds on those foundations.
