# Plan: Improve Demo Multipage Flow And Floating WebMCP Input

Assumptions:

- The demo should become URL-addressable pages, not only tabs inside one Vue component.
- The first page should be the inventory/list demo at `/`.
- The second page should be the invoice demo at `/invoices/`.
- Remaining current demo areas should be grouped into logical pages instead of kept together: commerce/cart at `/commerce/`, support/tickets at `/support/`.
- The WebMCP command input should be available on every demo page as a floating draggable launcher that expands into the full command UI.
- The expanded command UI must always be the library-provided `<webmcp-command-input>` from `@webmcp-kit/core`; the demo should not recreate or fork command input behavior.
- These are commit-sized steps only. Do not stage, commit, push, deploy, or run production builds without explicit permission.

- [x] Phase 1: Establish Multipage Demo Shell
  - [x] Step 1.1: Add a shared Astro layout with top navigation
    - Objective: Create one layout for demo pages with the global CSS import, document metadata, favicon, and a top navigation menu linking Inventory, Invoices, Commerce, Support, and README.
    - Files: [`demo/src/layouts/DemoLayout.astro`], [`demo/src/pages/index.astro`], [`demo/src/pages/readme.astro`]
    - Test: `npm --workspace @webmcp-kit/demo run test -- src/components/WebMcpDemo.spec.ts`
  - [x] Step 1.2: Move current single-page shell styling into page/layout components
    - Objective: Keep the constrained page width, responsive padding, and nav states in reusable layout CSS while avoiding unrelated visual changes.
    - Files: [`demo/src/layouts/DemoLayout.astro`], [`demo/src/styles/global.css`], [`demo/src/components/WebMcpDemo.vue`]
    - Test: `npm --workspace @webmcp-kit/demo run test -- src/components/WebMcpDemo.spec.ts`

- [x] Phase 2: Split Current Demo Into Logical Pages
  - [x] Step 2.1: Make the demo component page-aware
    - Objective: Add a typed `page` prop to `WebMcpDemo.vue` so each Astro route renders one logical demo group and registers the relevant tools without a large extraction.
    - Files: [`demo/src/interfaces/demo.ts`], [`demo/src/components/WebMcpDemo.vue`]
    - Test: `npm --workspace @webmcp-kit/demo run test -- src/components/WebMcpDemo.spec.ts`
  - [x] Step 2.2: Create the Inventory page
    - Objective: Make `/` render the inventory/list demo with `DemoSemanticInventory` and the relevant `select_items` and `clear_item_selection` tools.
    - Files: [`demo/src/pages/index.astro`], [`demo/src/components/WebMcpDemo.vue`]
    - Test: `npm --workspace @webmcp-kit/demo run test -- src/components/WebMcpDemo.spec.ts`
  - [x] Step 2.3: Create the Invoices page
    - Objective: Make `/invoices/` render invoice table and invoice drawer together, preserving filtering, sorting, opening, creation, selection, and invoice-status tools.
    - Files: [`demo/src/pages/invoices.astro`], [`demo/src/components/WebMcpDemo.vue`], [`demo/src/components/DemoInvoiceTable.vue`], [`demo/src/components/DemoInvoiceDrawer.vue`]
    - Test: `npm --workspace @webmcp-kit/demo run test -- src/components/WebMcpDemo.spec.ts`
  - [x] Step 2.4: Create the Commerce page
    - Objective: Make `/commerce/` render cart editing with the existing cart tools: `search_products`, `add_to_cart`, `update_cart_quantity`, `remove_from_cart`, `apply_cart_discount`, and `checkout_cart`.
    - Files: [`demo/src/pages/commerce.astro`], [`demo/src/components/WebMcpDemo.vue`], [`demo/src/components/DemoCartEditor.vue`]
    - Test: `npm --workspace @webmcp-kit/demo run test -- src/components/WebMcpDemo.spec.ts`
  - [x] Step 2.5: Create the Support page
    - Objective: Make `/support/` render the support ticket form and ticket board together, preserving `create_support_ticket` form registration and `update_ticket`.
    - Files: [`demo/src/pages/support.astro`], [`demo/src/components/WebMcpDemo.vue`], [`demo/src/components/DemoSupportTicketPanel.vue`], [`demo/src/components/DemoTicketBoard.vue`]
    - Test: `npm --workspace @webmcp-kit/demo run test -- src/components/WebMcpDemo.spec.ts`

- [x] Phase 3: Add Floating Draggable WebMCP Input
  - [x] Step 3.1: Build the floating launcher component
    - Objective: Add floating mode directly to the library-provided `<webmcp-command-input>` so the element owns the draggable square `WEB`/`MCP` trigger, expanded/collapsed state, and direction-aware panel placement.
    - Files: [`packages/core/src/command-input.ts`], [`packages/core/src/interfaces/command-input.ts`], [`packages/core/src/command-input.spec.ts`]
    - Test: `npm run test -- packages/core/src/command-input.spec.ts`
  - [x] Step 3.2: Wire the floating input into every demo page
    - Objective: Render `<webmcp-command-input floating>` from the demo component and keep planner configuration, diagnostics slot, and command result state wired through the library element.
    - Files: [`demo/src/components/WebMcpDemo.vue`], [`demo/src/components/DemoRuntimeStatus.vue`]
    - Test: `npm --workspace @webmcp-kit/demo run test -- src/components/WebMcpDemo.spec.ts`
  - [x] Step 3.3: Make floating behavior accessible and responsive
    - Objective: Ensure the launcher has an accessible name, keyboard focus styles, drag does not break click/tap, and the expanded library command input opens toward available viewport space.
    - Files: [`packages/core/src/command-input.ts`], [`packages/core/src/command-input.spec.ts`]
    - Test: `npm run test -- packages/core/src/command-input.spec.ts`

  - [x] Step 3.4: Remove stale custom command-palette code if still unused
    - Objective: Delete `DemoCommandPalette.vue` if it remains unused after the split, so the demo has one command-input path and that path uses the library element.
    - Files: [`demo/src/components/DemoCommandPalette.vue`]
    - Test: `npm --workspace @webmcp-kit/demo run test -- src/components/WebMcpDemo.spec.ts`

- [ ] Phase 4: Update Tests For Page Boundaries
  - [x] Step 4.1: Replace the old monolithic component test
    - Objective: Move expectations from `WebMcpDemo.spec.ts` into page-specific tests, keeping coverage for default command placeholder, planner controls, inventory selection, invoice chains, cart checkout guards, and support form tool registration.
    - Files: [`demo/src/components/WebMcpDemo.spec.ts`]
    - Test: `npm --workspace @webmcp-kit/demo run test -- src/components/WebMcpDemo.spec.ts`
  - [x] Step 4.2: Update Playwright coverage for navigation and floating input
    - Objective: Verify top navigation routes, launcher expansion, drag/reposition behavior, page-specific tools, and the existing planner/provider flows on the relevant pages.
    - Files: [`demo/tests/e2e/webmcp-demo.spec.ts`]
    - Test: `npm --workspace @webmcp-kit/demo run test:e2e`

- [ ] Phase 5: Final Verification
  - [x] Step 5.1: Run focused unit coverage
    - Objective: Confirm the page split and floating input behavior are fully green after implementation.
    - Files: [`demo/src/components/*.spec.ts`]
    - Test: `npm --workspace @webmcp-kit/demo run test -- src/components/WebMcpDemo.spec.ts src/pages/api/webmcp/plan.spec.ts`
  - [x] Step 5.2: Run typecheck
    - Objective: Catch integration errors across Astro, Vue, and TypeScript after moving state and routes.
    - Files: [`demo/src/**/*.ts`], [`demo/src/**/*.vue`], [`demo/src/**/*.astro`]
    - Test: `npm exec tsc -- --noEmit`
  - [ ] Step 5.3: Manually verify in the in-app browser
    - Objective: Open the Vite/Astro dev server, check desktop and mobile viewport behavior, confirm the nav is usable, and confirm the floating WebMCP panel does not cover core workflows.
    - Files: [`demo/src/pages/*.astro`], [`demo/src/components/*.vue`]
    - Test: `npm run dev`
