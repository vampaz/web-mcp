# WebMCP Kit

Expose application actions as typed tools. WebMCP Kit connects those actions to native browser WebMCP, resolvers, tests, and optional chat. Your application owns state, approval, authorization, and execution.

The core, command input, Pi controller, and chat custom element work without a framework. Optional Vue, React, and Svelte helpers manage tool registration in their component lifecycles.

Version **0.4.0** introduces breaking API changes. See the [migration guide](./docs/migration-0.4.md) when upgrading from 0.3.

## Quick start

Install the package:

```sh
npm install @vampaz/webmcp-kit
```

Register one action. This example works without a model, endpoint, framework, or browser WebMCP support:

```ts
import { defineTool, invokeTool, registerTool } from '@vampaz/webmcp-kit'

const registration = registerTool(
  defineTool({
    name: 'read_counter',
    description: 'Read the current application counter.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    execute() {
      return { value: 7 }
    }
  })
)

const result = await invokeTool({ toolName: 'read_counter', input: {} })
console.log(result.output)
registration.unregister()
```

Replace the example handler with an action your normal interface already uses. Keep schemas narrow. Add `confirmation: { reason }` for important mutations and install your application's approval UI with `setConfirmationHandler()`.

## Choose the surfaces you need

| Import                            | Purpose                                                              |
| --------------------------------- | -------------------------------------------------------------------- |
| `@vampaz/webmcp-kit`              | Tools, registry, validation, approval, resolvers, diagnostics, forms |
| `/command-input`                  | One-command custom element and `initWebMCP()`                        |
| `/pi`                             | Persistent Pi controller running in the page                         |
| `/chat`                           | Chat custom element driven by a supplied controller                  |
| `/hosted`                         | Optional hosted session and resolver integration                     |
| `/vue`, `/react`, `/svelte`       | Component lifecycle helpers                                          |
| `/zod`                            | Zod schemas and parsing before approval                              |
| `/devtools`                       | Tool inspection and invocation overlay                               |
| `/testing`, `/testing/playwright` | Test bridge, evaluations, browser helpers                            |
| `/mcp-bridge`                     | Local message adapter for `tools/list` and `tools/call`              |

The package bundles its Pi implementation libraries. Consumers do not install them separately. Framework and Zod peers are optional and needed only for their own entry points. Core and chat imports do not load Pi. All entry points are ESM and support Bundler and NodeNext declaration resolution.

The MCP bridge is retained as a local adapter. An external MCP client still needs a transport and connection lifecycle; that work is backlogged.

## Add command resolution or conversations

Use `await createResolver({ provider: 'local' })` for deterministic offline commands. Automatic selection uses Chrome AI when available and otherwise deterministic resolution. Explicit provider choices report failures without switching providers.

For conversation, supply an available resolver with `capabilities.conversation: true` to `createPiHarness()`. Pi runs in the page using IndexedDB and Web Locks. It needs no service worker, separate worker build, or framework adapter. Each turn chooses one action, waits for its actual result, and resolves the next step.

Chat is independent: configure `<webmcp-chat>` with a Pi controller or your own compatible controller. Application approval stays separate from chat.

## Documentation

- [Integration walkthrough](./docs/integration.md): register a tool, add commands, then optional persistent chat.
- [Documentation index](./docs/README.md): framework guides, examples, and API contracts.
- [Resolver providers](./docs/resolver-providers.md): local, browser, remote, and hosted inference.
- [Pi](./docs/pi.md) and [chat](./docs/chat.md): storage, cancellation, ownership, and UI.
- [Security](./docs/security.md): validation, approval, and server authorization.
- [Operations](./docs/operations.md): HTTPS, package checks, release, and troubleshooting.
- [API reference](./docs/api-reference.md): generated public declarations with source links.
- [Changelog](./CHANGELOG.md) and [contributing](./CONTRIBUTING.md).

The [local lab](./apps/demo/README.md) and the independent [WebMCP demo](https://github.com/vampaz/web-mcp-demo) exercise the kit. Deterministic browser tests and separately authorized real-model checks provide different evidence.
