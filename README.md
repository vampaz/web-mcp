# WebMCP Kit

WebMCP Kit is a local-first TypeScript toolkit for adding WebMCP tools to real web apps. It registers tools with native WebMCP browser APIs when they exist, keeps a fallback registry for development and tests, and gives teams a practical path to build agent-ready UI without inventing a new protocol.

## Status

This repository is an early MVP. Chrome WebMCP and Chrome built-in AI are emerging browser capabilities, so the kit is designed as progressive enhancement:

1. Use native WebMCP when `navigator.modelContext.registerTool` is available.
2. Keep a fallback registry for unsupported browsers, tests, demos, and devtools.
3. Use Chrome built-in AI planning when `LanguageModel` is available.
4. Fall back to deterministic local planning when browser AI is unavailable.

## Quick Start

```ts
import { defineTool, registerTool } from '@webmcp-kit/core'

const registration = registerTool(defineTool({
  name: 'create_invoice',
  description: 'Create a draft invoice for a customer and add it to the invoice list.',
  inputSchema: {
    type: 'object',
    properties: {
      customerName: {
        type: 'string',
        description: 'The customer name to invoice.'
      },
      amount: {
        type: 'number',
        minimum: 0.01,
        description: 'The invoice amount.'
      }
    },
    required: ['customerName', 'amount']
  },
  confirmation: {
    required: true,
    reason: 'Creating an invoice changes business state.'
  },
  async execute(input) {
    return createInvoice(input)
  }
}))

registration.unregister()
```

## Core API

- `createWebMCPKit(options)` initializes the kit and optional planner provider.
- `defineTool(tool)` validates and preserves a typed tool definition.
- `registerTool(tool)` registers with native WebMCP when available and always stores the tool in the fallback registry.
- `invokeTool({ toolName, input, confirmed })` invokes fallback-registered tools for devtools, tests, and demos.
- `listTools()` returns active registrations.
- `getRegistrySnapshot()` returns support mode, tool count, and registered tools.
- `isWebMCPSupported()` checks for native WebMCP registration support.
- `createBestPlanner()` uses Chrome built-in AI when available, otherwise a deterministic local planner.
- `installWebMCPKitTestBridge()` exposes a kit-specific test bridge for Playwright and local QA.

## Planner Providers

Developers can pass a planner provider when initializing the kit:

```ts
import { createWebMCPKit } from '@webmcp-kit/core'

const kit = await createWebMCPKit({
  planner: {
    provider: 'openrouter',
    model: 'openrouter/auto',
    auth: {
      mode: 'user-key',
      apiKey: userProvidedKey
    }
  }
})
```

User-key mode is intentionally simple and does not need a server, but the key is visible to the browser page. For app-owned production secrets, use server mode:

```ts
await createWebMCPKit({
  planner: {
    provider: 'openai',
    model: 'gpt-4.1-mini',
    auth: {
      mode: 'server',
      endpoint: '/api/webmcp/plan'
    }
  }
})
```

See [Planner Providers](./docs/planner-providers.md) for OpenRouter, OpenAI, OpenAI-compatible, Cloudflare Workers AI, Chrome built-in AI, and local fallback examples.

For local development and preview deployments, the demo also exposes `cloudflare-binding`: a server-endpoint-only mode where the browser selects from approved Cloudflare Workers AI models and the Astro Cloudflare runtime endpoint uses an `AI` binding. It is not shown in normal production builds by default.

## Playwright Helpers

Apps can install the test bridge in development or test builds:

```ts
import { installWebMCPKitTestBridge } from '@webmcp-kit/core'

installWebMCPKitTestBridge()
```

Playwright tests can then inspect and invoke tools through the page:

```ts
import { invokeWebMCPTool, waitForWebMCPTool } from '@webmcp-kit/testing/playwright'

await waitForWebMCPTool(page, 'select_items')
await invokeWebMCPTool(page, {
  toolName: 'select_items',
  input: { ids: ['item_4', 'item_7'] },
  source: 'planner'
})
```

## Local Demo

```sh
npm install
npm run dev
```

Open:

```txt
http://localhost:60001/
```

The demo exposes invoice, product search, cart, and support-ticket tools. It shows whether the app is running with native WebMCP or fallback mode, then lets you run natural-language commands against the registered tools.

## Development

```sh
npm run test
npm run test:e2e
npm exec tsc -- --noEmit
```

Production builds are intentionally not part of the normal verification loop yet.
