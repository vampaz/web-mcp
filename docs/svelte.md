# Svelte Helper

Use `useWebMCPTool` to register a tool while the component is mounted. `when` can be a boolean, function, or readable store.

```svelte
<script lang="ts">
  import { readable } from 'svelte/store'
  import { defineTool } from '@vampaz/webmcp-kit'
  import { useWebMCPTool } from '@vampaz/webmcp-kit/svelte'

  const isCatalogRoute = readable(window.location.pathname.startsWith('/catalog'))

  useWebMCPTool(defineTool({
    name: 'search_products',
    description: 'Search the local product catalog for the current shopper.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' }
      },
      required: ['query'],
      additionalProperties: false
    },
    execute(input) {
      return input
    }
  }), {
    when: isCatalogRoute
  })
</script>
```

The helper returns the same handle shape as the Vue and React helpers:

```ts
const searchTool = useWebMCPTool(searchProductsTool)

searchTool.getRegistration() // current RegisteredTool or undefined (set after mount)
searchTool.unregister() // unregister before destroy when needed
```
