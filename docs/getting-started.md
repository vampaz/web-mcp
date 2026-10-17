# Getting Started

[Documentation index](./README.md) · [Complete integration](./integration.md) · [API reference](./api-reference.md)

WebMCP Kit is a framework-agnostic TypeScript toolkit for exposing app actions to native WebMCP when available, plus local fallback tooling for development and tests.

## Package Shape

In this repository, the root `@vampaz/webmcp-kit` package is the library. It exposes the core API from the package root plus focused subpath exports:

- `@vampaz/webmcp-kit`
- `@vampaz/webmcp-kit/devtools`
- `@vampaz/webmcp-kit/testing`
- `@vampaz/webmcp-kit/testing/playwright`
- `@vampaz/webmcp-kit/mcp-bridge`
- `@vampaz/webmcp-kit/vue`
- `@vampaz/webmcp-kit/react`
- `@vampaz/webmcp-kit/svelte`
- `@vampaz/webmcp-kit/zod`
- `@vampaz/webmcp-kit/pi` (unreleased)
- `@vampaz/webmcp-kit/pi/worker` (unreleased)
- `@vampaz/webmcp-kit/chat` (unreleased)

The directories under `packages/` are source modules in this one npm package, not separate npm workspaces. The [local lab](../apps/demo/README.md) runs from this repository. The standalone demo app lives in [vampaz/web-mcp-demo](https://github.com/vampaz/web-mcp-demo) and has its own setup. Published apps install the single library package from npm.

## Install

```sh
npm install @vampaz/webmcp-kit
```

## Dependency model

The [root manifest](../package.json) has no unconditional `dependencies`. Every external runtime import is declared in `peerDependencies`; `peerDependenciesMeta` marks those peers optional because each belongs to a specific integration. npm does not install optional peers automatically. Install the peers for the imports you use as dependencies of your application.

| Import or feature                                                   | Runtime packages supplied by the application                                   |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Core, `/devtools`, `/mcp-bridge`, `/testing`, `/testing/playwright` | None                                                                           |
| `/chat` with an application-supplied controller                     | None                                                                           |
| `/react`                                                            | `react`                                                                        |
| `/svelte`                                                           | `svelte`                                                                       |
| `/vue`                                                              | `vue`                                                                          |
| `/zod`                                                              | `zod`                                                                          |
| Pi runtime and `/pi/worker`                                         | `@earendil-works/chord`, `@earendil-works/pi-ai`, `@earendil-works/pi-durable` |

Optional means unnecessary when that feature is unused. It does not mean a selected integration can run without its peers. The Pi runtime's peers have their own transitive dependencies. Core and chat with an application-supplied controller do not load that runtime. The Playwright helpers accept a structurally compatible page supplied by the caller; the kit does not import Playwright at runtime.

The same seven peer packages also appear in this repository's `devDependencies` so development, builds, declarations, and tests can exercise every entry point. This does not install two copies or make consumers install the repository's development tools. See [npm's optional-peer behavior](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#peerdependenciesmeta).

The remaining development dependencies serve these repository tasks:

| Purpose                                 | Packages                                                                   |
| --------------------------------------- | -------------------------------------------------------------------------- |
| Build, declarations, and typechecking   | `vite`, `@vitejs/plugin-vue`, `vite-plugin-dts`, `typescript`, `vue-tsc`   |
| Type declarations for development       | `@types/node`, `@types/react`                                              |
| Tests and browser fixtures              | `vitest`, `@playwright/test`, `@vue/test-utils`, `jsdom`, `fake-indexeddb` |
| Linting and formatting                  | `oxlint`, `oxfmt`                                                          |
| Local HTTPS and secure browser fixtures | `@vampaz/vite-plugin-local-tls`                                            |

Version constraints live in `package.json`; exact installed versions live in `package-lock.json`. Use `npm ci --ignore-scripts` to reproduce the development tree without running the package's prepare build. See [Pi installation](./integration.md#1-choose-the-integration) for the currently unreleased runtime and [operations](./operations.md#validation-in-this-repository) for consumer verification.

## One-Call Setup

`initWebMCP()` covers the common wiring in a single call: it registers your tools, defines the `<webmcp-command-input>` element (creating a floating one when the page has none), and configures a hosted planner when you pass a publishable key:

```ts
import { defineTool, initWebMCP } from '@vampaz/webmcp-kit'

const handle = initWebMCP({
  accessKey: import.meta.env.VITE_WEBMCP_PUBLISHABLE_KEY,
  baseUrl: 'https://webmcp.conekto.eu',
  model: 'gpt-5.4-mini',
  context: () => ({ route: location.pathname }),
  tools: [/* defineTool(...) definitions */]
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

// Call during route/component teardown:
registration.unregister()
```

`registration.ready` resolves after native registration settles. The fallback registry is usable immediately; if native registration fails asynchronously, the registration switches to fallback mode and records a warning.

When native WebMCP is present, the tool is registered with the browser. The same tool is also available in the local fallback registry for devtools and tests.

Explicit schemas support `anyOf`, `oneOf`, `enum`, and `const` alongside the object, array, string, number, integer, boolean, and null types. The known string formats `email`, `date`, `time`, `date-time`, and `uri` receive built-in checks; custom format names remain annotations.

Use `annotations.readOnlyHint` for tools that only read or reveal state, and leave it unset or `false` for tools that change app state. Mutating tools that affect important state should also use confirmation metadata.

## Upgrade A Form

```ts
import { registerFormTool } from '@vampaz/webmcp-kit'

const form = document.querySelector<HTMLFormElement>('form')

if (form) {
  registerFormTool({
    form,
    name: 'prepare_support_ticket',
    description: 'Fill and validate the visible support form without submitting it.',
    fields: {
      email: {
        title: 'Customer email',
        description: 'Email address that receives the support reply.'
      }
    }
  })
}
```

`registerFormTool()` applies `toolname` and `tooldescription` to the form, prefers official `toolparamdescription` and `toolparamtitle` field metadata, and infers useful schema details from native inputs such as `email`, `date`, `time`, and `select`. In a browser with WebMCP support, those attributes provide the native declarative registration while the kit keeps its fallback registry; the helper does not also submit a duplicate imperative registration. Calling the returned registration's `unregister()` restores the form and field metadata attributes that existed before registration.

The kit's default execution returns `FormData`; it does not submit the form. Supply `execute(input, form)` and confirmation for an application submission action. A browser's declarative form submission does not call the kit's imperative wrapper, so the actual submit handler must enforce the application's approval and authorization rules too.

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

// Call during teardown:
devtools.destroy()
```

## Add A Command Input

Apps can use the built-in command input for natural-language planning against currently scope-available registered tools. The app supplies server-backed endpoint options; WebMCP Kit detects Chrome built-in AI from the browser when available.

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

## Persistent conversation and independent chat

For a result-driven conversation, configure the [Pi controller](./pi.md), compile an application-owned worker, and optionally mount [webmcp-chat](./chat.md). Core tools and application confirmations stay authoritative. The existing command input continues to provide bounded Planner mode. Try all three surfaces in the [local package lab](../apps/demo/README.md).
