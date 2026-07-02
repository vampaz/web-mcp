# Getting Started

WebMCP Kit is a framework-agnostic TypeScript toolkit for exposing app actions to native WebMCP when available, plus local fallback tooling for development and tests.

## Package Shape

In this repository, the root `@vampaz/webmcp-kit` package is the library. It exposes the core API from the package root plus focused subpath exports:

- `@vampaz/webmcp-kit`
- `@vampaz/webmcp-kit/devtools`
- `@vampaz/webmcp-kit/testing`
- `@vampaz/webmcp-kit/mcp-bridge`
- `@vampaz/webmcp-kit/vue`
- `@vampaz/webmcp-kit/react`
- `@vampaz/webmcp-kit/svelte`
- `@vampaz/webmcp-kit/zod`

The standalone demo app lives in [vampaz/web-mcp-demo](https://github.com/vampaz/web-mcp-demo). During side-by-side local development it consumes this package through `file:../web-mcp`. Published apps install the single library package from npm.

## Install

```sh
npm install @vampaz/webmcp-kit
```

## One-Call Setup

`initWebMCP()` covers the common wiring in a single call: it registers your tools, defines the `<webmcp-command-input>` element (creating a floating one when the page has none), and configures a hosted planner when you pass a publishable key:

```ts
import { defineTool, initWebMCP } from '@vampaz/webmcp-kit'

const handle = initWebMCP({
  accessKey: import.meta.env.VITE_WEBMCP_PUBLISHABLE_KEY,
  baseUrl: 'https://webmcp.conekto.eu',
  model: 'gpt-5.4-mini',
  context: () => ({ route: location.pathname }),
  tools: [
    /* defineTool(...) definitions */
  ]
})

// Later: handle.destroy() unregisters the tools and removes a created element.
```

The rest of this guide covers the same pieces individually for apps that need finer control.

## Register A Tool

Use `@vampaz/webmcp-kit/zod` when a Zod schema should be the source of truth for runtime validation and TypeScript inference:

```sh
npm install @vampaz/webmcp-kit zod
```

```ts
import { registerTool } from '@vampaz/webmcp-kit'
import { defineZodTool } from '@vampaz/webmcp-kit/zod'
import { z } from 'zod'

registerTool(
  defineZodTool({
    name: 'search_products',
    description: 'Search the local product catalog for products matching the shopper request.',
    schema: z.object({
      query: z.string().describe('Product name or category to search for.')
    }),
    annotations: {
      readOnlyHint: true
    },
    execute(input) {
      return searchProducts(input.query)
    }
  })
)
```

The core package also accepts explicit JSON Schema:

```ts
import { defineTool, objectInputSchema, registerTool, stringParam } from '@vampaz/webmcp-kit'

const registration = registerTool(
  defineTool({
    name: 'search_products',
    description: 'Search the local product catalog for products matching the shopper request.',
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
      return searchProducts(String(input.query ?? ''))
    }
  })
)

function searchProducts(query: string) {
  return []
}

registration.unregister()
```

When native WebMCP is present, the tool is registered with the browser. The same tool is also available in the local fallback registry for devtools and tests.

Use `annotations.readOnlyHint` for tools that only read or reveal state, and leave it unset or `false` for tools that change app state. Mutating tools that affect important state should also use confirmation metadata.

## Upgrade A Form

```ts
import { registerFormTool } from '@vampaz/webmcp-kit'

const form = document.querySelector<HTMLFormElement>('form')

if (form) {
  registerFormTool({
    form,
    name: 'create_support_ticket',
    description: 'Create a support ticket from the visible support form.',
    fields: {
      email: {
        title: 'Customer email',
        description: 'Email address that receives the support reply.'
      }
    }
  })
}
```

`registerFormTool()` applies `toolname` and `tooldescription` to the form, prefers official `toolparamdescription` and `toolparamtitle` field metadata, and infers useful schema details from native inputs such as `email`, `date`, `time`, and `select`.

## Delegate A Tool To The Server

Use `defineServerTool()` when an action needs app-owned secrets, a private API, email, payments, or database access.

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

The browser-visible tool still runs validation, scope, confirmation, and guards before posting `{ toolName, input, source }` to the endpoint.

## Add Devtools

```ts
import { mountDevtoolsOverlay } from '@vampaz/webmcp-kit/devtools'

const devtools = mountDevtoolsOverlay({ initiallyOpen: true })

devtools.destroy()
```

## Add A Command Input

Apps can use the built-in command input for natural-language planning against registered tools. The app supplies server-backed endpoint options; WebMCP Kit detects Chrome built-in AI from the browser when available.

```ts
import { defineWebMCPCommandInput, type WebMCPCommandInputElement } from '@vampaz/webmcp-kit'

defineWebMCPCommandInput()

const input = document.querySelector<WebMCPCommandInputElement>('webmcp-command-input')

input?.configure({
  context: getPlannerContext,
  endpoint: '/api/webmcp/plan',
  endpointOptions: [
    {
      label: 'GPT-5.4 mini',
      model: 'gpt-5.4-mini',
      provider: 'openai'
    },
    {
      label: 'Nemotron 3 Super 120B A12B',
      model: 'nvidia/nemotron-3-super-120b-a12b:free',
      provider: 'openrouter'
    },
    {
      label: 'Auto',
      provider: 'auto'
    },
    {
      label: 'Local deterministic',
      provider: 'local'
    }
  ]
})
```

Use `showChromeAI: false` when a consumer wants to hide the detected local Chrome AI provider.

## Test Tools

```ts
import { installWebMCPKitTestBridge } from '@vampaz/webmcp-kit'

if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
  installWebMCPKitTestBridge()
}
```

Playwright tests can then import helpers from `@vampaz/webmcp-kit/testing/playwright`.
