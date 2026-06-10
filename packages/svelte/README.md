# webmcp-kit/svelte

Svelte lifecycle helper for registering a WebMCP Kit tool on mount and unregistering it on destroy. `when` can be a boolean, function, or readable store, and the helper returns `{ unregister, getRegistration }`.

```ts
import { defineTool, objectInputSchema, stringParam } from 'webmcp-kit'
import { useWebMCPTool } from 'webmcp-kit/svelte'

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

`searchTool.getRegistration()` returns the current registration after mount, and `searchTool.unregister()` removes it before destroy when needed.
