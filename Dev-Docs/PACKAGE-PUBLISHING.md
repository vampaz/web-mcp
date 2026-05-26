# Package Publishing Shape

WebMCP Kit is still an MVP workspace. The root `webmcp-kit` package is the only library package intended for npm publication. The demo remains a private workspace app that consumes the root library.

## Current Export Set

- `webmcp-kit`: core tool contracts, registry, native wrapper, fallback invocation, planners, confirmations, events, forms, and test bridge.
- `webmcp-kit/devtools`: local in-page tool overlay.
- `webmcp-kit/testing`: Playwright helpers.
- `webmcp-kit/mcp-bridge`: local MCP-style bridge.
- `webmcp-kit/zod`: Zod schema helper.
- `webmcp-kit/vue`, `webmcp-kit/react`, `webmcp-kit/svelte`: thin lifecycle adapters.

## Publish Later, Not Yet

Before publishing, the package should have:

- A clear package description and keywords.
- A root README or docs section that covers its public API and subpath exports.
- Stable exports that do not depend on source-file imports for consumers.
- Tests for core behavior and each subpath export.
- A documented browser/runtime support policy.
- A changelog and versioning policy.
- A release checklist that runs tests, typecheck, and package packing checks without production demo builds.

## Package Boundaries

- `core` owns protocol behavior, validation, confirmation, registry, planner, and execution semantics.
- Framework subpaths only own lifecycle registration and cleanup.
- `testing` subpath owns Playwright bridge ergonomics, not core behavior.
- `devtools` and `mcp-bridge` subpaths consume the fallback registry; they should not fork invocation logic.
