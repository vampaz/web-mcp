# WebMCP Kit

WebMCP Kit is a local-first TypeScript toolkit for exposing real web app actions as safe, typed WebMCP tools. It lets apps register narrow actions with schemas, guards, confirmations, and lifecycle cleanup, then progressively connects those tools to native browser WebMCP, local devtools, tests, and planner-driven demos.

## Status

This repository is an early MVP. Chrome WebMCP and Chrome built-in AI are emerging browser capabilities, so the kit is designed as progressive enhancement:

1. Use native WebMCP when `navigator.modelContext.registerTool` is available.
2. Keep a fallback registry for unsupported browsers, tests, demos, and devtools.
3. Use Chrome built-in AI planning when `LanguageModel` is available.
4. Fall back to deterministic local planning when browser AI is unavailable.

The current aim is not to replace app code or invent a new agent runtime. The kit gives existing web apps a small adoption layer for making selected user-facing actions callable by browsers, tests, local tools, or planners while the app keeps ownership of validation, confirmation, authorization, and execution.

What is in this repo now:

- Core tool registration, native WebMCP wrapping, fallback invocation, validation, confirmations, events, planners, and form helpers.
- Optional Vue, React, and Svelte lifecycle helpers that delegate to core registration.
- Devtools, Playwright helpers, and a local MCP-style bridge for development and testing.
- An Astro + Vue + Cloudflare demo that exercises planner providers, Cloudflare Workers AI, and fallback behavior.

Packages are still private while the MVP API settles. See [Package Publishing Shape](./Dev-Docs/PACKAGE-PUBLISHING.md) for the release-readiness checklist and package boundary notes.

## Quick Start

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

For tools that change important state, add confirmation metadata and configure one app-level approval handler:

```ts
import { defineTool, registerTool, setConfirmationHandler } from '@webmcp-kit/core'

registerTool(defineTool({
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
    required: ['customerName', 'amount'],
    additionalProperties: false
  },
  confirmation: {
    required: true,
    reason: 'Creating an invoice changes business state.'
  },
  async execute(input) {
    return createInvoice(input)
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

## Core API

- `createWebMCPKit(options)` initializes the kit and optional planner provider.
- `defineTool(tool)` validates and preserves a typed tool definition.
- `registerTool(tool)` registers with native WebMCP when available and always stores the tool in the fallback registry.
- `invokeTool({ toolName, input, confirmed })` invokes fallback-registered tools for devtools, tests, and demos.
- `setConfirmationHandler(handler)` configures one global async confirmation provider for tools with `confirmation.required`.
- `listTools()` returns active registrations.
- `getRegistrySnapshot()` returns support mode, tool count, and registered tools.
- `isWebMCPSupported()` checks for native WebMCP registration support.
- `createBestPlanner()` uses Chrome built-in AI when available, otherwise a deterministic local planner.
- `installWebMCPKitTestBridge()` exposes a kit-specific test bridge for Playwright and local QA.

## Framework Helpers

The framework packages are intentionally thin lifecycle adapters. They register tools through `@webmcp-kit/core` and unregister them when the owning component scope is disposed.

- `@webmcp-kit/vue`: `useWebMCPTool()` for Vue effect scopes, with reactive `when` support.
- `@webmcp-kit/react`: `useWebMCPTool()` for React components.
- `@webmcp-kit/svelte`: `useWebMCPTool()` for Svelte components, including readable-store `when` support.

See [Vue](./docs/vue.md), [React](./docs/react.md), [Svelte](./docs/svelte.md), and [Framework Extensions](./docs/framework-extensions.md).

For copy-paste snippets, see [Examples](./docs/examples.md).

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

if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
  installWebMCPKitTestBridge()
}
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

The test bridge does not accept caller-provided confirmation bypasses. Confirmed tools still go through the app confirmation handler or browser confirmation fallback.

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
