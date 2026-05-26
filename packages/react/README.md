# @webmcp-kit/react

React lifecycle helper for registering a WebMCP Kit tool from an effect and unregistering it on cleanup.

```ts
import { defineTool } from '@webmcp-kit/core'
import { useWebMCPTool } from '@webmcp-kit/react'

useWebMCPTool(
  defineTool({
    name: 'search_products',
    description: 'Search the visible product catalog.',
    inputSchema,
    execute
  })
)
```
