# Standalone demo migration

The sibling `web-mcp-demo` remains an independent Astro/Vue application with its own hosted, browser, and local provider choices. Its hosted endpoint also supports repository E2E infrastructure; the demo has broader product examples.

Install 0.4.0 and apply the [migration guide](./migration-0.4.md): remove the Pi worker setup, move hosted/testing imports, await `createResolver()`, and update confirmation handlers. Keep the dedicated WebLLM inference worker and application-owned approval UI.

Validate actual registered actions, denial, cancellation, route changes, saved history without replay, account partitions, and New chat over the TLS plugin's HTTPS domain. Source tests in Kit do not establish demo behavior. After authorized package publication, pin the real registry version, update the lockfile, and repeat the consumer checks before deploying.
