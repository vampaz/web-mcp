# Plan: Harden WebMCP Runtime And Demo

- [x] Phase 1: Confirmation authority and bridge exposure
  - [x] Step 1.1: Prevent bridge callers from bypassing confirmation
    - Files: [`packages/mcp-bridge/src/index.ts`, `packages/mcp-bridge/src/index.spec.ts`, `packages/core/src/test-bridge.ts`, `packages/core/src/test-bridge.spec.ts`, `README.md`, `docs/security.md`, `docs/examples.md`, `docs/code-review-mvp-hardening.md`]
    - Test: `npm run test -- packages/mcp-bridge/src/index.spec.ts packages/core/src/test-bridge.spec.ts`
  - [x] Step 1.2: Install the browser test bridge only in test/dev-safe contexts
    - Files: [`demo/src/components/DemoShell.vue`, `demo/src/components/DemoPages.spec.ts`, `README.md`, `docs/getting-started.md`]
    - Test: `npm run test:demo -- src/components/DemoPages.spec.ts`

- [x] Phase 2: Planner endpoint and remote plan hardening
  - [x] Step 2.1: Add planner request size limits and safe public errors
    - Files: [`demo/src/pages/api/webmcp/plan.ts`, `demo/src/pages/api/webmcp/plan.spec.ts`]
    - Test: `npm run test:demo -- src/pages/api/webmcp/plan.spec.ts`
  - [x] Step 2.2: Validate remote planner input against the selected tool schema
    - Files: [`packages/core/src/planner.ts`, `packages/core/src/planner.spec.ts`, `demo/src/pages/api/webmcp/plan.ts`, `demo/src/pages/api/webmcp/plan.spec.ts`]
    - Test: `npm run test -- packages/core/src/planner.spec.ts` and `npm run test:demo -- src/pages/api/webmcp/plan.spec.ts`
  - [x] Step 2.3: Normalize OpenAI-compatible JSON responses before parsing
    - Files: [`packages/core/src/planner.ts`, `packages/core/src/planner.spec.ts`]
    - Test: `npm run test -- packages/core/src/planner.spec.ts`

- [x] Phase 3: Integration reliability and accessible command UX
  - [x] Step 3.1: Dispatch form events when form tools fill fields
    - Files: [`packages/core/src/forms.ts`, `packages/core/src/forms.spec.ts`]
    - Test: `npm run test -- packages/core/src/forms.spec.ts`
  - [x] Step 3.2: Isolate event listener failures
    - Files: [`packages/core/src/events.ts`, `packages/core/src/events.spec.ts`]
    - Test: `npm run test -- packages/core/src/events.spec.ts`
  - [x] Step 3.3: Improve command palette focus and screen-reader status
    - Files: [`demo/src/components/DemoShell.vue`, `demo/src/components/DemoShell.vue`, `demo/src/components/DemoPages.spec.ts`]
    - Test: `npm run test:demo -- src/components/DemoPages.spec.ts`

- [x] Phase 4: Final verification
  - [x] Step 4.1: Run the targeted suite and inspect the live demo in the in-app browser
    - Files: [`Dev-Docs/harden-webmcp-runtime-and-demo.md`]
    - Test: `npm run test -- packages/mcp-bridge/src/index.spec.ts packages/core/src/test-bridge.spec.ts packages/core/src/planner.spec.ts packages/core/src/forms.spec.ts packages/core/src/events.spec.ts` and `npm run test:demo -- src/pages/api/webmcp/plan.spec.ts src/components/DemoPages.spec.ts`
