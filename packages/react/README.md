# webmcp-kit/react

React lifecycle helper for registering a WebMCP Kit tool from an effect and unregistering it on cleanup. `when` is a boolean derived during render, and the hook returns `{ unregister, getRegistration }`.

```ts
import { defineTool, objectInputSchema, stringParam } from 'webmcp-kit'
import { useWebMCPTool } from 'webmcp-kit/react'

export function ProductSearchTools() {
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

  return null
}

function searchProducts(query: string) {
  return [{ query }]
}
```

`searchTool.getRegistration()` returns the current registration after the effect has run, and `searchTool.unregister()` removes it before unmount when needed.
