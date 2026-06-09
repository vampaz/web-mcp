# Command Input And Demo Refactor Plan

Status: implemented (all phases done; see Progress and Implementation Notes)
Scope: `packages/core` command input internals, framework helper return shapes, demo shell/page extractions, e2e smoke-test hardening.

All ten proposals were reviewed against source and endorsed. This plan sequences them so the fragile pieces (shadow-DOM poking, full-innerHTML renderer) are replaced in the right order, with verification criteria per phase.

## Constraints

- Keep the exact UI and behavior of `<webmcp-command-input>` and the demo launcher. Refactors are internal.
- Confirmation, validation, and progressive-enhancement contracts in AGENTS.md are untouchable.
- Verification loop is tests + typecheck (`npm run test`, `npm exec tsc -- --noEmit`), e2e where noted. No production builds.

## Phase 1 — Small independent wins

### 1.1 Batch `configure()` state updates

File: `packages/core/src/command-input.ts` (`configure()` ~line 268, property setters above it).

Problem: `configure()` assigns through property setters (`endpoint`, `provider`, `model`, `floating`, `buttonLabel`, `disabled`, …). Each setter runs `invalidatePlanner()` + `renderIfConnected()` + `void this.refreshPlannerStatus()`, then `configure()` ends with one more invalidate/render/refresh pass (~lines 318-321). One `configure()` call triggers ~6-10 renders and several concurrent `refreshPlannerStatus()` calls racing each other; the planner-revision guard discards stale ones but planner creation cost is paid each time.

Approach: the setters carry entangled side effects (`providerWasChosen`, `plannerOptionId` reset, Chrome AI fallback logic). Extract those into pure state-mutation functions that both the setters and `configure()` call, with a single commit (`invalidatePlanner → render → refresh`) at the end of `configure()`. Public setters keep their current behavior for direct property assignment.

Verify: existing `command-input.spec.ts` green; add a spec asserting `configure()` performs exactly one render and one planner refresh (spy on render/refresh or count planner creations).

### 1.2 Deduplicate `createResult`

Files: `packages/core/src/registry.ts` (~line 128), `packages/core/src/invocation.ts` (~line 112).

The two `createResult` implementations are byte-identical. Move to one shared module and import from both. Keep `invocationId` stamping post-hoc in the registry path only — that asymmetry is intentional.

Verify: `npm run test`, typecheck.

## Phase 2 — Official planner-option API, remove shadow-DOM poking

File: `packages/core/src/command-input.ts`, `demo/src/components/DemoShell.vue` (`applyBrowserLocalDefault()` ~line 400).

Problem: the demo selects the default browser-local planner by querying `[data-provider]` inside the component shadow root, setting `planner:${id}`, dispatching a synthetic `change`, then force-closing `.webmcp-settings` with a synthetic `toggle`. Fragile against any renderer change and undocumented.

Approach:

- Add `initialPlannerOptionId` to `WebMCPCommandInputConfigureOptions`, with the same "only when the user has not already chosen" semantics as the existing `initialProvider`/`initialModel`.
- Add a `settingsOpen` (or `defaultSettingsOpen`) configure option so the settings-closing half of the hack is also replaced.
- Delete `applyBrowserLocalDefault()` from `DemoShell.vue` and pass the new options through `configure()`.

Ordering note: this phase must land before (or with) the Phase 3 renderer split — the shadow-DOM hack is the one consumer that breaks loudly when the renderer changes.

Verify: new specs for `initialPlannerOptionId` (applies on configure, ignored after user choice, ignored when `fixedProvider` set) and `settingsOpen`; demo e2e still selects the browser-local planner by default.

## Phase 3 — Split the command-input renderer

File: `packages/core/src/command-input.ts` (`render()` ~line 794).

Problem: every render rebuilds the full markup string, swaps `shadowRoot.innerHTML`, and rebinds all listeners. The focus/selection-restore code at the top of `render()` is a symptom. This is the biggest library-side regression source.

Approach:

1. Before refactoring, add snapshot tests: render the component across the meaningful state permutations (floating/inline, provider/model controls shown/hidden, diagnostics, running phases) and assert the serialized shadow DOM. This converts "output stays identical" into a checked invariant.
2. Move to a one-time skeleton render with targeted updates (attributes, text content, `hidden`, `open`, control values) via small pure render helpers. Listener binding happens once.
3. Remove the focus/selection restoration workaround once input elements survive renders.

Verify: snapshot specs unchanged before/after; full unit suite; demo e2e.

## Phase 4 — Pass the selected model option into `createPlanner()`

Files: `packages/core/src/interfaces/command-input.ts` (model option types ~line 25), `packages/core/src/command-input.ts`, `demo/src/utils/browser-local-ai-planner.ts` (~lines 26, 190).

Problem: the demo defines `contextWindowSize` on its model option, then re-derives it by string-matching the model id in `getBrowserLocalAIContextWindowSize()`.

Approach: pass the whole selected model option object through to `createPlanner()`. Do NOT add `contextWindowSize` or other provider-specific fields to core interfaces — let the option type carry consumer extensions (generic parameter or an open `meta?: Record<string, unknown>` field). Update the demo planner to read the option directly and delete the re-lookup.

Verify: `browser-local-ai-planner.spec.ts` updated and green; typecheck.

## Phase 5 — Unify framework helper return shapes

Files: `packages/react/src/index.ts`, `packages/svelte/src/index.ts` (Vue already returns the handle).

Problem: Vue returns `{ unregister, getRegistration }`; React and Svelte return `void`. Inconsistent for developers learning the kit.

Approach: return the same handle shape from all three. Backwards-compatible (`void` → object breaks nobody).

- React: the handle must be referentially stable across renders — memoized object whose `getRegistration()` reads the existing ref.
- Svelte: registration happens inside `onMount`, so the handle needs late-bound closure state (declare `registration` outside the `onMount` callback).
- Fold the React `when`-getter fix into this pass: `options.when()` is currently called during render (`packages/react/src/index.ts:15`), which React cannot make reactive. Either drop the function form from the React API or evaluate inside the effect and document per-render semantics. Add specs for the function form either way.

Verify: react/svelte/vue specs extended for the returned handle; integration tests green.

## Phase 6 — Demo extractions

Files: `demo/src/components/DemoShell.vue`, demo page components, new composables.

### 6.1 `useFloatingCommandLauncher()`

Extract the pointer/viewport/pinning/clamp/placement code (through ~line 878 of `DemoShell.vue`) into a composable. The clamping and pin-detection logic (`wasPinnedRight`/`wasPinnedBottom` against previous max) are pure functions once separated from DOM reads — unit-test those directly; pointer handlers become thin glue. Identical UI/behavior.

### 6.2 `useDemoTools()`

Inventory (`InventoryDemo.vue` ~line 97), Support (`SupportDemo.vue` ~line 102), Invoices, and Commerce all hand-roll the same skeleton: register tools on mount, collect unregister callbacks, clean up on unmount, activity logging, planner context. Extract a shared composable plus the existing schema builders.

Dogfooding upgrade: build it on top of `webmcp-kit/vue` `useWebMCPTool()` where the shape fits, instead of hand-rolling registration arrays again. The demo currently never uses the Vue adapter; pages reading `useWebMCPTool(defineInvoiceSelectTool(...))` are the strongest documentation for the package. (Depends on Phase 5 if the handle shape is needed.)

### 6.3 Centralize layout constants

Scattered placement numbers in `DemoShell.vue` (~line 843) and devtools sizing constraints in `packages/devtools/src/devtools.ts` (~line 345). Convert to named CSS vars/shared constants; derive from content where practical. Do opportunistically while extracting 6.1 — same numbers move anyway. No rendered-layout change.

Verify: `DemoPages.spec.ts` and new composable specs green; demo e2e; visual spot-check of launcher drag/pin on the four routes.

## Phase 7 — Hydration-aware route smoke test

File: `demo/tests/e2e/webmcp-demo.spec.ts`.

Keep the live-route verification (no horizontal overflow, launcher/input present on the four demo routes) but make it hydration-aware: wait for the expected heading/launcher locator before asserting. Pre-hydration checks were misleading. Matches the AGENTS.md rule: no arbitrary Playwright timeouts; locators and assertions only.

Verify: `npm run test:e2e` green and stable on repeat runs.

## Progress

- [x] Phase 1.1 — Batch `configure()`
- [x] Phase 1.2 — Dedup `createResult`
- [x] Phase 2 — `initialPlannerOptionId` + `settingsOpen`, remove shadow-DOM poke
- [x] Phase 3 — Renderer split behind snapshot tests
- [x] Phase 4 — Model option pass-through to `createPlanner()`
- [x] Phase 5 — Framework handle unification + React `when` fix
- [x] Phase 6 — Demo extractions (launcher composable, `useDemoTools()`, layout constants)
- [x] Phase 7 — Hydration-aware e2e smoke test

## Implementation Notes

- Phase 1: shared helper is `createInvocationResult`, exported from `invocation.ts` (module-internal, not re-exported from the package index). New specs assert one render (MutationObserver `takeRecords`) and one planner status event per `configure()`.
- Phase 3: snapshots were recorded against the old renderer first; the only serialization delta after the split is button attribute order (`aria-busy` before `disabled`), a DOM artifact with identical semantics. The renderer lives in `command-input-render.ts` (`getShadowMarkup`, `getStructureSignature`); structure rebuilds only when the signature changes, dynamic state is applied via targeted attribute/text updates, and listeners bind once per structure render.
- Phase 4: the whole selected model option object is passed by reference as `modelOption`; core interfaces gained no provider-specific fields. The demo deleted `getBrowserLocalAIContextWindowSize` and reads `modelOption.contextWindowSize`.
- Phase 5: the React `when` getter form was dropped (React cannot make a getter reactive); `when` is now a plain boolean and `docs/react.md` was updated. React and Svelte return the Vue-style `{ unregister, getRegistration }` handle.
- Phase 6: `useDemoTools()` registers via core `registerTool()` inside its own `onMounted` (identical timing to the old per-page code) and exposes `trackUnregister` for `registerFormTool` on the Support page. Building it on `webmcp-kit/vue` `useWebMCPTool()` was considered and deferred: it would move registration from mount time to setup time and force per-tool setup-level calls — a larger behavior change than this extraction should carry.
- Phase 7: also fixed three pre-existing e2e failures (verified present on clean HEAD via stash): ambiguous `Run` button locators now use `exact: true` (collision with the "Run guided flow" button), commerce quantity locators are scoped to `.cart-lines` (product cards added a duplicate label), and the launcher reposition assertions use `expect.poll` (frame-timing race between `setViewportSize` and the resize handler).
