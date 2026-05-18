# AGENTS.md

## Non-Negotiables

- Do not stage, commit, push, or deploy unless the user explicitly asks.
- Do not revert user or other-agent changes unless the user explicitly asks.
- Do not run production builds for verification unless asked; this repo uses tests and typechecks for normal validation.
- Keep edits surgical. Every changed line should trace to the request.

## Project Shape

WebMCP Kit is an ESM-only TypeScript npm workspace for exposing app actions as WebMCP tools. It progressively uses native browser WebMCP and Chrome built-in AI, with local fallback registries and planners for unsupported browsers, demos, and tests.

- `packages/core`: tool definitions, registry, planners, schema validation, events, confirmation handling, native adapter, test bridge.
- `packages/devtools`: in-page tool inspection/invocation overlay.
- `packages/testing`: Playwright bridge helpers.
- `packages/mcp-bridge`: local MCP-style bridge over registered tools.
- `packages/zod`: Zod-to-WebMCP tool helper.
- `packages/vue`, `packages/react`, `packages/svelte`: thin lifecycle helpers around core `registerTool()`.
- `demo`: Astro + Vue demo app, Cloudflare planner endpoint, demo env example, and Playwright demo coverage.
- `tests/integration`: cross-package integration coverage.
- `docs`: user-facing docs; keep examples aligned with source behavior.
- `Dev-Docs`: development planning docs, PRDs, implementation plans, publishing notes, and internal review notes.

## Environment

- Node: `24.12.0` from `.nvmrc`.
- Package manager: npm workspaces with checked-in `package-lock.json`.
- Do not use `npx`; use package scripts or `npm exec <tool> -- ...`.
- `.npmrc` sets `min-release-age=4`; preserve it.
- Dev server: `npm run dev`, delegated to `demo`, port `60001`.
- Astro uses the Cloudflare adapter and Caddy TLS default domain `web-mcp.localtest.me`.

## Style

- TypeScript strict mode, ESM imports/exports, single quotes.
- Prefer function declarations over function expressions assigned to `const`/`let`.
- Use workspace imports such as `@webmcp-kit/core`; use `@/` only inside `demo/src`.
- Shared demo interfaces go in `demo/src/interfaces`; package-local shared interfaces go in `packages/<name>/src/interfaces`.
- Vue SFC order is `template`, then `<script setup lang="ts">`, then `style`.
- Use `withDefaults()` with `defineProps<>()` for Vue props.
- CSS should be fluid and responsive; fixed dimensions need a concrete reason.

## WebMCP Contracts

- Treat all tool input as untrusted, including planner, native browser, devtools, and MCP bridge calls.
- Validate input before confirmation, guards, or execution.
- Use stable, specific tool names and narrow tool responsibilities.
- Prefer strict object JSON Schemas with `required` and `additionalProperties: false`.
- Require `confirmation` for important mutations: create, delete, send, pay, charge, export, publish, checkout, or similar.
- Use `setConfirmationHandler()` for app approval UI. Preserve fallback/native/MCP confirmation enforcement; `window.confirm()` is only a fallback when no handler exists.
- Use `scope()` for current-state availability and `guard()` for input-specific blocking.
- Never expose secrets or hidden server values through inputs, planner context, events, logs, docs examples, or browser user-key flows.
- Planner behavior should remain progressive: native/Chrome AI when available, deterministic fallback when not.

## Framework Helpers

- Keep Vue/React/Svelte packages thin. They register via `@webmcp-kit/core`, unregister on component unmount/dispose, and do not duplicate registry behavior.
- Vue `useWebMCPTool()` registers in the current effect scope and supports reactive `when`.
- React `useWebMCPTool()` syncs from effects and cleans up registrations.
- Svelte `useWebMCPTool()` registers in `onMount`; preserve readable-store `when` support.

## Verification

- Unit/integration tests: `npm run test`
- Single test file: `npm run test -- path/to/file.spec.ts`
- Typecheck: `npm exec tsc -- --noEmit`
- E2E: `npm run test:e2e`
- Playwright reuses or starts the dev server at `http://127.0.0.1:60001`.
- Do not add arbitrary Playwright timeouts; use locators, assertions, or `page.waitForSelector`.
- After changing a test, run that test.
- Vue component tests should use `mountWithDeps()`.

## Cloudflare And Dependencies

- `demo/wrangler.toml` uses the Astro Cloudflare adapter entrypoint, assets from `demo/dist`, and an `AI` binding.
- Do not deploy with Wrangler unless asked; deployment is push-based.
- Keep `/api/webmcp/plan` server-side for app-owned secrets and validate returned plans.
- Prefer existing libraries. If dependencies change, use latest versions and keep lockfile changes intentional.
- NCU is globally installed for dependency update work.

## Working Practice

- Learn local patterns before editing.
- State assumptions when the task has multiple plausible interpretations.
- Use the smallest implementation that satisfies the request.
- Remove only code made unused by your own change.
- Mention unrelated risks or dead code instead of fixing them without permission.
