# Getting Started

WebMCP Kit is a framework-agnostic TypeScript toolkit for exposing app actions to native WebMCP when available, plus local fallback tooling for development and tests.

## Local Workspace

In this repository, the packages are local npm workspace packages:

- `@webmcp-kit/core`
- `@webmcp-kit/devtools`
- `@webmcp-kit/testing`
- `@webmcp-kit/mcp-bridge`

Use normal workspace imports while developing the kit. After the packages are made public, apps will install them from npm.

## Future npm Install

```sh
npm install @webmcp-kit/core
npm install @webmcp-kit/devtools
```

## Register A Tool

```ts
import { defineTool, objectInputSchema, registerTool, stringParam } from '@webmcp-kit/core'

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
import { registerFormTool } from '@webmcp-kit/core'

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

## Add Devtools

```ts
import { mountDevtoolsOverlay } from '@webmcp-kit/devtools'

const devtools = mountDevtoolsOverlay({ initiallyOpen: true })

devtools.destroy()
```

## Add A Command Input

Apps can use the built-in command input for natural-language planning against registered tools. The app supplies server-backed endpoint options; WebMCP Kit detects Chrome built-in AI from the browser when available.

```ts
import { defineWebMCPCommandInput, type WebMCPCommandInputElement } from '@webmcp-kit/core'

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
import { installWebMCPKitTestBridge } from '@webmcp-kit/core'

if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
  installWebMCPKitTestBridge()
}
```

Playwright tests can then import helpers from `@webmcp-kit/testing/playwright`.
