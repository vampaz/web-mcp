# Examples

These examples show the current WebMCP Kit adoption path: expose narrow app actions, keep validation and execution in the app, and use confirmations for important mutations.

## Plain TypeScript

```ts
import { defineTool, objectInputSchema, registerTool, stringParam } from 'webmcp-kit'

registerTool(
  defineTool({
    name: 'search_products',
    description: 'Search the local product catalog.',
    inputSchema: objectInputSchema(
      {
        query: stringParam({ description: 'Product name or category to search for.' })
      },
      { required: ['query'] }
    ),
    annotations: {
      readOnlyHint: true
    },
    execute(input) {
      return searchProducts(String(input.query))
    }
  })
)
```

## Vue Lifecycle

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { defineTool } from 'webmcp-kit'
import { useWebMCPTool } from 'webmcp-kit/vue'

const isCatalogRoute = computed(function getIsCatalogRoute() {
  return window.location.pathname.startsWith('/catalog')
})

useWebMCPTool(
  defineTool({
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
    annotations: {
      readOnlyHint: true
    },
    execute(input) {
      return searchProducts(String(input.query))
    }
  }),
  {
    when: isCatalogRoute
  }
)
</script>
```

## Confirmed Checkout

```ts
import { defineTool, registerTool, setConfirmationHandler } from 'webmcp-kit'

registerTool(
  defineTool({
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
  })
)

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
import { invokeWebMCPTool, waitForWebMCPTool } from 'webmcp-kit/testing/playwright'

test('selects items through the WebMCP test bridge', async function testSelectItems({ page }) {
  await page.goto('/')
  await waitForWebMCPTool(page, 'select_items')

  const result = await invokeWebMCPTool(page, {
    toolName: 'select_items',
    input: {
      ids: ['item_4', 'item_7']
    },
    source: 'planner'
  })

  expect(result.status).toBe('success')
})
```

The test bridge does not let tests bypass confirmation by passing `confirmed: true`. Confirmed tools still use the app confirmation handler or the browser confirmation fallback.

## Server-Backed Tool

```ts
import { defineServerTool, objectInputSchema, registerTool, stringParam } from 'webmcp-kit'

registerTool(
  defineServerTool({
    name: 'send_invoice',
    description: 'Send an invoice email from the server.',
    endpoint: '/api/tools/send-invoice',
    inputSchema: objectInputSchema(
      {
        invoiceId: stringParam({ description: 'Visible invoice ID.' })
      },
      { required: ['invoiceId'] }
    ),
    confirmation: {
      required: true,
      reason: 'Sending an invoice emails a customer.'
    }
  })
)
```

The browser still validates input and enforces confirmation. Execution posts `{ toolName, input, source }` to the endpoint so secrets, private APIs, and database writes stay server-side.

## Form Tool

```ts
import { registerFormTool } from 'webmcp-kit'

const form = document.querySelector<HTMLFormElement>('form')

if (form) {
  registerFormTool({
    form,
    name: 'create_support_ticket',
    description: 'Create a support ticket from the visible support request form.',
    fields: {
      subject: {
        description: 'Short issue summary.'
      },
      body: {
        description: 'Detailed issue description.'
      }
    }
  })
}
```

The helper applies `toolname`, `tooldescription`, and official field metadata attributes such as `toolparamdescription`.

## Eval Fixtures

```ts
import { createHeuristicPlanner } from 'webmcp-kit'
import { runWebMCPPlannerEvals } from 'webmcp-kit/testing'

const results = await runWebMCPPlannerEvals(createHeuristicPlanner(), tools, [
  {
    name: 'product search',
    message: 'Find laptop stands',
    expectedToolName: 'search_products',
    expectedInput: { query: 'laptop stands' }
  }
])
```

See [WebMCP Evals](./evals.md) for planner helper details and starter cases that check tool selection, parameter extraction, call order, and end-to-end user journey success.
