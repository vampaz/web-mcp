# Standalone demo migration

The sibling `web-mcp-demo` remains an independent Astro/Vue application with its own hosted, browser, and local provider choices. Its hosted endpoint also supports repository E2E infrastructure; the demo has broader product examples.

The demo pins `@vampaz/webmcp-kit@0.5.1` in its manifest and lockfile. When upgrading older integrations, apply the [0.4 migration](./migration-0.4.md), then the [0.5 migration](./migration-0.5.md): remove the Pi worker setup, move hosted/testing imports, await `createResolver()`, configure chat with `controller`, and update confirmation handlers to approve only with `true`. Custom resolvers and fixtures must consume the structured `result` objects in `piConversation` and keep historical-reference fields separate from current application context. Keep the dedicated WebLLM inference worker and application-owned approval UI. Custom resolvers and server endpoints must also honor `purpose: 'summary'` and the summary-only response schema described in [resolver providers](./resolver-providers.md).

The homepage redirects to `/examples/`, the index of focused examples using popup chat. The review workspace remains in source but has no public route or navigation entry. The demo's README and `/guide/` describe the current public routes and their safety boundaries; its `/developers/` Quickstart targets the installed kit API.

Validate actual registered actions, denial, cancellation, route changes, saved history without replay, account partitions, and New chat over the TLS plugin's HTTPS domain. Source tests in Kit do not establish demo behavior. After authorized package publication, pin the real registry version, update the lockfile, and repeat the consumer checks before deploying.
