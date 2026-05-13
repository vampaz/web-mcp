# Getting Started

WebMCP Kit is a framework-agnostic TypeScript toolkit for exposing app actions to native WebMCP when available, plus local fallback tooling for development and tests.

## Install

```sh
npm install @webmcp-kit/core
```

Add devtools only when you want the browser overlay:

```sh
npm install @webmcp-kit/devtools
```

## Register A Tool

```ts
import { defineTool, registerTool } from '@webmcp-kit/core'

const registration = registerTool(defineTool({
  name: 'search_products',
  description: 'Search the local product catalog for products matching the shopper request.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Product name or category to search for.'
      }
    },
    required: ['query'],
    additionalProperties: false
  },
  execute(input) {
    return searchProducts(String(input.query ?? ''))
  }
}))

function searchProducts(query: string) {
  return []
}

registration.unregister()
```

When native WebMCP is present, the tool is registered with the browser. The same tool is also available in the local fallback registry for devtools and tests.

## Add Devtools

```ts
import { mountDevtoolsOverlay } from '@webmcp-kit/devtools'

const devtools = mountDevtoolsOverlay({ initiallyOpen: true })

devtools.destroy()
```

## Test Tools

```ts
import { installWebMCPKitTestBridge } from '@webmcp-kit/core'

installWebMCPKitTestBridge()
```

Playwright tests can then import helpers from `@webmcp-kit/testing/playwright`.
