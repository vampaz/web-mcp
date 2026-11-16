# Contributing

Use the Node version in `.nvmrc` and npm. The `packages/` directories organize one package; they are not npm workspaces. Each public entry point has a source directory: `core`, `command-input`, `hosted`, `pi`, `chat`, `assistant`, `server`, `devtools`, `testing`, `mcp-bridge`, `page-bridge`, `zod`, `vue`, `react`, and `svelte`.

```sh
npm ci --ignore-scripts
npm run dev:demo
npm run check
```

`npm run check` runs `lint`, `format:check`, `typecheck`, `typecheck:demo`, `docs:api:check`, `check:changelog`, and `test`. `docs:api:check` also runs `docs:links`, which rejects broken relative links and anchors in the README, this file, and `docs/`. Run `npm run dev:demo:fixtures` to use the lab with deterministic fixture responses instead of LM Studio. `npm run test:coverage` writes a V8 coverage report to `coverage/` and enforces whole-percent floors for statements, branches, functions, and lines.

## First run

The first `npm run dev:demo` may ask the operating system to trust the local TLS certificate and install the loopback-only helper service. Follow the plugin's authorization prompt; certificate verification stays enabled. If the browser cannot reach the HTTPS lab, run `npm exec -- vite-local-tls doctor` to check CA trust and service health. The plugin prints the trusted HTTPS URL at startup; use that URL rather than an HTTP alternative.

The Core and Toolkit tabs work without a model. Chat and Harness need LM Studio, Chrome built-in AI, or the fixture provider. To run the lab without a model, use `npm run dev:demo:fixtures` and open the advertised test URL; it exposes **Test responses (no AI)** and keeps test storage separate from real conversations. CI installs with `npm ci --ignore-scripts`.

Use the TLS plugin's advertised HTTPS domain. Follow `AGENTS.md` for local edits, review, and authorization. Normal validation uses tests and typechecks. Package validation requires an explicitly authorized build, then `npm run pack:package` and `npm run test:package`. The package suite also enforces per-entry gzip budgets in `tests/package/bundle-size.spec.ts`; raise a budget only for a reviewed size increase.

Keep examples aligned with public imports. Regenerate API documentation with `npm run docs:api` after API changes. Test the packed artifact without source aliases or explicitly installed internal Pi libraries. See [operations](./docs/operations.md) for validation and release details.
