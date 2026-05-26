# React Hook

Use `useWebMCPTool` to register a tool while the component is mounted. The hook syncs after renders, so `when` can read current route or component state.

```tsx
import { defineTool } from 'webmcp-kit'
import { useWebMCPTool } from 'webmcp-kit/react'

export function CartTools() {
  useWebMCPTool(
    defineTool({
      name: 'add_to_cart',
      description: 'Add a known product to the current cart.',
      inputSchema: {
        type: 'object',
        properties: {
          productId: { type: 'string' },
          quantity: { type: 'integer', minimum: 1 }
        },
        required: ['productId', 'quantity'],
        additionalProperties: false
      },
      execute(input) {
        return input
      }
    }),
    {
      when: function isCartRoute() {
        return window.location.pathname.startsWith('/cart')
      }
    }
  )

  return null
}
```
