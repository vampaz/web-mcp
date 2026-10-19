# @vampaz/webmcp-kit/testing

Playwright helpers for apps that install `installWebMCPKitTestBridge()` from `@vampaz/webmcp-kit`.

```ts
import { invokeWebMCPTool, waitForWebMCPTool } from '@vampaz/webmcp-kit/testing/playwright'

await waitForWebMCPTool(page, 'select_items')
await invokeWebMCPTool(page, {
  toolName: 'select_items',
  input: { ids: ['item_4'] },
  source: 'resolver'
})
```

Resolver evals can run without a browser:

```ts
import { createHeuristicResolver } from '@vampaz/webmcp-kit'
import { runWebMCPResolverEvals } from '@vampaz/webmcp-kit/testing'

const results = await runWebMCPResolverEvals(createHeuristicResolver(), tools, [
  {
    name: 'product search',
    message: 'Find docks',
    expectedToolName: 'search_products',
    expectedInput: { query: 'docks' }
  }
])

expect(results.every((result) => result.passed)).toBe(true)
```

Use `runWebMCPResolverEvalSuite()` for repeated model-backed runs with a minimum pass rate. Cases can assert resolver outcomes, partial inputs, and ordered chained-resolution steps. The returned summary is JSON-serializable for CI artifacts.

Each case should define exactly one of `expectedToolName` or `expectedOutcome`, and suites should contain at least one case.
