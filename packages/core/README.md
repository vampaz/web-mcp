# @webmcp-kit/core

Core WebMCP Kit runtime for defining app-owned tools, registering them with native browser WebMCP when available, invoking them through the fallback registry, validating planner output, and rendering the optional command input web component.

This package owns protocol behavior: validation, confirmations, guards, scope checks, events, planners, diagnostics, form helpers, and test bridge installation.

```ts
import { defineTool, objectInputSchema, registerTool, stringParam } from '@webmcp-kit/core'

registerTool(
  defineTool({
    name: 'search_products',
    description: 'Search the local product catalog.',
    inputSchema: objectInputSchema(
      {
        query: stringParam({ description: 'Product name or category.' })
      },
      { required: ['query'] }
    ),
    execute(input) {
      return searchProducts(String(input.query))
    }
  })
)

function searchProducts(query: string) {
  return [{ query }]
}
```
