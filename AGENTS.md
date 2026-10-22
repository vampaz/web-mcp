# AGENTS.md

## Non-Negotiables

- Do not stage, commit, push, or deploy unless the user explicitly asks.
- Do not revert user or other-agent changes unless the user explicitly asks.
- Do not run production builds for verification unless asked; this repo uses tests and typechecks for normal validation.
- Keep edits surgical. Every changed line should trace to the request.

## Project Shape

WebMCP Kit is one ESM-only TypeScript npm package with multiple public entry points. The `packages/` directories organize its source; they are not independently installed npm workspaces. The kit exposes app actions through native browser WebMCP, with local registries and resolvers for unsupported browsers and tests.

- `packages/core`: tool definitions, registry, resolvers, schema validation, events, confirmation handling, native adapter, test bridge.
- `packages/command-input`: `/command-input` entry for the `<webmcp-command-input>` element and `initWebMCP()`; the implementation lives in core.
- `packages/hosted`: `/hosted` entry for the hosted OpenAI-compatible resolver; the implementation lives in core.
- `packages/pi`: persistent conversation runtime, page controller, and registry tool host running in the page.
- `packages/chat`: framework-neutral chat custom element driven by a supplied controller.
- `packages/devtools`: in-page tool inspection/invocation overlay.
- `packages/testing`: resolver evaluations and Playwright bridge helpers.
- `packages/mcp-bridge`: local MCP-style bridge over registered tools.
- `packages/zod`: Zod-to-WebMCP tool helper.
- `packages/vue`, `packages/react`, `packages/svelte`: thin lifecycle helpers around core `registerTool()`.
- `tests/integration`: cross-package integration coverage.
- `tests/package`: isolated consumers of the packed npm artifact.
- `apps/demo`: local Vue lab and deterministic browser fixtures, served over trusted HTTPS.
- `docs`: user-facing docs; keep examples aligned with source behavior.

## Environment

- Node: `24.12.0` from `.nvmrc`.
- Package manager: npm with a root `package.json` and checked-in `package-lock.json`.
- Do not use `npx`; use package scripts or `npm exec <tool> -- ...`.
- No npm `min-release-age` rule is configured.
- Always use the TLS plugin's advertised HTTPS development domain for browser checks and fixtures. Do not create or navigate to an HTTP alternative when the plugin is available.

## Style

- TypeScript strict mode, ESM imports/exports, single quotes.
- Prefer function declarations over function expressions assigned to `const`/`let`.
- Use public package imports such as `@vampaz/webmcp-kit`.
- Package-local shared interfaces go in `packages/<name>/src/interfaces`.
- CSS should be fluid and responsive; fixed dimensions need a concrete reason.

## WebMCP Contracts

- Treat all tool input as untrusted, including resolver, native browser, devtools, and MCP bridge calls.
- Validate input before confirmation, guards, or execution.
- Use stable, specific tool names and narrow tool responsibilities.
- Prefer strict object JSON Schemas with `required` and `additionalProperties: false`.
- Require `confirmation` for important mutations: create, delete, send, pay, charge, export, publish, checkout, or similar.
- Use `setConfirmationHandler()` for app approval UI. Preserve fallback/native/MCP confirmation enforcement; `window.confirm()` is only a fallback when no handler exists.
- Use `scope()` for current-state availability and `guard()` for input-specific blocking.
- Never expose secrets or hidden server values through inputs, resolver context, events, logs, docs examples, or browser user-key flows.
- Automatic command resolving prefers Chrome AI when available, with deterministic fallback otherwise. Explicit provider selection and the conversational Pi runtime must report provider failures without silently switching providers.

## Framework Helpers

- Keep Vue/React/Svelte packages thin. They register via `@vampaz/webmcp-kit`, unregister on component unmount/dispose, and do not duplicate registry behavior.
- Vue `useWebMCPTool()` registers in the current effect scope and supports reactive `when`.
- React `useWebMCPTool()` syncs from effects and cleans up registrations.
- Svelte `useWebMCPTool()` registers in `onMount`; preserve readable-store `when` support.

## Verification

- All routine checks: `npm run check` (lint, format check, both typechecks, API reference and docs link checks, unit tests)
- Unit/integration tests: `npm run test`; coverage report without thresholds: `npm run test:coverage`
- Single test file: `npm run test -- path/to/file.spec.ts`
- Typecheck: `npm run typecheck`; lab: `npm run typecheck:demo`
- Browser tests: `npm run test:e2e`; real-model checks are separate: `npm run test:lmstudio`
- Generated API reference and relative docs links/anchors: `npm run docs:api:check` (links alone: `npm run docs:links`)
- Lab without a local model: `npm run dev:demo:fixtures`
- Authorized packaging checks: build once, then `npm run pack:package` and `npm run test:package`. The package suite also enforces per-entry gzip budgets in `tests/package/bundle-size.spec.ts`. See `docs/operations.md`.
- Do not add arbitrary Playwright timeouts; use locators, assertions, or `page.waitForSelector`.
- After changing a test, run that test.
- Vue component tests should use `mountWithDeps()`.

## Dependencies

- Prefer existing libraries. If dependencies change, use latest versions and keep lockfile changes intentional.
- NCU is globally installed for dependency update work.

## Working Practice

- Learn local patterns before editing.
- State assumptions when the task has multiple plausible interpretations.
- Use the smallest implementation that satisfies the request.
- Remove only code made unused by your own change.
- Mention unrelated risks or dead code instead of fixing them without permission.
