# Examples

These examples show the current WebMCP Kit adoption path: expose narrow app actions, keep validation and execution in the app, and use confirmations for important mutations.

## Plain TypeScript

```ts
import { defineTool, objectInputSchema, registerTool, stringParam } from '@vampaz/webmcp-kit'

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
import { defineTool } from '@vampaz/webmcp-kit'
import { useWebMCPTool } from '@vampaz/webmcp-kit/vue'

const props = defineProps<{ isCatalogRoute: boolean }>()

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
    when: function available() {
      return props.isCatalogRoute
    }
  }
)
</script>
```

The parent derives `isCatalogRoute` from its router. `searchProducts()` is an application-owned function. These are integration snippets; the complete [counter assistant module](./examples/counter-assistant.ts) is typechecked against the package artifact.

## Confirmed Checkout

```ts
import { defineTool, registerTool, setConfirmationHandler } from '@vampaz/webmcp-kit'

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

setConfirmationHandler(async function confirmTool({ tool, input, reason, signal }) {
  return showConfirmationModal({
    title: `Run ${tool.name}?`,
    body: reason,
    preview: JSON.stringify(input, null, 2),
    signal
  })
})
```

## Playwright Invocation

```ts
import { expect, test } from '@playwright/test'
import { invokeWebMCPTool, waitForWebMCPTool } from '@vampaz/webmcp-kit/testing/playwright'

test('selects items through the WebMCP test bridge', async function testSelectItems({ page }) {
  await page.goto('/')
  await waitForWebMCPTool(page, 'select_items')

  const result = await invokeWebMCPTool(page, {
    toolName: 'select_items',
    input: {
      ids: ['item_4', 'item_7']
    }
  })

  expect(result.status).toBe('success')
})
```

Install `installWebMCPKitTestBridge()` from `/testing` in deliberate test/development environments before using these helpers. The bridge always invokes with `source: 'fallback'`; callers cannot choose the source or bypass confirmation. Confirmed tools still use the app confirmation handler or the browser confirmation fallback.

## Server-Backed Tool

```ts
import { defineServerTool, objectInputSchema, registerTool, stringParam } from '@vampaz/webmcp-kit'

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
      reason: 'Sending an invoice emails a customer.'
    }
  })
)
```

The browser still validates input and enforces confirmation. Execution posts `{ toolName, input, source }` to the endpoint so secrets, private APIs, and database writes stay server-side.

## Form Tool

```ts
import { registerFormTool } from '@vampaz/webmcp-kit'

const form = document.querySelector<HTMLFormElement>('form')

if (form) {
  registerFormTool({
    form,
    name: 'prepare_support_ticket',
    description: 'Fill and validate the visible support request form without submitting it.',
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

The helper applies `toolname`, `tooldescription`, and official field metadata attributes such as `toolparamdescription`. Through the kit invocation path, the default execution fills fields and returns `FormData`; it does not submit the form. To create a ticket, supply `execute(input, form)` that calls the application's submission action, plus required confirmation. Native declarative form submission remains a separate browser path, so the form's submit handler must enforce application authorization and approval. The returned registration removes the tool and restores the previous form attributes when `unregister()` is called.

## Zod Tool

```ts
import { registerTool } from '@vampaz/webmcp-kit'
import { defineZodTool } from '@vampaz/webmcp-kit/zod'
import * as z from 'zod'

registerTool(
  defineZodTool({
    name: 'schedule_reminder',
    description: 'Schedule a reminder for the signed-in user at a future time.',
    schema: z.object({
      text: z.string().min(1).max(200),
      minutesFromNow: z.int().positive().max(1440)
    }),
    examples: [{ text: 'Stand-up', minutesFromNow: 15 }],
    confirmation: { reason: 'Schedule this reminder?' },
    execute({ text, minutesFromNow }) {
      return scheduleReminder(text, minutesFromNow)
    }
  })
)
```

Zod parses the input before approval, so refinements and defaults apply before the user is asked. `examples` use the raw input shape. The generated schema's `exclusiveMinimum` (from `.positive()`) is also enforced by the core validator.

## Local MCP Bridge

```ts
import { createLocalMCPBridge } from '@vampaz/webmcp-kit/mcp-bridge'

const bridge = createLocalMCPBridge()
const listed = await bridge.handleRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
const called = await bridge.handleRequest({
  jsonrpc: '2.0',
  id: 2,
  method: 'tools/call',
  params: { name: 'read_counter', arguments: {} }
})
```

The bridge lists currently available tools and routes calls through the normal approval path with `source: 'mcp-bridge'`. It is an in-process adapter; connect it to a transport yourself.

## Eval Fixtures

```ts
import { createResolver } from '@vampaz/webmcp-kit'
import { runWebMCPResolverEvals } from '@vampaz/webmcp-kit/testing'

const results = await runWebMCPResolverEvals(await createResolver({ provider: 'local' }), tools, [
  {
    name: 'product search',
    message: 'Find laptop stands',
    expectedToolName: 'search_products',
    expectedInput: { query: 'laptop stands' }
  }
])
```

See [WebMCP Evals](./evals.md) for resolver helper details and starter cases that check tool selection, parameter extraction, call order, and end-to-end user journey success.
