# WebMCP Kit

WebMCP Kit is a local-first TypeScript toolkit for exposing real web app actions as safe, typed WebMCP tools. It lets apps register narrow actions with schemas, guards, confirmations, and lifecycle cleanup, then progressively connects those tools to native browser WebMCP, local devtools, tests, and planner-driven demos.

## Status

This repository is an early MVP. Chrome WebMCP and Chrome built-in AI are emerging browser capabilities, so the kit is designed as progressive enhancement:

1. Use native WebMCP when `document.modelContext.registerTool` is available.
2. Keep a fallback registry for unsupported browsers, tests, demos, and devtools.
3. Use Chrome built-in AI planning when `LanguageModel` is available.
4. Fall back to deterministic local planning when browser AI is unavailable.

The current aim is not to replace app code or invent a new agent runtime. The kit gives existing web apps a small adoption layer for making selected user-facing actions callable by browsers, tests, local tools, or planners while the app keeps ownership of validation, confirmation, authorization, and execution.

What is in this repo now:

- Core tool registration, native WebMCP wrapping, fallback invocation, validation, confirmations, events, planners, and form helpers.
- Optional Vue, React, and Svelte lifecycle helpers that delegate to core registration.
- Devtools, Playwright helpers, and a local MCP-style bridge for development and testing.
- A separate Astro + Vue + Cloudflare demo app in [vampaz/web-mcp-demo](https://github.com/vampaz/web-mcp-demo) that exercises planner providers, Cloudflare Workers AI, and fallback behavior.

The npm package name is `@vampaz/webmcp-kit`. Releases publish the compiled `dist` output to npm and GitHub Packages, then create a GitHub release tagged with the package version, when a new version reaches `master`.

## How It Fits

Consumers keep ownership of app state, tools, secrets, and approved planner endpoints. WebMCP Kit provides the browser-facing registration layer, the fallback registry, the command input, diagnostics, tests, and planner clients.

```mermaid
flowchart TB
  User["User command"]
  Consumer["Consumer app config<br/>tools, context, endpointOptions"]
  Command["WebMCP command input<br/>provider + model controls"]
  Choice{"Selected planner"}
  ChromeAI["Browser local<br/>Chrome built-in AI"]
  LocalPlanner["Browser local<br/>deterministic fallback"]
  Server["Consumer server endpoint<br/>/api/webmcp/plan"]
  Secrets["Server-owned secrets<br/>API keys + bindings"]
  Providers["Provider APIs<br/>OpenAI / OpenRouter / Workers AI"]
  Plan["Validated tool plan"]
  Registry["WebMCP tool registry<br/>native adapter + fallback"]
  Native["Optional integrations<br/>document.modelContext, devtools, tests, MCP bridge"]
  Tools["Consumer tools execute<br/>guards, confirmations, app state updates"]

  User --> Command
  Consumer --> Command
  Consumer --> Registry
  Command --> Choice
  Choice -->|"Chrome AI"| ChromeAI
  Choice -->|"local fallback"| LocalPlanner
  Choice -->|"server mode"| Server
  Server --> Secrets
  Server --> Providers
  ChromeAI --> Plan
  LocalPlanner --> Plan
  Providers --> Plan
  Plan --> Registry
  Registry --> Tools
  Registry -.-> Native
```

## Quick Start

If you already use Zod, install it alongside the kit and use the `@vampaz/webmcp-kit/zod` subpath to keep the schema and TypeScript input type in one place:

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
    description: 'Search the local product catalog.',
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
import { defineTool, registerTool } from '@vampaz/webmcp-kit'

registerTool(
  defineTool({
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
    annotations: {
      readOnlyHint: true
    },
    execute(input) {
      return searchProducts(String(input.query))
    }
  })
)
```

For tools that change important state, add confirmation metadata and configure one app-level approval handler:

```ts
import { defineTool, registerTool, setConfirmationHandler } from '@vampaz/webmcp-kit'

registerTool(
  defineTool({
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

## Core API

- `createWebMCPKit(options)` initializes the kit and optional planner provider.
- `defineTool(tool)` validates and preserves a typed tool definition.
- `registerTool(tool)` registers with native WebMCP when available and always stores the tool in the fallback registry. Native registration passes through WebMCP `annotations` such as `readOnlyHint` and unregisters with `AbortSignal` when supported by the browser.
- `invokeTool({ toolName, input, confirmed })` invokes fallback-registered tools for devtools, tests, and demos.
- `setConfirmationHandler(handler)` configures one global async confirmation provider for tools with `confirmation.required`.
- `listTools()` returns active registrations.
- `getRegistrySnapshot()` returns support mode, tool count, and registered tools.
- `getIntegrationHealthReport()` returns developer-facing diagnostics for missing tools, weak schemas, missing confirmation handlers, unavailable tools, and planner status.
- `assertWebMCPIntegration()` throws when the current integration has blocking errors.
- `isWebMCPSupported()` checks for native WebMCP registration support.
- `createBestPlanner()` uses Chrome built-in AI when available, otherwise a deterministic local planner.
- `defineWebMCPCommandInput()` registers a ready-made `<webmcp-command-input>` web component for planner-driven commands.
- `defineServerTool()` registers a browser-visible tool whose execution posts to an app-owned server endpoint.
- `validateToolPlan()` validates single-tool, chained, and planner-outcome plans before execution.
- `installWebMCPKitTestBridge()` exposes a kit-specific test bridge for Playwright and local QA.

## Planner Output

Planners normally return one tool invocation:

```ts
{
  toolName: 'select_items',
  input: { ids: ['item_4'] },
  confidence: 0.9,
  reason: 'Selected the matching item from the current app context.'
}
```

For requests that require multiple app actions, planners can return a bounded chained plan. The demo executor runs each step in order and stops on the first blocked, failed, or unavailable step:

```ts
{
  toolName: 'tool_sequence',
  input: {},
  confidence: 0.9,
  reason: 'Select matching invoices, then update their status.',
  steps: [
    {
      toolName: 'select_invoices',
      input: { ids: ['inv_104'] },
      confidence: 0.9,
      reason: 'Selected the matching Stark Industries invoice.'
    },
    {
      toolName: 'update_selected_invoice_status',
      input: { status: 'paid' },
      confidence: 0.9,
      reason: 'Marked the selected invoice as paid.'
    }
  ]
}
```

Each step is validated against its tool schema before execution. Confirmation is still enforced per tool invocation, so a chained plan cannot bypass approval for mutating tools.

When a request cannot be executed, planners can return a non-executing outcome:

```ts
{
  toolName: 'needs_clarification',
  input: {},
  confidence: 0,
  reason: 'Ask which invoice should be marked paid.'
}
```

`needs_clarification` returns a blocked result and `no_tools_match` returns an unavailable result. `tool_sequence`, `needs_clarification`, and `no_tools_match` are reserved names; app tools cannot register with those names.

## Integration Health

Use the health report while wiring WebMCP into an app:

```ts
import { getIntegrationHealthReport } from '@vampaz/webmcp-kit'

const report = getIntegrationHealthReport({ planner: kit.planner })

if (report.status !== 'ready') {
  console.table(report.diagnostics)
}
```

The report shape is intentionally small:

```ts
interface IntegrationHealthReport {
  status: 'ready' | 'warning' | 'error'
  summary: string
  diagnostics: Array<{
    severity: 'info' | 'warning' | 'error'
    title: string
    detail: string
    action: string
    toolName?: string
  }>
}
```

The devtools overlay shows the same report, so developers can see whether tools are registered, schemas are strict, confirmations are installed, and the selected planner is usable.

## Framework Helpers

The framework subpaths are intentionally thin lifecycle adapters. They register tools through `@vampaz/webmcp-kit` and unregister them when the owning component scope is disposed.

- `@vampaz/webmcp-kit/vue`: `useWebMCPTool()` for Vue effect scopes, with reactive `when` support.
- `@vampaz/webmcp-kit/react`: `useWebMCPTool()` for React components, with `when` as a boolean derived during render.
- `@vampaz/webmcp-kit/svelte`: `useWebMCPTool()` for Svelte components, including readable-store `when` support.

See [Vue](./docs/vue.md), [React](./docs/react.md), [Svelte](./docs/svelte.md), and [Framework Extensions](./docs/framework-extensions.md).

For copy-paste snippets, see [Examples](./docs/examples.md).

## Browser WebMCP References

WebMCP Kit tracks the browser proposal while keeping a local fallback for unsupported environments:

- [Chrome WebMCP Imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api)
- [Chrome WebMCP Declarative API](https://developer.chrome.com/docs/ai/webmcp/declarative-api)
- [Chrome WebMCP best practices](https://developer.chrome.com/docs/ai/webmcp/best-practices)
- [Chrome WebMCP evals](https://developer.chrome.com/docs/ai/webmcp/evals)
- [When to use WebMCP and MCP](https://developer.chrome.com/docs/ai/webmcp/compare-mcp)

## Planner Providers

Developers can pass a planner provider when initializing the kit:

```ts
import { createWebMCPKit } from '@vampaz/webmcp-kit'

const kit = await createWebMCPKit({
  planner: {
    provider: 'openrouter',
    model: 'nvidia/nemotron-3-super-120b-a12b:free',
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
    model: 'gpt-5.4-mini',
    auth: {
      mode: 'server',
      endpoint: '/api/webmcp/plan'
    }
  }
})
```

See [Planner Providers](./docs/planner-providers.md) for OpenRouter, OpenAI, OpenAI-compatible, Cloudflare Workers AI, Chrome built-in AI, and local fallback examples.

The demo also exposes `cloudflare-binding` in local, preview, and production deployments: a server-endpoint-only mode where the browser selects from approved Cloudflare Workers AI models and the Astro Cloudflare runtime endpoint uses an `AI` binding.

In production, the demo keeps planner controls hidden by default. To temporarily expose the provider/model controls in a browser, set `localStorage.setItem('webmcp:admin', 'true')` and reload the page.

## Ready-Made Command Input

Apps that want a drop-in natural-language command box can register the framework-agnostic web component:

```ts
import { defineWebMCPCommandInput } from '@vampaz/webmcp-kit'

defineWebMCPCommandInput()
```

```html
<webmcp-command-input
  provider="openai"
  model="gpt-5.4-mini"
  endpoint="/api/webmcp/plan"
></webmcp-command-input>
```

When `provider` and `model` are initialized by attributes or properties, the component treats them as app-owned configuration and does not show those settings to the user. If they are omitted, the component shows provider/model controls only when there is a real choice.

Chrome built-in AI is detected from the browser `LanguageModel` API and appears automatically when available. Consumers can hide it with `showChromeAI: false`.

For local development, leave `provider` and `model` unset and pass the endpoint options your app supports so developers can switch server-backed planners from the command box:

```ts
input.configure({
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
      label: 'GLM 4.7 Flash',
      model: '@cf/zai-org/glm-4.7-flash',
      provider: 'cloudflare-binding'
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

The demo follows this server-endpoint pattern in dev mode and passes an app-owned planner option for its demo-specific deterministic planner. Preview and production can pass the app-owned planner/provider/model to keep those choices hidden from end users. If the consumer provides only one option and Chrome AI is hidden or unavailable, the options panel is not rendered.

For app-owned planner objects, pass `plannerOptions`. Use `initialPlannerOptionId` and `initialModel` to set development defaults without fixing the provider for users. When a planner option exposes `modelOptions`, the selected model option is passed to `createPlanner({ model, modelOption })`, so app-owned planners can attach metadata such as context-window size without adding provider-specific fields to core.

```ts
interface BrowserLocalAIModelOption {
  contextWindowSize?: number
  label: string
  model: string
}

const browserLocalAIModels: BrowserLocalAIModelOption[] = [
  {
    label: 'Qwen3.5 4B (8k context)',
    model: 'Qwen3.5-4B-q4f16_1-MLC',
    contextWindowSize: 8192
  }
]

input.configure({
  initialPlannerOptionId: 'browser-local-ai',
  plannerOptions: [
    {
      id: 'browser-local-ai',
      label: 'Browser local AI',
      modelOptions: browserLocalAIModels,
      createPlanner(options) {
        const modelOption = options?.modelOption as BrowserLocalAIModelOption | undefined

        return createBrowserLocalAIPlanner({
          model: options?.model ?? browserLocalAIModels[0].model,
          contextWindowSize: modelOption?.contextWindowSize
        })
      }
    }
  ],
  settingsOpen: false
})
```

For app context, assign a property before or after mounting:

```ts
import type { WebMCPCommandInputElement } from '@vampaz/webmcp-kit'

const input = document.querySelector<WebMCPCommandInputElement>('webmcp-command-input')

if (input) {
  input.context = function getPlannerContext() {
    return {
      route: location.pathname,
      selectedIds: getSelectedIds()
    }
  }
}
```

The component uses the active WebMCP registry, plans against registered tools, invokes the returned step or bounded `tool_sequence`, and emits `webmcp-command-plan`, `webmcp-command-step`, `webmcp-command-result`, and `webmcp-command-error` events. `run(message, { signal })` accepts an `AbortSignal` for cancelling commands before planning or between sequence steps; remote planner fetches receive the same signal.

## Playwright Helpers

Apps can install the test bridge in development or test builds:

```ts
import { installWebMCPKitTestBridge } from '@vampaz/webmcp-kit'

if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
  installWebMCPKitTestBridge()
}
```

Playwright tests can then inspect and invoke tools through the page:

```ts
import { invokeWebMCPTool, waitForWebMCPTool } from '@vampaz/webmcp-kit/testing/playwright'

await waitForWebMCPTool(page, 'select_items')
await invokeWebMCPTool(page, {
  toolName: 'select_items',
  input: { ids: ['item_4', 'item_7'] },
  source: 'planner'
})
```

The test bridge does not accept caller-provided confirmation bypasses. Confirmed tools still go through the app confirmation handler or browser confirmation fallback.

## Demo App

The standalone demo lives in [vampaz/web-mcp-demo](https://github.com/vampaz/web-mcp-demo). For side-by-side local development, clone it next to this repository so its `@vampaz/webmcp-kit` dependency can resolve from `file:../web-mcp`.

That repo owns the Astro app, Cloudflare Worker config, Workers AI binding, and e2e demo coverage.

## Development

```sh
npm run test
npm exec tsc -- --noEmit
```

Production builds are intentionally not part of the normal verification loop yet.
