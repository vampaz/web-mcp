# Examples

These examples show the current WebMCP Kit adoption path: expose narrow app actions, keep validation and execution in the app, and use confirmations for important mutations.

## Plain TypeScript

```ts
import { defineTool, registerTool } from '@webmcp-kit/core'

registerTool(defineTool({
  name: 'search_products',
  description: 'Search the local product catalog.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' }
    },
    required: ['query'],
    additionalProperties: false
  },
  execute(input) {
    return searchProducts(String(input.query))
  }
}))
```

## Vue Lifecycle

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { defineTool } from '@webmcp-kit/core'
import { useWebMCPTool } from '@webmcp-kit/vue'

const isCatalogRoute = computed(function getIsCatalogRoute() {
  return window.location.pathname.startsWith('/catalog')
})

useWebMCPTool(defineTool({
  name: 'search_products',
  description: 'Search the visible product catalog.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' }
    },
    required: ['query'],
    additionalProperties: false
  },
  execute(input) {
    return searchProducts(String(input.query))
  }
}), {
  when: isCatalogRoute
})
</script>
```

## Confirmed Checkout

```ts
import { defineTool, registerTool, setConfirmationHandler } from '@webmcp-kit/core'

registerTool(defineTool({
  name: 'checkout_cart',
  description: 'Checkout the current cart after explicit user approval.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false
  },
  confirmation: {
    required: true,
    reason: 'Checkout clears the cart and represents a purchase action.'
  },
  scope() {
    return {
      available: cartHasItems(),
      reason: 'Cart is empty.'
    }
  },
  execute() {
    return checkoutCart()
  }
}))

setConfirmationHandler(async function confirmTool(tool, input, reason) {
  return showConfirmationModal({
    title: `Run ${tool.name}?`,
    body: reason,
    preview: JSON.stringify(input, null, 2)
  })
})
```

## Playwright Invocation

```ts
import { expect, test } from '@playwright/test'
import { invokeWebMCPTool, waitForWebMCPTool } from '@webmcp-kit/testing/playwright'

test('checks out a cart through the WebMCP test bridge', async function testCheckout({ page }) {
  await page.goto('/cart')
  await waitForWebMCPTool(page, 'checkout_cart')

  const result = await invokeWebMCPTool(page, {
    toolName: 'checkout_cart',
    input: {},
    confirmed: true,
    source: 'planner'
  })

  expect(result.status).toBe('success')
})
```

Use `confirmed: true` only from trusted automation or bridge code that has already performed the approval step. Normal app flows should rely on `setConfirmationHandler()`.
