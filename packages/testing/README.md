# @vampaz/webmcp-kit/testing

Playwright helpers for apps that install `installWebMCPKitTestBridge()` from `@vampaz/webmcp-kit`.

```ts
import { invokeWebMCPTool, waitForWebMCPTool } from '@vampaz/webmcp-kit/testing/playwright'

await waitForWebMCPTool(page, 'select_items')
await invokeWebMCPTool(page, {
  toolName: 'select_items',
  input: { ids: ['item_4'] },
  source: 'planner'
})
```

Planner evals can run without a browser:

```ts
import { createHeuristicPlanner } from '@vampaz/webmcp-kit'
import { runWebMCPPlannerEvals } from '@vampaz/webmcp-kit/testing'

const results = await runWebMCPPlannerEvals(createHeuristicPlanner(), tools, [
  {
    name: 'product search',
    message: 'Find docks',
    expectedToolName: 'search_products',
    expectedInput: { query: 'docks' }
  }
])

expect(results.every((result) => result.passed)).toBe(true)
```
