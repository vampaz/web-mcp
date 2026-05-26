# webmcp-kit/zod

Zod helper for defining WebMCP Kit tools from a Zod input schema. Runtime parsing still happens before the tool execute callback.

```ts
import { z } from 'zod'
import { defineZodTool } from 'webmcp-kit/zod'

defineZodTool({
  name: 'search_products',
  description: 'Search the visible product catalog.',
  schema: z.object({
    query: z.string()
  }),
  execute(input) {
    return searchProducts(input.query)
  }
})
```
