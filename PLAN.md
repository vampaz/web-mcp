# Plan: WebMCP Kit Reference Implementation

## Objective

Build **WebMCP Kit**, a ready-made TypeScript toolkit that makes it easy to add WebMCP tools to real web apps. The kit should register tools with native WebMCP browser APIs when available, provide useful fallbacks for development and testing, and ship framework helpers plus examples that make the emerging WebMCP capability practical today.

This is not a new protocol. It is an adoption layer for WebMCP.

---

- [ ] Phase 1: Package Foundation
  - [x] Step 1.1: Initialize monorepo with npm workspaces
    - Files: `package.json`, `package-lock.json`, `tsconfig.base.json`
    - Verify: `npm install` succeeds
  - [ ] Step 1.2: Create package structure
    - Files: `packages/core/package.json`, `packages/devtools/package.json`, `packages/vue/package.json`, `packages/react/package.json`, `packages/svelte/package.json`, `packages/astro/package.json`
    - Verify: workspace package discovery works
  - [ ] Step 1.3: Add strict TypeScript and test setup
    - Files: `vitest.config.ts`, `packages/*/tsconfig.json`
    - Verify: `pnpm run test` runs an empty suite successfully

- [ ] Phase 2: Core Tool Model
  - [ ] Step 2.1: Define tool interfaces
    - Files: `packages/core/src/types.ts`
    - Verify: type tests cover tool name, description, schema, scope, guard, confirmation, and execute handler
  - [ ] Step 2.2: Implement `defineTool()`
    - Files: `packages/core/src/define-tool.ts`
    - Verify: `packages/core/src/define-tool.spec.ts`
  - [x] Step 2.3: Implement runtime schema validation
    - Files: `packages/core/src/schema.ts`
    - Verify: invalid tool definitions return actionable errors
  - [ ] Step 2.4: Implement tool quality checks
    - Files: `packages/core/src/quality.ts`
    - Verify: vague names, missing descriptions, weak schemas, and destructive tools without confirmation produce warnings
  - [ ] Step 2.5: Export public core API
    - Files: `packages/core/src/index.ts`
    - Verify: all public exports are covered by tests

- [ ] Phase 3: Native WebMCP Adapter
  - [ ] Step 3.1: Add WebMCP feature detection
    - Files: `packages/core/src/support.ts`
    - Verify: tests cover native, partial, and missing `navigator.modelContext` states
  - [ ] Step 3.2: Implement native registration adapter
    - Files: `packages/core/src/native-adapter.ts`
    - Verify: calls `navigator.modelContext.registerTool` when available
  - [x] Step 3.3: Normalize native API compatibility
    - Files: `packages/core/src/native-adapter.ts`
    - Verify: compatibility warnings are produced for unexpected native API shapes
  - [x] Step 3.4: Add unregister/update abstraction
    - Files: `packages/core/src/native-adapter.ts`, `packages/core/src/registry.ts`
    - Verify: works whether native registration returns a handle or not

- [ ] Phase 4: Fallback Registry
  - [ ] Step 4.1: Build local fallback registry
    - Files: `packages/core/src/fallback-registry.ts`
    - Verify: registered tools can be listed and invoked in unsupported browsers
  - [ ] Step 4.2: Implement scoped availability
    - Files: `packages/core/src/scope.ts`
    - Verify: unavailable tools include structured reasons
  - [ ] Step 4.3: Implement guards and confirmations
    - Files: `packages/core/src/invoke.ts`
    - Verify: guards run before handlers and confirmation policies are enforced
  - [ ] Step 4.4: Add invocation events
    - Files: `packages/core/src/events.ts`
    - Verify: registration, invocation, success, failure, and blocked events are emitted
  - [ ] Step 4.5: Expose dev/test-only global access
    - Files: `packages/core/src/global.ts`
    - Verify: fallback tools can be inspected in development without defining a competing protocol global

- [ ] Phase 5: Declarative Form Helpers
  - [ ] Step 5.1: Add form attribute helpers
    - Files: `packages/core/src/forms/attributes.ts`
    - Verify: helpers apply `toolname` and `tooldescription` attributes
  - [ ] Step 5.2: Add explicit form tool registration
    - Files: `packages/core/src/forms/register-form-tool.ts`
    - Verify: form submissions can be described as tools with explicit schemas
  - [ ] Step 5.3: Add safe schema inference for forms
    - Files: `packages/core/src/forms/infer-schema.ts`
    - Verify: common input types map to JSON Schema with tests
  - [ ] Step 5.4: Warn on risky form tools
    - Files: `packages/core/src/forms/form-quality.ts`
    - Verify: missing validation, vague descriptions, and sensitive fields produce warnings

- [ ] Phase 6: Devtools Overlay
  - [ ] Step 6.1: Build framework-free overlay shell
    - Files: `packages/devtools/src/overlay.ts`, `packages/devtools/src/styles.css`
    - Verify: overlay mounts in a test DOM
  - [ ] Step 6.2: List registered tools
    - Files: `packages/devtools/src/tool-list.ts`
    - Verify: list shows native/fallback mode, availability, schema, and warnings
  - [ ] Step 6.3: Add manual invocation panel
    - Files: `packages/devtools/src/invoke-panel.ts`
    - Verify: generated sample input can invoke a fallback tool
  - [ ] Step 6.4: Add invocation history and replay
    - Files: `packages/devtools/src/history.ts`
    - Verify: history captures input, output, errors, timings, and guard decisions
  - [ ] Step 6.5: Add prompt preview and quality score
    - Files: `packages/devtools/src/quality-panel.ts`
    - Verify: poor definitions have visible, actionable warnings

- [ ] Phase 7: Framework Integrations
  - [ ] Step 7.1: Add Vue composable
    - Files: `packages/vue/src/useWebMCPTool.ts`
    - Verify: registers on mount and unregisters on unmount
  - [ ] Step 7.2: Add React hook
    - Files: `packages/react/src/useWebMCPTool.ts`
    - Verify: registers on effect and unregisters on cleanup
  - [ ] Step 7.3: Add Svelte action/helper
    - Files: `packages/svelte/src/useWebMCPTool.ts`
    - Verify: registers and unregisters with component lifecycle
  - [ ] Step 7.4: Add Astro integration
    - Files: `packages/astro/src/index.ts`
    - Verify: injects devtools in dev mode and generates a static tool catalog
  - [ ] Step 7.5: Keep framework packages thin
    - Files: `packages/vue/src/index.ts`, `packages/react/src/index.ts`, `packages/svelte/src/index.ts`
    - Verify: wrappers delegate behavior to `@webmcp-kit/core`

- [ ] Phase 8: Adapters
  - [ ] Step 8.1: Add OpenAI tool formatter
    - Files: `packages/core/src/adapters/openai.ts`
    - Verify: tool definitions convert to OpenAI-compatible function/tool schemas
  - [ ] Step 8.2: Add local MCP bridge prototype
    - Files: `packages/mcp-bridge/src/index.ts`
    - Verify: fallback-registered tools can be listed and invoked from a local MCP client in development
  - [ ] Step 8.3: Add docs/catalog export
    - Files: `packages/core/src/adapters/catalog.ts`
    - Verify: produces Markdown and JSON catalogs
  - [x] Step 8.4: Add Playwright helpers
    - Files: `packages/testing/src/playwright.ts`, `packages/core/src/test-bridge.ts`
    - Verify: tests can list and invoke fallback tools from `page`

- [ ] Phase 9: Demo Applications
  - [ ] Step 9.1: Build plain JavaScript demo
    - Files: `apps/plain-demo/src/main.ts`
    - Verify: registers native tools when available and fallback tools otherwise
  - [ ] Step 9.2: Build Astro demo
    - Files: `apps/astro-demo/astro.config.mjs`, `apps/astro-demo/src/pages/index.astro`
    - Verify: dev overlay appears in dev mode
  - [ ] Step 9.3: Build Vue invoice workflow
    - Files: `apps/astro-demo/src/components/VueInvoiceDemo.vue`
    - Verify: create, send, and void invoice tools are route/state scoped
  - [ ] Step 9.4: Build React ecommerce workflow
    - Files: `apps/astro-demo/src/components/ReactCartDemo.tsx`
    - Verify: search, filter, add-to-cart, and checkout tools use guards and confirmations
  - [ ] Step 9.5: Build Svelte support workflow
    - Files: `apps/astro-demo/src/components/SvelteSupportDemo.svelte`
    - Verify: create-ticket tool demonstrates form helpers and schema inference
  - [ ] Step 9.6: Add browser support indicator
    - Files: `apps/astro-demo/src/components/SupportStatus.astro`
    - Verify: page clearly distinguishes native WebMCP from fallback mode

- [ ] Phase 10: Documentation
  - [ ] Step 10.1: Write project README
    - Files: `README.md`
    - Verify: states clearly that WebMCP Kit is not a new protocol
  - [ ] Step 10.2: Write getting started guide
    - Files: `docs/getting-started.md`
    - Verify: first tool example works in plain JS
  - [ ] Step 10.3: Write browser support guide
    - Files: `docs/browser-support.md`
    - Verify: documents native WebMCP, Early Preview status, feature detection, and fallback behavior
  - [ ] Step 10.4: Write security guide
    - Files: `docs/security.md`
    - Verify: covers untrusted inputs, permissions, confirmations, redaction, and audit hooks
  - [ ] Step 10.5: Write framework guides
    - Files: `docs/vue.md`, `docs/react.md`, `docs/svelte.md`, `docs/astro.md`
    - Verify: each guide shows lifecycle-safe registration

- [ ] Phase 11: Verification
  - [ ] Step 11.1: Unit test all packages
    - Files: `packages/**/*.spec.ts`
    - Verify: `pnpm run test`
  - [ ] Step 11.2: Add integration tests for fallback mode
    - Files: `tests/integration/fallback.spec.ts`
    - Verify: unsupported browser environments still expose dev/test registry
  - [ ] Step 11.3: Add browser smoke test for native feature detection
    - Files: `tests/e2e/native-support.spec.ts`
    - Verify: test reports native support status without failing unsupported browsers
  - [ ] Step 11.4: Add Lighthouse documentation check
    - Files: `docs/browser-support.md`
    - Verify: docs explain how to inspect registered WebMCP tools in supported Chrome/Lighthouse environments

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
3. Core validates and scores the tool definition in development.
4. If native WebMCP exists, the native adapter registers it with the browser.
5. Core also stores the tool in the fallback registry for devtools and tests.
6. Framework wrappers handle lifecycle registration and unregistration.
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
| Frameworks | Vue, React, Svelte, Astro wrappers |
| Testing | Vitest, Playwright helpers |
| Monorepo | pnpm workspaces |
| Demo Deployment | Static demo, optionally Cloudflare Pages |

## Success Criteria

- [ ] A plain JS app can register a useful WebMCP tool with `defineTool()` and `registerTool()`.
- [ ] Native WebMCP registration is used when `navigator.modelContext.registerTool` is available.
- [ ] Unsupported browsers use fallback mode without breaking the app.
- [ ] Devtools lists registered tools, schemas, warnings, availability, and invocation history.
- [ ] Vue, React, and Svelte wrappers register and unregister tools with component lifecycle.
- [ ] Declarative form helpers add WebMCP metadata to forms.
- [ ] Sensitive/destructive tools require explicit confirmation metadata.
- [ ] A static tool catalog can be generated for review.
- [ ] Playwright helpers can invoke fallback tools from a page.
- [ ] Documentation clearly states that WebMCP Kit is not a new protocol.
- [ ] All tests pass: `pnpm run test` exits 0.
