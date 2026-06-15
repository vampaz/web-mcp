# React Hook

Use `useWebMCPTool` to register a tool while the component is mounted. The hook syncs after renders. `when` is a boolean computed during render, so derive it from props, state, or your router.

```tsx
import { useLocation } from 'react-router'

import { defineTool } from '@vampaz/webmcp-kit'
import { useWebMCPTool } from '@vampaz/webmcp-kit/react'

export function CartTools() {
  const location = useLocation()

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
      when: location.pathname.startsWith('/cart')
    }
  )

  return null
}
```

The hook returns the same handle shape as the Vue and Svelte helpers:

```tsx
const cartTool = useWebMCPTool(addToCartTool)

cartTool.getRegistration() // current RegisteredTool or undefined
cartTool.unregister() // unregister before unmount when needed
```
