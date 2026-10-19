# @vampaz/webmcp-kit

Core WebMCP Kit runtime for defining app-owned tools, registering them with native browser WebMCP when available, invoking them through the fallback registry, validating inputs, outputs, and tool resolutions, and rendering the optional command input web component.

This package owns protocol behavior: validation, confirmations, guards, scope checks, events, resolvers, diagnostics, form helpers, and test bridge installation.

```ts
import { defineTool, objectInputSchema, registerTool, stringParam } from '@vampaz/webmcp-kit'

registerTool(
  defineTool({
    name: 'search_products',
    description: 'Search the local product catalog.',
    inputSchema: objectInputSchema(
      {
        query: stringParam({ description: 'Product name or category.' })
      },
      { required: ['query'] }
    ),
    execute(input) {
      return searchProducts(String(input.query))
    }
  })
)

function searchProducts(query: string) {
  return [{ query }]
}
```

For actions that need secrets, database access, or a private API, keep the handler on your server and register a server-backed tool in the app:

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
      required: true,
      reason: 'Sending an invoice emails a customer.'
    }
  })
)
```

The browser validates input, enforces scope, guards, and confirmation, then posts `{ toolName, input, source }` to the endpoint. Invocation cancellation is forwarded to the request, and a declared `outputSchema` validates the response before success is reported.
