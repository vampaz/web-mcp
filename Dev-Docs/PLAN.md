# Plan: WebMCP Kit Reference Implementation

## Objective

Build **WebMCP Kit**, a ready-made TypeScript toolkit that makes it easy to add WebMCP tools to real web apps. The kit should register tools with native WebMCP browser APIs when available, provide useful fallbacks for development and testing, and ship framework-agnostic APIs plus recipes that make the emerging WebMCP capability practical today.

This is not a new protocol. It is an adoption layer for WebMCP.

## Current Implementation Status

- `packages/core`, `packages/testing`, `packages/devtools`, and `packages/mcp-bridge` are implemented as local npm workspace packages and covered by tests.
- The devtools overlay lives in `packages/devtools`; core remains framework-agnostic.
- The active demo is the Astro app in `demo/src/pages/index.astro` and `demo/src/components/WebMcpDemo.vue`.
- Planner providers now support Chrome built-in AI, deterministic fallback, server endpoints, user-provided OpenAI-compatible keys, Cloudflare REST, and Cloudflare binding mode.
- Cloudflare binding mode is wired through the Astro Cloudflare adapter, `demo/wrangler.toml`, and `demo/src/pages/api/webmcp/plan.ts`.
- `demo/wrangler.toml` is already configured for the existing Cloudflare project/Worker named `web-mcp`.

---

- [x] Phase 1: Package Foundation
  - [x] Step 1.1: Initialize monorepo with npm workspaces
    - Files: `package.json`, `package-lock.json`, `.npmrc`
    - Verify: `npm install` succeeds
  - [x] Step 1.2: Create framework-agnostic workspace package structure
    - Files: `packages/core/package.json`, `packages/testing/package.json`, `packages/devtools/package.json`, `packages/mcp-bridge/package.json`
    - Verify: workspace package discovery works
  - [x] Step 1.3: Add strict TypeScript and test setup
    - Files: `vitest.config.ts`, `packages/*/tsconfig.json`
    - Verify: `npm run test` runs successfully

- [x] Phase 2: Core Tool Model
  - [x] Step 2.1: Define tool interfaces
    - Files: `packages/core/src/interfaces/tool.ts`
    - Verify: type tests cover tool name, description, schema, scope, guard, confirmation, and execute handler
  - [x] Step 2.2: Implement `defineTool()`
    - Files: `packages/core/src/define-tool.ts`
    - Verify: schema tests cover invalid tool definitions
  - [x] Step 2.3: Implement runtime schema validation
    - Files: `packages/core/src/schema.ts`
    - Verify: invalid tool definitions return actionable errors
  - [x] Step 2.4: Implement initial tool quality checks
    - Files: `packages/core/src/quality.ts`
    - Verify: vague names, missing descriptions, weak schemas, and destructive tools without confirmation produce warnings
  - [x] Step 2.5: Export public core API
    - Files: `packages/core/src/index.ts`
    - Verify: all public exports are covered by tests

- [x] Phase 3: Native WebMCP Adapter
  - [x] Step 3.1: Add WebMCP feature detection
    - Files: `packages/core/src/support.ts`
    - Verify: tests cover native, partial, and missing `navigator.modelContext` states
  - [x] Step 3.2: Implement native registration adapter
    - Files: `packages/core/src/native-adapter.ts`
    - Verify: calls `navigator.modelContext.registerTool` when available
  - [x] Step 3.3: Normalize native API compatibility
    - Files: `packages/core/src/native-adapter.ts`
    - Verify: compatibility warnings are produced for unexpected native API shapes
  - [x] Step 3.4: Add unregister/update abstraction
    - Files: `packages/core/src/native-adapter.ts`, `packages/core/src/registry.ts`
    - Verify: works whether native registration returns a handle or not

- [x] Phase 4: Fallback Registry
  - [x] Step 4.1: Build local fallback registry
    - Files: `packages/core/src/registry.ts`
    - Verify: registered tools can be listed and invoked in unsupported browsers
  - [x] Step 4.2: Implement scoped availability
    - Files: `packages/core/src/registry.ts`
    - Verify: unavailable tools include structured reasons
  - [x] Step 4.3: Implement guards and confirmations
    - Files: `packages/core/src/registry.ts`
    - Verify: guards run before handlers and confirmation policies are enforced
  - [x] Step 4.4: Add invocation events
    - Files: `packages/core/src/events.ts`
    - Verify: registration, invocation, success, failure, and blocked events are emitted
  - [x] Step 4.5: Expose dev/test-only global access
    - Files: `packages/core/src/test-bridge.ts`
    - Verify: fallback tools can be inspected in development without defining a competing protocol global

- [x] Phase 5: Declarative Form Helpers
  - [x] Step 5.1: Add form attribute helpers
    - Files: `packages/core/src/forms.ts`
    - Verify: helpers apply `toolname` and `tooldescription` attributes
  - [x] Step 5.2: Add explicit form tool registration
    - Files: `packages/core/src/forms.ts`
    - Verify: form submissions can be described as tools with explicit schemas
  - [x] Step 5.3: Add safe schema inference for forms
    - Files: `packages/core/src/forms.ts`
    - Verify: common input types map to JSON Schema with tests
  - [x] Step 5.4: Warn on risky form tools
    - Files: `packages/core/src/forms.ts`, `packages/core/src/quality.ts`
    - Verify: missing validation, vague descriptions, and sensitive fields produce warnings

- [x] Phase 6: Devtools Overlay
  - [x] Step 6.1: Build framework-free overlay shell
    - Files: `packages/devtools/src/devtools.ts`
    - Verify: overlay mounts in a test DOM
  - [x] Step 6.2: List registered tools
    - Files: `packages/devtools/src/devtools.ts`
    - Verify: list shows native/fallback mode, availability, schema, and warnings
  - [x] Step 6.3: Add manual invocation panel
    - Files: `packages/devtools/src/devtools.ts`
    - Verify: generated sample input can invoke a fallback tool
  - [x] Step 6.4: Add richer invocation history and replay
    - Files: `packages/devtools/src/devtools.ts`
    - Verify: history captures input, output, errors, timings, and guard decisions
  - [x] Step 6.5: Add prompt preview and quality score
    - Files: `packages/devtools/src/devtools.ts`, `packages/core/src/quality.ts`
    - Verify: poor definitions have visible, actionable warnings

- [x] Phase 8: Adapters
  - [x] Step 8.1: Add OpenAI tool formatter
    - Files: `packages/core/src/adapters/openai.ts`
    - Verify: tool definitions convert to OpenAI-compatible function/tool schemas
  - [x] Step 8.2: Add local MCP bridge prototype
    - Files: `packages/mcp-bridge/src/index.ts`
    - Verify: fallback-registered tools can be listed and invoked from a local MCP client in development
  - [x] Step 8.3: Add docs/catalog export
    - Files: `packages/core/src/adapters/catalog.ts`
    - Verify: produces Markdown and JSON catalogs
  - [x] Step 8.4: Add Playwright helpers
    - Files: `packages/testing/src/playwright.ts`, `packages/core/src/test-bridge.ts`
    - Verify: tests can list and invoke fallback tools from `page`

- [x] Phase 8.5: Planner Providers
  - [x] Step 8.5.1: Add provider config and kit initialization
    - Files: `packages/core/src/interfaces/tool.ts`, `packages/core/src/kit.ts`
    - Verify: configured planner initializes from `createWebMCPKit()`
  - [x] Step 8.5.2: Add remote OpenAI-compatible planning
    - Files: `packages/core/src/planner.ts`
    - Verify: server endpoint and user-key modes are covered by tests
  - [x] Step 8.5.3: Add development provider selector
    - Files: `demo/src/components/WebMcpDemo.vue`
    - Verify: Chrome Beta E2E can select OpenRouter with a user key
  - [x] Step 8.5.4: Add Cloudflare binding planner mode
    - Files: `packages/core/src/planner.ts`, `demo/src/components/WebMcpDemo.vue`, `docs/planner-providers.md`
    - Verify: unit and E2E tests cover model selection through the mocked binding endpoint
  - [x] Step 8.5.5: Wire Astro Cloudflare adapter for AI bindings
    - Files: `demo/astro.config.mjs`, `demo/wrangler.toml`, `demo/src/worker.ts`, `demo/src/pages/api/webmcp/plan.ts`
    - Verify: route tests cover planning through the Cloudflare `AI` binding shape

- [x] Phase 9: Demo Application
  - [x] Step 9.1: Build Astro demo
    - Files: `demo/astro.config.mjs`, `demo/src/pages/index.astro`, `demo/src/components/WebMcpDemo.vue`
    - Verify: dev overlay appears in dev mode
  - [x] Step 9.2: Build Vue invoice workflow
    - Files: `demo/src/components/WebMcpDemo.vue`
    - Verify: create-invoice tool is registered with confirmation metadata and updates demo state
  - [x] Step 9.3: Build product/cart workflow in the active demo
    - Files: `demo/src/components/WebMcpDemo.vue`
    - Verify: search, add-to-cart, and checkout tools use guards and confirmations
  - [x] Step 9.4: Build support workflow
    - Files: `demo/src/components/WebMcpDemo.vue`
    - Verify: create-ticket tool demonstrates form helpers and schema inference
  - [x] Step 9.5: Add browser support indicator
    - Files: `demo/src/components/WebMcpDemo.vue`
    - Verify: page clearly distinguishes native WebMCP from fallback mode

- [x] Phase 10: Documentation
  - [x] Step 10.1: Write project README
    - Files: `README.md`
    - Verify: states clearly that WebMCP Kit is not a new protocol
  - [x] Step 10.2: Write getting started guide
    - Files: `docs/getting-started.md`
    - Verify: first tool example works in plain JS
  - [x] Step 10.3: Write browser support guide
    - Files: `docs/browser-support.md`
    - Verify: documents native WebMCP, Early Preview status, feature detection, and fallback behavior
  - [x] Step 10.4: Write security guide
    - Files: `docs/security.md`
    - Verify: covers untrusted inputs, permissions, confirmations, redaction, and audit hooks
  - [x] Step 10.5: Write framework guides
    - Files: `docs/vue.md`, `docs/react.md`, `docs/svelte.md`, `docs/astro.md`
    - Verify: each guide shows lifecycle-safe registration
  - [x] Step 10.6: Write planner provider guide
    - Files: `docs/planner-providers.md`
    - Verify: documents server mode, user-key mode, Chrome built-in AI, Cloudflare binding mode, and model selection

- [x] Phase 11: Verification
  - [x] Step 11.1: Unit test implemented packages
    - Files: `packages/**/*.spec.ts`
    - Verify: `npm run test`
  - [x] Step 11.2: Add integration tests for fallback mode
    - Files: `tests/integration/fallback.spec.ts`
    - Verify: unsupported browser environments still expose dev/test registry
  - [x] Step 11.3: Add browser smoke tests for planner and fallback behavior
    - Files: `demo/tests/e2e/webmcp-demo.spec.ts`
    - Verify: Chrome Beta tests cover Chrome AI, local fallback, provider selection, and test bridge helpers
  - [x] Step 11.4: Add Lighthouse documentation check
    - Files: `docs/browser-support.md`
    - Verify: docs explain how to inspect registered WebMCP tools in supported Chrome/Lighthouse environments

- [x] Phase 12: Optional Framework Extensions
  - [x] Step 12.1: Document Vue lifecycle recipe
    - Files: `docs/vue.md`
    - Verify: recipe registers on mount and unregisters on unmount using framework-agnostic core APIs
  - [x] Step 12.2: Document React lifecycle recipe
    - Files: `docs/react.md`
    - Verify: recipe registers on effect and unregisters on cleanup using framework-agnostic core APIs
  - [x] Step 12.3: Document Svelte lifecycle recipe
    - Files: `docs/svelte.md`
    - Verify: recipe registers and unregisters using framework-agnostic core APIs
  - [x] Step 12.4: Consider thin optional wrapper packages only after core adoption
    - Files: `docs/framework-extensions.md`
    - Verify: decision keeps framework packages deferred and requires any future wrapper to delegate behavior to `@webmcp-kit/core`

---

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                         Web App                               │
│                                                               │
│  Plain JS      Vue           React         Svelte       Astro │
│     │           │              │             │            │   │
│     └───────────┴──────────────┴─────────────┴────────────┘   │
│                              │                                │
│                              ▼                                │
│                    @webmcp-kit/core                           │
│                                                               │
│   defineTool()  registerTool()  guards  scopes  confirmations │
│                              │                                │
│              ┌───────────────┼────────────────┐              │
│              ▼               ▼                ▼              │
│      Native WebMCP      Fallback Registry    Events           │
│      navigator.         dev/test/non-native  analytics        │
│      modelContext       browsers             audit hooks      │
│              │               │                │              │
│              ▼               ▼                ▼              │
│       Browser Agent      Devtools Overlay    Adapters          │
│                          Test Helpers       MCP/OpenAI/docs    │
└───────────────────────────────────────────────────────────────┘
```

## The Core API

```typescript
import { defineTool, registerTool } from '@webmcp-kit/core'

const tool = defineTool({
  name: 'create_invoice',
  description: 'Create an invoice for a customer and open it in the current workspace.',
  inputSchema: {
    type: 'object',
    properties: {
      customerId: {
        type: 'string',
        description: 'The customer ID to invoice.'
      },
      amount: {
        type: 'number',
        minimum: 0.01,
        description: 'The invoice amount.'
      }
    },
    required: ['customerId', 'amount']
  },
  confirmation: {
    required: true,
    reason: 'Creates a billable invoice.'
  },
  async execute(input) {
    return createInvoice(input)
  }
})

registerTool(tool)
```

## Runtime Behavior

1. The app defines a tool with `defineTool()`.
2. The app registers it with `registerTool()`.
3. Core validates the tool definition and emits quality warnings in development.
4. If native WebMCP exists, the native adapter registers it with the browser.
5. Core also stores the tool in the fallback registry for devtools and tests.
6. Framework recipes or optional extensions can handle lifecycle registration and unregistration without changing the framework-agnostic core.
7. Devtools shows tools, schemas, scope, support mode, quality warnings, and invocation history.

## Browser Support Strategy

Native WebMCP support is detected at runtime. WebMCP Kit should not assume `navigator.modelContext.registerTool` exists in every Chrome install.

```typescript
import { isWebMCPSupported } from '@webmcp-kit/core'

if (isWebMCPSupported()) {
  console.log('Native WebMCP registration is available.')
} else {
  console.log('Using WebMCP Kit fallback registry for devtools and tests.')
}
```

Fallback mode is useful for development, QA, demos, docs, and adapters. It is not equivalent to native browser-agent access.

## Useful Product Features

- **Dev overlay**: inspect registered tools without opening browser internals.
- **Manual invoke**: test a tool with generated sample input.
- **Replay**: re-run the last tool call after changing code.
- **Tool quality score**: catch vague descriptions, missing schemas, and unsafe actions.
- **Sensitive action warnings**: require confirmation for delete, charge, send, publish, export, and irreversible actions.
- **Route coverage map**: see where tools are available across the app.
- **Permission trace**: explain why a tool is hidden or blocked.
- **Form upgrade assistant**: discover high-value forms that should expose declarative WebMCP tools.
- **Catalog export**: generate JSON/Markdown for product, QA, and security review.
- **Playwright helpers**: use the same app actions in tests without brittle selectors.
- **MCP bridge**: expose current-page tools to local MCP clients during development.

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript 5.x, ESM |
| Core | Vanilla TypeScript |
| Schemas | JSON Schema first, optional Zod adapter |
| Native Target | WebMCP browser APIs |
| Devtools | Vanilla TypeScript + CSS |
| Frameworks | Framework-agnostic core, optional recipes/extensions later |
| Testing | Vitest, Playwright helpers |
| Monorepo | npm workspaces |
| Demo Runtime | Astro server demo with Cloudflare Workers adapter |
| Cloudflare Project | Existing Worker project `web-mcp` |
| Local HTTPS | Caddy TLS plugin for `*.localtest.me` development |
| AI Providers | Chrome built-in AI, OpenAI-compatible APIs, Cloudflare Workers AI REST, Cloudflare `AI` binding |

## Success Criteria

- [x] A web app can register a useful WebMCP tool with `defineTool()` and `registerTool()`.
- [x] Native WebMCP registration is used when `navigator.modelContext.registerTool` is available.
- [x] Unsupported browsers use fallback mode without breaking the app.
- [x] Devtools lists registered tools, schemas, warnings, availability, and invocation history.
- [x] Vue, React, and Svelte recipes show lifecycle-safe registration without requiring framework packages.
- [x] Declarative form helpers add WebMCP metadata to forms.
- [x] Sensitive/destructive tools warn when explicit confirmation metadata is missing.
- [x] Registered sensitive/destructive tools can enforce confirmation before execution.
- [x] A static tool catalog can be generated for review.
- [x] Playwright helpers can invoke fallback tools from a page.
- [x] Documentation clearly states that WebMCP Kit is not a new protocol.
- [x] Implemented tests pass with `npm run test`.
