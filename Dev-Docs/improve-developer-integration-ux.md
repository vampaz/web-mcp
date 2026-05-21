# Plan: Improve Developer Integration UX

- [x] Phase 1: Add Integration Diagnostics
  - [x] Step 1.1: Expose confirmation-handler state for diagnostics
    - Files: `packages/core/src/confirmation.ts`
    - Test: `npm run test -- packages/core/src/diagnostics.spec.ts`
  - [x] Step 1.2: Add a core integration health report API
    - Files: `packages/core/src/diagnostics.ts`, `packages/core/src/diagnostics.spec.ts`, `packages/core/src/index.ts`
    - Test: `npm run test -- packages/core/src/diagnostics.spec.ts`

- [x] Phase 2: Surface Diagnostics In Devtools
  - [x] Step 2.1: Show integration health in the devtools overlay
    - Files: `packages/devtools/src/devtools.ts`, `packages/devtools/src/devtools.spec.ts`
    - Test: `npm run test -- packages/devtools/src/devtools.spec.ts`

- [x] Phase 3: Document The Integration Path
  - [x] Step 3.1: Document the health-check API and Cloudflare deploy command
    - Files: `README.md`, `docs/astro.md`, `docs/planner-providers.md`
    - Test: `npm --workspace @webmcp-kit/demo exec tsc -- --noEmit`

- [x] Phase 4: Add README Access To The Demo
  - [x] Step 4.1: Render the repository README as a demo Astro page
    - Files: `demo/src/pages/readme.astro`, `demo/src/components/DemoShell.vue`, `demo/src/components/DemoPages.spec.ts`, `demo/package.json`, `package-lock.json`
    - Test: `npm run test:demo -- src/components/DemoPages.spec.ts`
