# WebMCP Evals

WebMCP tools need normal deterministic tests and agent-facing evals. Deterministic tests prove that a tool validates input, enforces guards and confirmations, and updates app state correctly. Evals check whether a model or resolver chooses the right tool, fills the right parameters, and completes the user journey.

Use evals before exposing tools in production and whenever tool names, descriptions, schemas, or resolver prompts change.

## What To Evaluate

- Tool selection: given a user request, does the resolver choose the intended tool?
- Parameter extraction: does the resolver produce schema-valid input with stable IDs from context?
- Call order: for multi-step tasks, does each step happen in a sensible sequence?
- Journey success: after execution, is the app in the expected state?
- Ambiguity: when two tools look similar, does the resolver still choose correctly?
- Rejection: when a request is impossible or unsafe, does the resolver avoid inventing parameters?

## Starter Cases

Inventory:

- User request: "Select all French items."
- Expected tool: `select_items`.
- Expected input: IDs for visible French inventory items.
- Success check: selected items match the expected IDs.

Support:

- User request: "Create a ticket saying I cannot open the latest invoice."
- Expected tool: `create_support_ticket`.
- Expected input: subject and body fields populated from the request.
- Success check: a new ticket appears at the top of the board.

Invoices:

- User request: "Mark the selected invoice as paid."
- Expected tool: `update_selected_invoice_status`.
- Expected input: `{ "status": "paid" }`.
- Success check: selected invoices have status `paid`, and confirmation was enforced.

Commerce:

- User request: "Find laptop stands."
- Expected tool: `search_products`.
- Expected input: `{ "query": "laptop stands" }`.
- Success check: matching products are returned and no cart state changes.

## Resolver Helper API

For resolver-only checks, import the helper API from `@vampaz/webmcp-kit/testing`:

```ts
import { createResolver } from '@vampaz/webmcp-kit'
import { runWebMCPResolverEvals, runWebMCPResolverEvalSuite } from '@vampaz/webmcp-kit/testing'

const results = await runWebMCPResolverEvals(await createResolver({ provider: 'local' }), tools, [
  {
    name: 'product search',
    message: 'Find laptop stands',
    context: {
      route: '/commerce'
    },
    expectedToolName: 'search_products',
    expectedInput: { query: 'laptop stands' }
  }
])

expect(
  results.every(function evalPassed(result) {
    return result.passed
  })
).toBe(true)
```

The helper validates the returned resolution against the available tool schemas before checking the expected tool and input. Use `runWebMCPResolverEvalCase()` for one case when a test needs custom reporting.

```ts
interface WebMCPResolverEvalCaseBase {
  name: string
  message: string
  context?: ResolverContext
  expectedInput?: Record<string, unknown>
  expectedInputSubset?: Record<string, unknown>
  expectedSteps?: Array<{
    toolName: string
    inputSubset?: Record<string, unknown>
  }>
}

type WebMCPResolverEvalCase = WebMCPResolverEvalCaseBase &
  (
    | { expectedToolName: string; expectedOutcome?: never }
    | {
        expectedToolName?: never
        expectedOutcome: 'needs_clarification' | 'no_tools_match'
      }
  )
```

Set exactly one of `expectedToolName` or `expectedOutcome` on each case. Pass at least one case to a suite; an empty suite has no evaluation signal.

Use `runWebMCPResolverEvalSuite()` when model output can vary. It repeats every case and applies a minimum pass-rate threshold while retaining the individual resolutions, errors, and durations in a serializable summary.

```ts
const summary = await runWebMCPResolverEvalSuite(resolver, tools, cases, {
  runsPerCase: 5,
  minimumPassRate: 0.8
})

expect(summary.passed).toBe(true)
console.log(JSON.stringify(summary, null, 2))
```

For chained resolutions, use `expectedSteps` to check tool order and important input fields. Still add an end-to-end test that invokes the resolution and asserts the final app state.

## Failure Signals

Treat these as eval failures, not just warnings:

- The resolver picks a mutating tool when a read-only tool answers the request.
- The resolver skips a required lookup step and invents IDs.
- The resolver calls tools in an order that makes later steps unavailable.
- The resolver emits input that only passes because the tool is overly permissive.
- A tool description overlaps another tool enough that the resolver frequently chooses either one.

These cases usually mean the tool strategy needs tightening: rename the tool, clarify the description, make the schema more specific, add enum values, or expose/hide tools based on current state.

## Native browser journeys

Use `runNativeWebMCPAgent` from `@vampaz/webmcp-kit/testing/playwright` for full agent journeys.
It discovers and executes through `document.modelContext`, without the test bridge, Pi context or
private application state. Enable native WebMCP and its testing API in Chrome with
`--enable-blink-features=WebMCP` and `--enable-features=WebMCPTesting`.

```ts
import { runNativeWebMCPAgent } from '@vampaz/webmcp-kit/testing/playwright'

const report = await runNativeWebMCPAgent(page, {
  resolver,
  message: 'Show unreviewed records.',
  maxToolCalls: 4
})
expect(report.outcome).toBe('replied')
expect(report.repeatedCalls).toBe(0)
// Also assert the actual visible filter and persisted data where applicable.
```

The helper refreshes discovery between model rounds and rechecks the selected contract before
execution. `agent_reply` is reserved for the evaluation's final response. A failed application call
permits only a final explanation; it cannot replay the failed action. Invalid model output gets one
correction attempt per journey, with no execution, and each resolver request receives a 120-second abort signal.

Reports include steps, outcome, tool calls, repeated calls, resolver errors and UTF-8 byte totals for
catalogs, results and serialized resolver inputs. `resolverInputBytes` excludes provider-specific
prompt/schema overhead; measure actual HTTP request bodies separately when comparing transport cost.
`replied` means the model finished, not that the task succeeded: assert the UI, save response and
post-reload state. Include duplicate labels, collapsed/unrendered rows, active versus selected IDs,
read-only state preservation, stale targets and partial saves. Run equivalent Assistant prompts and
compare task success, call count, repeated discovery and payload size. Keep real-model checks opt-in
and record the model, browser and package revision alongside results.
