# Getting started

This page registers one read action and one approved write, then calls them without a model. The [integration walkthrough](./integration.md) continues with an offline command input and optional persistent chat.

```sh
npm install @vampaz/webmcp-kit
```

```ts
import { defineTool, invokeTool, registerTools, setConfirmationHandler } from '@vampaz/webmcp-kit'

let counter = 0

const tools = registerTools([
  defineTool({
    name: 'read_counter',
    description: 'Read the current application counter.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    execute() {
      return { value: counter }
    }
  }),
  defineTool({
    name: 'set_counter',
    description: 'Set the application counter to a whole number from 0 to 100.',
    inputSchema: {
      type: 'object',
      properties: { value: { type: 'integer', minimum: 0, maximum: 100 } },
      required: ['value'],
      additionalProperties: false
    },
    confirmation: { reason: 'Change the counter?' },
    execute({ value }) {
      counter = value
      return { value }
    }
  })
])

// Replace with your application's dialog; only `true` approves.
const disposeApproval = setConfirmationHandler(function approve({ reason }) {
  return window.confirm(reason)
})

const result = await invokeTool({ toolName: 'set_counter', input: { value: 7 } })
// result.status is 'success', 'blocked' (denied), 'error', or 'unavailable'; check result.code.

// On teardown:
tools.unregister()
disposeApproval()
```

`registerTools()` registers the set atomically and returns one disposer. Input is validated against the schema before approval, so `{ value: 'seven' }` returns `invalid_input` without asking the user. With native browser WebMCP, agents discover the same tools; without it, the fallback registry serves the command input, Pi, devtools, and tests. During development, `mountDevtoolsOverlay()` from `/devtools` lists and invokes registered tools.

A module that registers at top level should also unregister in `import.meta.hot?.dispose()` so hot reload does not hit the duplicate-name check.

## Dependency model

WebMCP Kit is one ESM package. Core, command input, Pi, chat, devtools, testing, and the local bridge require no framework. Pi's implementation libraries are bundled into the distribution and remain isolated from core/chat imports.

Install `vue` for `/vue`, `react` for `/react`, `svelte` for `/svelte`, or `zod` for `/zod`. The accepted peer ranges are Vue 3.3+, React 18+, Svelte 4+, and Zod 4+. A declared range is not evidence that every version has been tested. The package requires Node 24 or newer for tooling, matching this repository's development version in `.nvmrc`.

Browser capabilities depend on the chosen surface; see [operations](./operations.md#browser-prerequisites). The kit supplies no default hosted inference endpoint. An offline core installation does not contact the demo service.
