# Contributing

Use the Node version in `.nvmrc` and npm. The `packages/` directories organize one package; they are not npm workspaces.

```sh
npm ci
npm run dev:demo
npm run test
npm run typecheck
npm run typecheck:demo
npm run lint
npm run format:check
npm run docs:api:check
```

Use the TLS plugin's advertised HTTPS domain. Follow `AGENTS.md` for local edits, review, and authorization. Normal validation uses tests and typechecks. Package validation requires an explicitly authorized build, then `npm run pack:package` and `npm run test:package`.

Keep examples aligned with public imports. Regenerate API documentation with `npm run docs:api` after API changes. Test the packed artifact without source aliases or explicitly installed internal Pi libraries. See [operations](./docs/operations.md) for validation and release details.
