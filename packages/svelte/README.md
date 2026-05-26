# @webmcp-kit/svelte

Svelte lifecycle helper for registering a WebMCP Kit tool on mount and unregistering it on destroy.

```ts
import { defineTool } from '@webmcp-kit/core'
import { useWebMCPTool } from '@webmcp-kit/svelte'

useWebMCPTool(
  defineTool({
    name: 'search_products',
    description: 'Search the visible product catalog.',
    inputSchema,
    execute
  })
)
```
