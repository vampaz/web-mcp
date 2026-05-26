# @webmcp-kit/vue

Vue lifecycle helper for registering a WebMCP Kit tool while the current effect scope is active.

```ts
import { defineTool } from '@webmcp-kit/core'
import { useWebMCPTool } from '@webmcp-kit/vue'

useWebMCPTool(
  defineTool({
    name: 'search_products',
    description: 'Search the visible product catalog.',
    inputSchema,
    execute
  })
)
```
