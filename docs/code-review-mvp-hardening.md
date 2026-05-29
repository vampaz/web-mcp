# Code Review: `feature/mvp-hardening`

**Date**: 2026-05-13
**Branch**: `feature/mvp-hardening` (20 commits, 67 files, +6,795 / −585)
**Tests**: 50/50 passing, 14 test files
**TypeScript**: `tsc --noEmit` clean

---

## Status Note

This review captured the `feature/mvp-hardening` branch as of 2026-05-13. Since then, the native adapter and form helper have been tightened: native registration now passes `annotations`, unregisters with `AbortSignal` when available, keeps returned-handle cleanup for compatibility, and `registerFormTool()` now prefers official `toolparamdescription` / `toolparamtitle` metadata with richer schema inference for email, date, time, and select fields.

## Summary

This branch builds **WebMCP Kit** — a TypeScript monorepo that wraps emerging Chrome WebMCP browser APIs (`navigator.modelContext`) with typed tool definitions, a fallback registry, devtools overlay, planner providers (Chrome built-in AI, OpenRouter, OpenAI, Cloudflare), adapters (OpenAI tools, MCP bridge, catalog export), form helpers, Playwright test utilities, and an Astro/Vue demo. The code is clean, well-structured, and thoroughly tested.

**Verdict: Ship-ready with minor recommendations.**

---

## 1. Architecture & Design

| Aspect                      | Assessment                                                                                                                                                                                                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Monorepo structure**      | Clean npm workspaces (`packages/core`, `devtools`, `mcp-bridge`, `testing`). Each has proper `package.json`, `tsconfig`, and `exports`.                                                                                                                    |
| **Framework agnosticism**   | Core package has zero framework dependencies. The Vue demo and Astro integration are layered on top without contaminating core. Framework recipes in `docs/` are documentation only, no separate wrapper packages — per the deferred decision in the plan. |
| **Separation of concerns**  | `define-tool.ts` (validation), `registry.ts` (fallback store), `native-adapter.ts` (browser API), `planner.ts` (AI routing), `quality.ts` (warnings), `events.ts` (pub/sub), `test-bridge.ts` (test exposure) are all single-responsibility modules.       |
| **Adapter pattern**         | Clean adapters for OpenAI tools, MCP bridge (JSON-RPC), and Markdown/JSON catalog export. Each is independent and optional.                                                                                                                                |
| **Progressive enhancement** | Native WebMCP is used when available; fallback registry always runs in parallel. This is the right strategy for an emerging browser API.                                                                                                                   |
| **Planner abstraction**     | `ToolPlanner` interface is well-designed — status, availability, and fallback are first-class. The heuristic planner provides sensible defaults for basic commands while AI planners handle semantic queries.                                              |

**Points to address:**

1. **Planner provider code remains the largest core area** — `planner.ts` still owns Chrome AI sessions, OpenAI-compatible chat, server endpoints, and plan validation. The deterministic fallback now lives in `heuristic-planner.ts`; consider splitting Chrome AI and remote-provider code only when those paths grow further.

2. **Demo pages are split by workflow** — Inventory, Invoices, Commerce, and Support now own their page-specific tools while sharing `DemoShell.vue`. Keep future changes in those page components instead of rebuilding a single large demo component.

---

## 2. Implementation Quality

### Strengths

- **`define-tool.ts`**: Neat factory that validates on creation. Throws actionable errors with tool names and specific schema paths. Good.

- **`registry.ts`**: Clean. Properly replaces duplicate tool names, runs guards/confirmations before execution, emits events at every lifecycle point, uses `performance.now()` for timing. The `invokeTool` function is a well-structured pipeline: find → scope check → confirm → guard → execute.

- **`native-adapter.ts`**: Uses `AbortSignal` cleanup, supports returned `unregister` / `dispose` handles, passes annotations through, and preserves native `source: 'native'` context.

- **`schema.ts`**: Recursive JSON Schema validator with specific, path-prefixed error messages. Validates types, properties, required fields, items, enums, and numeric constraints. Solid.

- **`quality.ts`**: Practical heuristic quality checks — snake_case naming, minimum description length, vague words, sensitive action detection, form field validation. Good signal-to-noise ratio on warnings.

- **`forms.ts`**: Clean attribute-based form metadata. Infers schemas from inputs including text, number, checkbox, email, date, time, and select; prefers official `toolparamdescription` / `toolparamtitle` metadata while preserving `data-tool-description` compatibility; fills forms before execution. The `fillForm` function correctly handles `RadioNodeList`, checkboxes, and standard inputs.

- **`devtools.ts`**: A self-contained vanilla-TS overlay with its own CSS. Subscribes to kit events, renders tool cards with prompt previews, sample generation, invocation history with replay. The `invocationId` tracking correctly correlates concurrent calls. Clean use of event delegation.

- **`planner.ts` / `heuristic-planner.ts`**: Robust. Handles Chrome AI session lifecycle (availability → create → prompt), with graceful fallback to generic schema/context heuristics on any failure. Remote planners validate responses before returning. Server endpoint errors are surfaced in fallback reasons.

- **`mcp-bridge/index.ts`**: Proper JSON-RPC 2.0 implementation with `tools/list` and `tools/call`. Confirmation is passed through as a param. Good.

- **`testing/playwright.ts`**: Thin, correct Playwright helpers using `page.evaluate()` to reach the test bridge. `waitForWebMCPTool` uses `page.waitForFunction` with a proper predicate.

- **Server endpoint (`demo/src/pages/api/webmcp/plan.ts`)**: Handles Cloudflare binding mode. Whitelists approved models, strips code fences from AI responses (common with smaller models), rejects malformed JSON explicitly, and uses `getLegacyRuntimeEnv` for compatibility.

### Issues & Recommendations

1. **`devtools.ts` — full overlay re-rendering**: The overlay still rebuilds markup for each render, but edited textarea drafts are now preserved across unrelated event-triggered renders. A targeted DOM update approach remains optional polish, not correctness debt.

2. **`devtools.ts` — `escapeHtml` uses `replaceAll`**: This requires ES2021+. The codebase targets modern Chrome (WebMCP is Chrome-only), so this is fine, but worth noting.

3. **Demo semantic heuristics are demo-owned**: Core fallback planning is now generic and schema/context-driven. Demo-specific semantic inventory grouping lives in `demo/src/utils/demo-heuristic-planner.ts`, where it can evolve with demo data.

4. **`native-adapter.spec.ts` — test pollution risk**: `clearToolsForTest()` is called in `beforeEach`/`afterEach`, but `navigator.modelContext` is directly mutated without restoration of the original value. Since the tests delete `modelContext` in teardown, this works, but if another test file runs in the same vm context, it could leak. Acceptable.

5. **`plan.ts` — legacy env fallback is narrow**: `getLegacyRuntimeEnv` no longer swallows arbitrary getter errors; unsupported `cloudflare:workers` imports still fall back to Astro locals.

---

## 3. Test Coverage

| Area              | Location                             | Coverage                                                                                                                                                                                                             |
| ----------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema validation | `schema.spec.ts`                     | ✅ Edge cases for types, required, nested, output schemas                                                                                                                                                            |
| Native adapter    | `native-adapter.spec.ts`             | ✅ Registration, annotations passthrough, AbortSignal cleanup, returned handles, source context                                                                                                                      |
| Planner           | `planner.spec.ts`                    | ✅ Heuristics, Chrome AI (available/downloadable/session-failure), word/numeric quantity, positional/context-based selection, OpenRouter user-key, server endpoint, Cloudflare binding, needs-key/unavailable states |
| Forms             | `forms.spec.ts`                      | ✅ Schema inference, invocation, official and compatibility form metadata, richer field schemas, risky field warnings                                                                                                |
| Devtools          | `devtools.spec.ts`                   | ✅ Render, invoke, error handling, concurrent calls                                                                                                                                                                  |
| MCP bridge        | `mcp-bridge/index.spec.ts`           | ✅ List/call with and without confirmation                                                                                                                                                                           |
| Test bridge       | `test-bridge.spec.ts`                | ✅ Install, invoke, uninstall                                                                                                                                                                                        |
| Kit               | `kit.spec.ts`                        | ✅ Basic initialization                                                                                                                                                                                              |
| OpenAI adapter    | `adapters/openai.spec.ts`            | ✅ Single tool, multiple tools                                                                                                                                                                                       |
| Catalog adapter   | `adapters/catalog.spec.ts`           | ✅ JSON catalog, Markdown format                                                                                                                                                                                     |
| Server endpoint   | `plan.spec.ts`                       | ✅ Binding mode, missing env error                                                                                                                                                                                   |
| Integration       | `tests/integration/fallback.spec.ts` | ✅ Fallback registry behavior                                                                                                                                                                                        |
| Demo components   | `DemoPages.spec.ts`                  | ✅ Page registration, planner controls, command placeholders, confirmations, and interaction behavior                                                                                                                |

### Coverage gaps to consider

1. **No direct test for `events.ts`**: The pub/sub system is exercised indirectly through registry tests but has no direct tests.
2. **No direct test for `support.ts`**: `isWebMCPSupported()` and `getSupportLabel()` are tested only indirectly through native-adapter specs.

---

## 4. Security

| Concern                      | Status                                                                                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **User-key visibility**      | ✅ Clearly documented. The demo sidebar warns: "the key is visible to this browser page." The PRD and planner docs repeat this.                                                                                          |
| **Server mode for secrets**  | ✅ App-owned keys use server endpoints. The `plan.ts` endpoint never exposes secrets to the browser.                                                                                                                     |
| **Input validation**         | ✅ `defineTool` validates schemas at registration. `invokeTool` and the native wrapper validate tool input against schema before execution. Handlers should still treat inputs as untrusted and normalize domain values. |
| **Confirmation enforcement** | ✅ `invokeTool` blocks actions without confirmation. The devtools overlay uses `window.confirm()`. MCP/test bridge callers cannot bypass confirmation with request params.                                               |
| **Guard execution**          | ✅ Guards run after scope/confirmation checks and before execution. Both `false` and string (reason) returns are handled.                                                                                                |
| **Event data**               | ✅ Events include tool name and timestamp but no input/output by default. `detail` contains invocation data but is only visible through the subscription API, not transmitted.                                           |
| **Devtools secrets**         | ✅ Invocation history shows input/output in the DOM, which is appropriate for a dev tool. Not exposed in production builds.                                                                                              |
| **Cloudflare binding mode**  | ✅ Available in local, preview, and production deployments through the server endpoint and Cloudflare `AI` binding.                                                                                                      |

### Minor concerns

1. **No CSP consideration in devtools**: The devtools overlay injects inline styles and innerHTML. Acceptable for a dev tool.
2. **`localStorage` for API keys**: In user-key mode, keys can be persisted to `localStorage` via `getPlannerApiKey`. This is intentional (the storage key is configurable), but worth noting that `localStorage` is accessible to any JS on the origin. This is consistent with the user-key warnings.

---

## 5. Documentation

All 10 planned docs exist and are well-written:

- `README.md` — Clean, clear positioning ("not a new protocol"), quick start, good examples.
- `Dev-Docs/PLAN.md` — Exhaustive implementation plan with all phases checked off.
- `Dev-Docs/PRD.md` — Production-quality PRD with personas, functional/non-functional requirements, open questions.
- `docs/getting-started.md` — First-tool example in plain JS, annotations, and form upgrade path.
- `docs/browser-support.md` — Native WebMCP, Early Preview status, feature detection, fallback behavior, annotations, and AbortSignal cleanup.
- `docs/evals.md` — Starter WebMCP eval cases for tool selection, parameter extraction, call order, and user journey success.
- `docs/security.md` — Untrusted inputs, permissions, confirmations, redaction, audit hooks.
- `docs/planner-providers.md` — Server mode, user-key mode, Chrome built-in AI, Cloudflare binding, model selection.
- `docs/vue.md`, `docs/react.md`, `docs/svelte.md`, `docs/astro.md` — Consistent lifecycle-safe registration recipes.
- `docs/framework-extensions.md` — Framework subpath policy.

---

## 6. Consistency & Polish

- **Naming**: `defineTool`, `registerTool`, `invokeTool`, `listTools` — consistent verb-first naming.
- **Error messages**: All actionable, include tool names and schema paths.
- **TypeScript**: Strict mode in tsconfigs, proper generics throughout, no `any` except in JSON Schema extension (`[key: string]: unknown`).
- **ESM-only**: All imports use ESM syntax. No `require()`.
- **Single quotes**: Consistent throughout.
- **No unused imports**: Verified via `tsc --noEmit`.
- **Event naming**: `registered`, `unregistered`, `invoked`, `succeeded`, `failed`, `blocked` — consistent past-tense.

---

## 7. Recommendations Summary

| Priority     | Issue                                                                                             | File                  |
| ------------ | ------------------------------------------------------------------------------------------------- | --------------------- |
| Nice to have | Targeted DOM updates instead of full overlay re-render                                            | `devtools.ts`         |
| Nice to have | Direct tests for `events.ts` and `support.ts`                                                     | New test files        |
| Not blocking | Split Chrome AI and remote-provider planner code if those paths grow further                      | `planner.ts`          |
| Not blocking | Keep splitting shared demo behavior only when repeated page code proves it is actually duplicated | `demo/src/components` |

---

**Overall: This is a well-engineered MVP. The architecture is sound, the test coverage is strong, edge cases are handled thoughtfully, and the documentation is excellent. The issues above are minor polish. Ship it.**
