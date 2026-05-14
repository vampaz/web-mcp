# React Recipe

Use the framework-agnostic core API inside an effect.

```tsx
import { useEffect } from 'react'
import { defineTool, registerTool } from '@webmcp-kit/core'

export function CartTools() {
  useEffect(function registerCartTools() {
    const registration = registerTool(defineTool({
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
    }))

    return function unregisterCartTools() {
      registration.unregister()
    }
  }, [])

  return null
}
```
