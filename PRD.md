# WebMCP Kit — Product Requirements Document

## 1. Overview

**WebMCP Kit** is a developer toolkit for making web apps agent-ready with the emerging WebMCP browser APIs. It is not a new protocol. It is a practical SDK, set of framework integrations, and development tools that help teams expose high-level app actions as WebMCP tools with less boilerplate and better safety.

WebMCP lets a web page describe what it can do through structured tools rather than forcing agents to infer behavior from buttons, layout, and copy. WebMCP Kit makes that usable in production apps by adding typed definitions, schema validation, framework helpers, native registration, graceful fallbacks, debug tooling, and optional bridges to existing agent ecosystems.

The main product bet: most teams will not adopt WebMCP by hand if every form, component, permission check, schema, and test needs custom glue. A high-quality kit can become the default adoption path.

---

## 2. Positioning

### 2.1 One-line Positioning

**WebMCP Kit is the easiest way to add WebMCP tools to real web apps.**

### 2.2 What It Is

- A TypeScript SDK for defining WebMCP tools.
- A native adapter for `navigator.modelContext.registerTool` where available.
- Declarative helpers for form-based WebMCP tools.
- Framework helpers for Vue, React, Svelte, Astro, and plain JavaScript.
- A development overlay for inspecting, testing, and replaying registered tools.
- A fallback registry for browsers and test environments that do not expose native WebMCP yet.
- Optional adapters that export tool definitions to MCP, OpenAI tools, test runners, and documentation.

### 2.3 What It Is Not

- Not a competing standard.
- Not a replacement for WebMCP.
- Not a browser agent.
- Not a full authorization system.
- Not a promise that unsupported browsers can invoke native browser-agent tools.
- Not a replacement for REST, GraphQL, RPC, or backend MCP servers.

---

## 3. Chrome And Browser Support Status

As of May 12, 2026, WebMCP should be treated as an emerging browser capability, not a universally available stable API.

Chrome's public documentation says WebMCP is available for prototyping through the Early Preview Program. Chrome Lighthouse documentation also documents an informational audit that lists WebMCP tools registered through declarative form attributes or the imperative `navigator.modelContext.registerTool` API.

Therefore WebMCP Kit must be designed as progressive enhancement:

1. If native WebMCP exists, register tools with the browser.
2. If native WebMCP does not exist, keep a local development/test registry.
3. Expose feature detection so apps can decide what UI or messaging to show.
4. Avoid pretending fallback mode gives third-party browser agents native access.

The canonical runtime check is:

```typescript
function hasNativeWebMCP(): boolean {
  return typeof navigator !== 'undefined'
    && 'modelContext' in navigator
    && typeof navigator.modelContext?.registerTool === 'function'
}
```

---

## 4. Goals

1. **Make WebMCP adoption simple**: Developers should register useful tools in minutes.
2. **Stay aligned with WebMCP**: Native browser APIs are the primary target.
3. **Support real apps**: Handle components, forms, route state, permissions, confirmations, validation, and analytics.
4. **Improve tool quality**: Help developers write action-oriented names, useful descriptions, accurate schemas, and safe handlers.
5. **Make debugging obvious**: Developers should see what tools are registered, why a tool is unavailable, and what happened during invocation.
6. **Bridge the transition period**: Support development and testing before native WebMCP is widely available.
7. **Work across frameworks**: Plain JS first, with thin ergonomic wrappers for popular frameworks.

---

## 5. User Personas

| Persona | Need |
|---|---|
| App developer | Add WebMCP tools without learning unstable browser API details. |
| Frontend platform engineer | Standardize tool definitions, validation, permissions, and observability across teams. |
| Product engineer | Expose one workflow, such as checkout or ticket creation, without changing backend architecture. |
| QA engineer | Invoke app actions deterministically in tests instead of brittle click flows. |
| Accessibility specialist | Provide high-level actions that assistive agents can discover. |
| Agent developer | Discover reliable app capabilities with clear schemas and execution semantics. |

---

## 6. Core Concepts

| Term | Definition |
|---|---|
| **Tool** | A WebMCP-exposed action with a name, description, input schema, and handler. |
| **Native Adapter** | The layer that registers a tool with browser WebMCP APIs when available. |
| **Fallback Registry** | A local in-page registry used for devtools, tests, demos, and non-native browsers. |
| **Scope** | Conditions that decide when a tool is available, such as route, selected item, auth state, or visible component. |
| **Guard** | A permission or business-rule check that runs before invocation. |
| **Confirmation** | A human approval step for sensitive or destructive actions. |
| **Recipe** | A reusable tool pattern for common flows such as search, filter, add-to-cart, book, submit, export, or undo. |

---

## 7. Functional Requirements

### 7.1 Tool Definition

| ID | Requirement | Priority |
|---|---|---|
| F1 | Provide `defineTool()` for typed tool definitions. | P0 |
| F2 | Support JSON Schema input definitions. | P0 |
| F3 | Support optional output schemas for docs, tests, and adapters. | P1 |
| F4 | Support Zod-to-JSON-Schema and direct JSON Schema authoring. | P1 |
| F5 | Validate required fields, schema shape, tool names, and descriptions in development. | P0 |
| F6 | Warn when tool descriptions are vague, passive, too short, or not action-oriented. | P1 |

### 7.2 Native WebMCP Registration

| ID | Requirement | Priority |
|---|---|---|
| F7 | Register tools with native `navigator.modelContext.registerTool` when available. | P0 |
| F8 | Provide feature detection: `isWebMCPSupported()`. | P0 |
| F9 | Keep a fallback registry when native APIs are unavailable. | P0 |
| F10 | Return native registration handles when browsers expose unregister/update semantics. | P1 |
| F11 | Avoid hard failures when the browser API changes; surface compatibility warnings. | P0 |

### 7.3 Declarative Forms

| ID | Requirement | Priority |
|---|---|---|
| F12 | Provide helpers to apply WebMCP declarative attributes to forms. | P0 |
| F13 | Infer form schemas from inputs where safe and explicit. | P1 |
| F14 | Let developers override inferred names, descriptions, parameter descriptions, and constraints. | P0 |
| F15 | Warn when forms expose tools without validation, submit guards, or clear success states. | P1 |

### 7.4 Framework Integrations

| ID | Requirement | Priority |
|---|---|---|
| F16 | Provide a framework-agnostic core package. | P0 |
| F17 | Provide Vue composables for lifecycle-safe registration and scoped tools. | P1 |
| F18 | Provide React hooks for lifecycle-safe registration and scoped tools. | P1 |
| F19 | Provide Svelte helpers for lifecycle-safe registration and scoped tools. | P1 |
| F20 | Provide Astro integration for examples, docs generation, and dev overlay injection. | P1 |

### 7.5 Scope, Guards, And Confirmation

| ID | Requirement | Priority |
|---|---|---|
| F21 | Support route/page scoped tools. | P0 |
| F22 | Support state-scoped tools, such as selected invoice or active cart. | P0 |
| F23 | Support guards for auth, permissions, feature flags, and business rules. | P0 |
| F24 | Support confirmation policies for destructive, financial, or irreversible actions. | P0 |
| F25 | Provide structured unavailable reasons for devtools and tests. | P1 |

### 7.6 Development Tools

| ID | Requirement | Priority |
|---|---|---|
| F26 | Provide a dev overlay listing registered tools, scopes, schemas, and support mode. | P0 |
| F27 | Let developers invoke tools manually from the overlay with sample parameters. | P0 |
| F28 | Record invocation history, inputs, results, errors, guard decisions, and timings. | P1 |
| F29 | Generate sample payloads from schemas. | P1 |
| F30 | Export a static tool catalog for documentation and review. | P1 |
| F31 | Provide a CI validator that fails on invalid or low-quality tool definitions. | P1 |

### 7.7 Testing

| ID | Requirement | Priority |
|---|---|---|
| F32 | Provide test utilities to inspect fallback-registered tools. | P0 |
| F33 | Provide deterministic invocation helpers for unit and component tests. | P0 |
| F34 | Provide Playwright helpers that invoke tools through the page context. | P1 |
| F35 | Provide contract tests that compare schemas, examples, and handler behavior. | P1 |

### 7.8 Adapters

| ID | Requirement | Priority |
|---|---|---|
| F36 | Convert tool definitions to OpenAI-compatible tool/function definitions for demos and local agents. | P1 |
| F37 | Expose a local MCP bridge for development and non-browser clients. | P2 |
| F38 | Generate `llms.txt` or docs snippets that describe app capabilities. | P2 |
| F39 | Provide analytics hooks for registration, invocation, success, failure, and confirmation. | P1 |

---

## 8. Non-Functional Requirements

| ID | Requirement | Target |
|---|---|---|
| NF1 | Core package size | Small enough for normal frontend use; no framework dependency. |
| NF2 | Runtime behavior | No network calls from core registration. |
| NF3 | Browser compatibility | Native where available, fallback elsewhere. |
| NF4 | TypeScript | Strict TypeScript, ESM only. |
| NF5 | Framework wrappers | Thin wrappers over core, no divergent behavior. |
| NF6 | Performance | Tool registration should be effectively invisible in app startup cost. |
| NF7 | Privacy | Do not transmit schemas, inputs, outputs, or API keys to WebMCP Kit services. |
| NF8 | Stability | Prefer adapters around unstable browser APIs to app-wide rewrites. |

---

## 9. Product Architecture

```mermaid
flowchart LR
    App[Web App]
    Core[@webmcp-kit/core]
    Native[Native WebMCP API]
    Fallback[Fallback Registry]
    Devtools[Dev Overlay]
    Tests[Test Helpers]
    Adapters[Adapters]
    Agent[Browser Agent]

    App --> Core
    Core -->|if available| Native
    Core --> Fallback
    Fallback --> Devtools
    Fallback --> Tests
    Core --> Adapters
    Native --> Agent
```

---

## 10. Example API

```typescript
import { defineTool, registerTool } from '@webmcp-kit/core'

const createInvoiceTool = defineTool({
  name: 'create_invoice',
  description: 'Create an invoice for a customer and show the new invoice in the current workspace.',
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
        description: 'The invoice amount in the workspace currency.'
      }
    },
    required: ['customerId', 'amount']
  },
  confirmation: {
    required: true,
    reason: 'Creates a billable customer invoice.'
  },
  scope() {
    return {
      available: location.pathname.startsWith('/invoices'),
      reason: 'Only available in the invoices area.'
    }
  },
  async execute(input) {
    return createInvoice(input)
  }
})

registerTool(createInvoiceTool)
```

---

## 11. Creative Useful Features

1. **Tool Quality Score**: Rate names, descriptions, schemas, examples, guard coverage, and confirmation policy.
2. **Prompt Preview**: Show how a browser agent may see the tool, so developers can improve descriptions.
3. **Schema Sample Generator**: Generate realistic sample inputs for manual testing.
4. **Replay Invocations**: Re-run the last invocation after a code change during development.
5. **Tool Diff**: Show what tools changed between two builds or branches.
6. **Sensitive Action Classifier**: Warn when a tool probably needs confirmation because it deletes, charges, sends, publishes, or exports data.
7. **Route Coverage Map**: Show which app routes expose tools and where there are obvious gaps.
8. **Form Upgrade Assistant**: Detect important forms that lack WebMCP attributes and suggest tool names/descriptions.
9. **Permission Trace**: Explain why a tool is unavailable for the current user or state.
10. **Docs Export**: Generate a human-readable capability catalog for product, security, and QA review.
11. **Playwright Bridge**: Let tests call the same tools agents use, reducing brittle selectors for workflow tests.
12. **MCP Bridge For Dev**: Expose current-page tools to local MCP clients during development without claiming it is native WebMCP.

---

## 12. Security And Privacy Requirements

| ID | Requirement | Priority |
|---|---|---|
| S1 | Treat all tool input as untrusted input. | P0 |
| S2 | Run app authorization checks inside handlers or guards. | P0 |
| S3 | Require explicit confirmation metadata for destructive or financial tools. | P0 |
| S4 | Never log secrets by default. | P0 |
| S5 | Redact configured fields in devtools and telemetry hooks. | P0 |
| S6 | Provide audit hooks but no hosted collection service. | P1 |
| S7 | Make native browser permission boundaries explicit in docs. | P0 |

---

## 13. Success Criteria

1. A developer can add a useful WebMCP tool to a plain JS app in under 10 lines of app-specific code.
2. The same tool definition can be used in Vue, React, Svelte, Astro, or plain JS.
3. In supported Chrome environments, tools register with native WebMCP.
4. In unsupported browsers, tools appear in the dev overlay and test helpers without breaking the app.
5. The demo app passes Chrome Lighthouse's WebMCP registered-tools audit when run in an environment that supports that audit.
6. A QA engineer can invoke a workflow through WebMCP Kit test helpers without relying on fragile selectors.
7. A security reviewer can inspect a generated tool catalog and see guards, confirmations, schemas, and sensitive fields.

---

## 14. Out Of Scope For V1

- Building a browser agent.
- Defining a new protocol.
- Replacing native WebMCP semantics.
- Full IAM or policy management.
- Hosted analytics.
- Cross-origin tool orchestration.
- Production-grade MCP server hosting.
- Guaranteeing native browser-agent access in browsers without WebMCP.

---

## 15. Open Questions

1. Should the core package include Zod support directly, or should schema adapters live in separate packages?
2. Should framework wrappers auto-register on mount by default, or require explicit registration calls?
3. How should unregister/update behavior work while native WebMCP APIs are still changing?
4. Should the dev overlay be bundled separately to keep production installs smaller?
5. What is the minimum useful MCP bridge without turning the product into an MCP server framework?
6. Should the package name be `@webmcp-kit/*`, `webmcp-kit`, or scoped under an organization?

---

*Version: 0.2.0-Draft*
*Date: 2026-05-12*
*Status: Pivoted from WACP protocol draft to WebMCP adoption toolkit*
