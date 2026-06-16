# @vampaz/webmcp-kit/zod

Zod helper for defining WebMCP Kit tools from a Zod input schema. Runtime parsing still happens before the tool execute callback, and core tool metadata such as annotations, confirmation, scope, guards, examples, and output schemas can be passed through the helper.

```sh
npm install @vampaz/webmcp-kit zod
```

```ts
import { z } from 'zod'
import { defineZodTool } from '@vampaz/webmcp-kit/zod'

defineZodTool({
  name: 'search_products',
  description: 'Search the visible product catalog.',
  schema: z.object({
    query: z.string()
  }),
  annotations: {
    readOnlyHint: true
  },
  execute(input) {
    return searchProducts(input.query)
  }
})
```
