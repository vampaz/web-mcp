# webmcp-kit/vue

Vue lifecycle helper for registering a WebMCP Kit tool while the current effect scope is active. `when` can be a ref, computed value, or getter, and the composable returns `{ unregister, getRegistration }`.

```ts
import { defineTool, objectInputSchema, stringParam } from 'webmcp-kit'
import { useWebMCPTool } from 'webmcp-kit/vue'

const searchTool = useWebMCPTool(
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

`searchTool.getRegistration()` returns the current registration, and `searchTool.unregister()` removes it before scope disposal when needed.
