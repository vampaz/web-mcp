# WebMCP Evals

WebMCP tools need normal deterministic tests and agent-facing evals. Deterministic tests prove that a tool validates input, enforces guards and confirmations, and updates app state correctly. Evals check whether a model or planner chooses the right tool, fills the right parameters, and completes the user journey.

Use evals before exposing tools in production and whenever tool names, descriptions, schemas, or planner prompts change.

## What To Evaluate

- Tool selection: given a user request, does the planner choose the intended tool?
- Parameter extraction: does the planner produce schema-valid input with stable IDs from context?
- Call order: for multi-step tasks, does each step happen in a sensible sequence?
- Journey success: after execution, is the app in the expected state?
- Ambiguity: when two tools look similar, does the planner still choose correctly?
- Rejection: when a request is impossible or unsafe, does the planner avoid inventing parameters?

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

## Planner Helper API

For planner-only checks, import the helper API from `@vampaz/webmcp-kit/testing`:

```ts
import { createHeuristicPlanner } from '@vampaz/webmcp-kit'
import { runWebMCPPlannerEvals } from '@vampaz/webmcp-kit/testing'

const results = await runWebMCPPlannerEvals(createHeuristicPlanner(), tools, [
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

The helper validates the returned plan against the available tool schemas before checking the expected tool and input. Use `runWebMCPPlannerEvalCase()` for one case when a test needs custom reporting.

```ts
interface WebMCPPlannerEvalCase {
  name: string
  message: string
  context?: PlannerContext
  expectedToolName: string
  expectedInput?: Record<string, unknown>
}
```

For chained plans, still add an end-to-end test that invokes the plan and asserts the final app state. The planner eval helper checks plan shape and exact top-level expectations; browser or component tests should verify the workflow result.

## Failure Signals

Treat these as eval failures, not just warnings:

- The planner picks a mutating tool when a read-only tool answers the request.
- The planner skips a required lookup step and invents IDs.
- The planner calls tools in an order that makes later steps unavailable.
- The planner emits input that only passes because the tool is overly permissive.
- A tool description overlaps another tool enough that the planner frequently chooses either one.

These cases usually mean the tool strategy needs tightening: rename the tool, clarify the description, make the schema more specific, add enum values, or expose/hide tools based on current state.
