# Code Review: `feature/mvp-hardening`

**Date**: 2026-05-13
**Branch**: `feature/mvp-hardening` (20 commits, 67 files, +6,795 / −585)
**Tests**: 50/50 passing, 14 test files
**TypeScript**: `tsc --noEmit` clean

---

## Summary

This branch builds **WebMCP Kit** — a TypeScript monorepo that wraps emerging Chrome WebMCP browser APIs (`navigator.modelContext`) with typed tool definitions, a fallback registry, devtools overlay, planner providers (Chrome built-in AI, OpenRouter, OpenAI, Cloudflare), adapters (OpenAI tools, MCP bridge, catalog export), form helpers, Playwright test utilities, and an Astro/Vue demo. The code is clean, well-structured, and thoroughly tested.

**Verdict: Ship-ready with minor recommendations.**

---

## 1. Architecture & Design

| Aspect | Assessment |
|---|---|
| **Monorepo structure** | Clean npm workspaces (`packages/core`, `devtools`, `mcp-bridge`, `testing`). Each has proper `package.json`, `tsconfig`, and `exports`. |
| **Framework agnosticism** | Core package has zero framework dependencies. The Vue demo and Astro integration are layered on top without contaminating core. Framework recipes in `docs/` are documentation only, no separate wrapper packages — per the deferred decision in the plan. |
| **Separation of concerns** | `define-tool.ts` (validation), `registry.ts` (fallback store), `native-adapter.ts` (browser API), `planner.ts` (AI routing), `quality.ts` (warnings), `events.ts` (pub/sub), `test-bridge.ts` (test exposure) are all single-responsibility modules. |
| **Adapter pattern** | Clean adapters for OpenAI tools, MCP bridge (JSON-RPC), and Markdown/JSON catalog export. Each is independent and optional. |
| **Progressive enhancement** | Native WebMCP is used when available; fallback registry always runs in parallel. This is the right strategy for an emerging browser API. |
| **Planner abstraction** | `ToolPlanner` interface is well-designed — status, availability, and fallback are first-class. The heuristic planner provides sensible defaults for basic commands while AI planners handle semantic queries. |

**Points to address:**

1. **`planner.ts` is 592 lines** — the largest module. It handles Chrome AI sessions, OpenAI-compatible chat, Cloudflare REST, server endpoints, heuristic keyword matching, and plan validation all in one file. Consider splitting into `planner/heuristic.ts`, `planner/chrome-ai.ts`, `planner/remote.ts`, `planner/validate.ts` when it grows further. Not a blocker for this MVP.

2. **`WebMcpDemo.vue` is 647 lines** — the demo component mixes UI, tool registration, planner config, form handling, and activity logging. This is acceptable for a demo but worth noting for future refactoring.

---

## 2. Implementation Quality

### Strengths

- **`define-tool.ts`**: Neat factory that validates on creation. Throws actionable errors with tool names and specific schema paths. Good.

- **`registry.ts`**: Clean. Properly replaces duplicate tool names, runs guards/confirmations before execution, emits events at every lifecycle point, uses `performance.now()` for timing. The `invokeTool` function is a well-structured pipeline: find → scope check → confirm → guard → execute.

- **`native-adapter.ts`**: Handles edge cases well — `unregister`, `dispose`, and unrecognized native handle shapes all produce appropriate warnings. The `source: 'native'` context is correctly threaded through to the handler.

- **`schema.ts`**: Recursive JSON Schema validator with specific, path-prefixed error messages. Validates types, properties, required fields, items, enums, and numeric constraints. Solid.

- **`quality.ts`**: Practical heuristic quality checks — snake_case naming, minimum description length, vague words, sensitive action detection, form field validation. Good signal-to-noise ratio on warnings.

- **`forms.ts`**: Clean attribute-based form metadata. Infers schemas from inputs (text/number/checkbox), supports `data-tool-description` overrides, fills forms before execution. The `fillForm` function correctly handles `RadioNodeList`, checkboxes, and standard inputs.

- **`devtools.ts`**: A self-contained vanilla-TS overlay with its own CSS. Subscribes to kit events, renders tool cards with prompt previews, sample generation, invocation history with replay. The `invocationId` tracking correctly correlates concurrent calls. Clean use of event delegation.

- **`planner.ts`**: Robust. Handles Chrome AI session lifecycle (availability → create → prompt), with graceful fallback to heuristics on any failure. Remote planners validate responses before returning. `validateRemotePlan` checks structure and confirms the tool exists in the registry. Server endpoint errors are surfaced in fallback reasons.

- **`mcp-bridge/index.ts`**: Proper JSON-RPC 2.0 implementation with `tools/list` and `tools/call`. Confirmation is passed through as a param. Good.

- **`testing/playwright.ts`**: Thin, correct Playwright helpers using `page.evaluate()` to reach the test bridge. `waitForWebMCPTool` uses `page.waitForFunction` with a proper predicate.

- **Server endpoint (`src/pages/api/webmcp/plan.ts`)**: Handles both Cloudflare binding and REST modes. Whitelists approved models, strips code fences from AI responses (common with smaller models), uses `getLegacyRuntimeEnv` for compatibility.

### Issues & Recommendations

1. **Chrome AI session leak** (`planner.ts:446`): Sessions are created lazily (`session ??= await createChromeAISession(languageModel)`) and never cleaned up. There's no `destroy()` or `dispose()` on the `ToolPlanner` interface. If Chrome's LanguageModel session holds resources, this leaks. **Recommendation**: Add an optional `dispose?: () => void` to `ToolPlanner` and destroy sessions when the planner is replaced (e.g., when the user switches providers in the demo). Not urgent for MVP but worth tracking.

2. **`planWithChromeAI` doesn't handle malformed JSON** (`planner.ts:210`): If Chrome AI returns non-JSON text (which can happen), `JSON.parse()` throws and falls through to the catch in `createActiveChromePlanner`. That fallback is good, but the error message ("Chrome built-in AI could not plan this command...") doesn't distinguish between a session failure and a bad response. **Recommendation**: Add a try/catch around `JSON.parse()` with a more specific fallback reason like "Chrome AI returned unparseable text."

3. **`devtools.ts` — `innerHTML`-based rendering**: The entire overlay DOM is rebuilt via `root.innerHTML = ...` on every render. This means textarea content is lost on external render triggers (e.g., events from other tools being invoked). You already handle this for concurrent invocations (the `pendingInvocations` map), but if someone types in a textarea and another tool fires in the background, their input is lost. **Recommendation**: Use targeted DOM updates or a diff-based approach in a follow-up. Low priority for a devtool.

4. **`devtools.ts` — `escapeHtml` uses `replaceAll`**: This requires ES2021+. The codebase targets modern Chrome (WebMCP is Chrome-only), so this is fine, but worth noting.

5. **`planWithOpenAICompatible` references `location.origin`** (`planner.ts:269`): This will throw in non-browser environments (Node tests). The current tests mock `fetch` globally so it's not hit, but if someone writes a test that invokes OpenRouter planning without mocking `location`, it will fail. **Recommendation**: Guard with `typeof location !== 'undefined'`.

6. **Heuristic planner has hardcoded product IDs** (`planner.ts:351`): `'kbd-01'` and `'dock-02'` are hardcoded in `planWithHeuristics`. These match the demo but not real apps. The heuristic planner is explicitly a fallback, and its `reason` field explains what it did, so this is acceptable for MVP.

7. **`native-adapter.spec.ts` — test pollution risk**: `clearToolsForTest()` is called in `beforeEach`/`afterEach`, but `navigator.modelContext` is directly mutated without restoration of the original value. Since the tests delete `modelContext` in teardown, this works, but if another test file runs in the same vm context, it could leak. Acceptable.

8. **`plan.ts` — `getLegacyRuntimeEnv` try/catch is broad** (`plan.ts:185`): `catch { return {} }` in `getLegacyRuntimeEnv` silently swallows syntax errors in the `locals.runtime.env` getter. Not a realistic scenario, but worth being aware of.

---

## 3. Test Coverage

| Area | Location | Tests | Status |
|---|---|---|---|
| Schema validation | `schema.spec.ts` | 5 | ✅ Edge cases for types, required, nested, output schemas |
| Native adapter | `native-adapter.spec.ts` | 6 | ✅ Registration, unregistration, dispose-only, warnings, source context |
| Planner | `planner.spec.ts` | 13 | ✅ Heuristics, Chrome AI (available/downloadable/session-failure), word/numeric quantity, positional/context-based selection, OpenRouter user-key, server endpoint, Cloudflare binding, needs-key/unavailable states |
| Forms | `forms.spec.ts` | 3 | ✅ Schema inference, invocation, risky field warnings |
| Devtools | `devtools.spec.ts` | 3 | ✅ Render, invoke, error handling, concurrent calls |
| MCP bridge | `mcp-bridge/index.spec.ts` | 2 | ✅ List/call with and without confirmation |
| Test bridge | `test-bridge.spec.ts` | 1 | ✅ Install, invoke, uninstall |
| Kit | `kit.spec.ts` | 1 | ✅ Basic initialization |
| OpenAI adapter | `openai.spec.ts` | 2 | ✅ Single tool, multiple tools |
| Catalog adapter | `catalog.spec.ts` | 2 | ✅ JSON catalog, Markdown format |
| Server endpoint | `plan.spec.ts` | 2 | ✅ Binding mode, missing env error |
| Integration | `tests/integration/fallback.spec.ts` | — | ✅ |
| Demo component | `WebMcpDemo.spec.ts` | — | ✅ |

### Coverage gaps to consider

1. **No test for `forms.ts` checkbox field inference**: Checkbox → `boolean` is in the code but not explicitly tested.
2. **No test for `forms.ts` `RadioNodeList` fill-form path**: The `field instanceof RadioNodeList` branch has no test.
3. **No test for `forms.ts` `data-tool-description` override**: Only the label-fallback path is tested.
4. **No test for `events.ts`**: The pub/sub system is exercised indirectly through registry tests but has no direct tests.
5. **No test for `support.ts`**: `isWebMCPSupported()` and `getSupportLabel()` are tested only indirectly through native-adapter specs.
6. **No test for `planner.ts` Cloudflare REST direct mode**: Only the server-endpoint path for `cloudflare-workers-ai` is tested; the browser-direct REST path is not.

---

## 4. Security

| Concern | Status |
|---|---|
| **User-key visibility** | ✅ Clearly documented. The demo sidebar warns: "the key is visible to this browser page." The PRD and planner docs repeat this. |
| **Server mode for secrets** | ✅ App-owned keys use server endpoints. The `plan.ts` endpoint never exposes secrets to the browser. |
| **Input validation** | ✅ `defineTool` validates schemas at registration. `invokeTool` passes raw input to handlers; handlers are responsible for their own validation. This is documented in the security guide. |
| **Confirmation enforcement** | ✅ `invokeTool` blocks actions without confirmation. The devtools overlay uses `window.confirm()`. MCP bridge requires explicit `confirmed: true` param. |
| **Guard execution** | ✅ Guards run after scope/confirmation checks and before execution. Both `false` and string (reason) returns are handled. |
| **Event data** | ✅ Events include tool name and timestamp but no input/output by default. `detail` contains invocation data but is only visible through the subscription API, not transmitted. |
| **Devtools secrets** | ✅ Invocation history shows input/output in the DOM, which is appropriate for a dev tool. Not exposed in production builds. |
| **Cloudflare binding mode** | ✅ Gated behind `import.meta.env.DEV \|\| import.meta.env.PUBLIC_WEBMCP_PREVIEW === 'true'`. The demo hides it from normal production builds. |

### Minor concerns

1. **No CSP consideration in devtools**: The devtools overlay injects inline styles and innerHTML. Acceptable for a dev tool.
2. **`localStorage` for API keys**: In user-key mode, keys can be persisted to `localStorage` via `getPlannerApiKey`. This is intentional (the storage key is configurable), but worth noting that `localStorage` is accessible to any JS on the origin. This is consistent with the user-key warnings.

---

## 5. Documentation

All 10 planned docs exist and are well-written:

- `README.md` — Clean, clear positioning ("not a new protocol"), quick start, good examples.
- `Dev-Docs/PLAN.md` — Exhaustive implementation plan with all phases checked off.
- `Dev-Docs/PRD.md` — Production-quality PRD with personas, functional/non-functional requirements, open questions.
- `docs/getting-started.md` — First-tool example in plain JS.
- `docs/browser-support.md` — Native WebMCP, Early Preview status, feature detection, fallback behavior.
- `docs/security.md` — Untrusted inputs, permissions, confirmations, redaction, audit hooks.
- `docs/planner-providers.md` — Server mode, user-key mode, Chrome built-in AI, Cloudflare binding, model selection.
- `docs/vue.md`, `docs/react.md`, `docs/svelte.md`, `docs/astro.md` — Consistent lifecycle-safe registration recipes.
- `docs/framework-extensions.md` — Deferred framework packages policy.

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

| Priority | Issue | File |
|---|---|---|
| Should fix | `planWithChromeAI` doesn't distinguish JSON parse failure from session failure | `planner.ts:210` |
| Should fix | `planWithOpenAICompatible` accesses `location` without guard | `planner.ts:269` |
| Nice to have | Chrome AI session lifecycle cleanup (`dispose`) | `planner.ts`, `interfaces/tool.ts` |
| Nice to have | Targeted DOM updates instead of full innerHTML re-render | `devtools.ts` |
| Nice to have | Flesh out form helper tests (checkbox, radio, `data-tool-description`) | `forms.spec.ts` |
| Nice to have | Direct tests for `events.ts` and `support.ts` | New test files |
| Not blocking | Split `planner.ts` into multiple modules | `planner.ts` |
| Not blocking | Split `WebMcpDemo.vue` into subcomponents | `WebMcpDemo.vue` |

---

**Overall: This is a well-engineered MVP. The architecture is sound, the test coverage is strong, edge cases are handled thoughtfully, and the documentation is excellent. The issues above are minor polish. Ship it.**
