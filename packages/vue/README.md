# webmcp-kit/vue

Vue lifecycle helper for registering a WebMCP Kit tool while the current effect scope is active.

```ts
import { defineTool, objectInputSchema, stringParam } from 'webmcp-kit'
import { useWebMCPTool } from 'webmcp-kit/vue'

useWebMCPTool(
  defineTool({
    name: 'search_products',
    description: 'Search the visible product catalog.',
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
