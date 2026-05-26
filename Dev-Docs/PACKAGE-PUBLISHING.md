# Package Publishing Shape

WebMCP Kit is still an MVP workspace. Packages should stay private until the public package contract is intentionally reviewed.

## Current Package Set

- `@webmcp-kit/core`: core tool contracts, registry, native wrapper, fallback invocation, planners, confirmations, events, forms, and test bridge.
- `@webmcp-kit/devtools`: local in-page tool overlay.
- `@webmcp-kit/testing`: Playwright helpers.
- `@webmcp-kit/mcp-bridge`: local MCP-style bridge.
- `@webmcp-kit/zod`: Zod schema helper.
- `@webmcp-kit/vue`, `@webmcp-kit/react`, `@webmcp-kit/svelte`: thin lifecycle adapters.

## Publish Later, Not Yet

Before publishing, each package should have:

- A clear package description and keywords. Initial metadata is present in each package.
- A package-level README or a root docs section that covers its public API. Initial package READMEs are present.
- Stable exports that do not depend on source-file imports for consumers.
- Tests for package-specific behavior.
- A documented browser/runtime support policy.
- A changelog and versioning policy.
- A release checklist that runs tests, typecheck, and package packing checks without production demo builds.

## Package Boundaries

- `core` owns protocol behavior, validation, confirmation, registry, planner, and execution semantics.
- Framework packages only own lifecycle registration and cleanup.
- `testing` owns Playwright bridge ergonomics, not core behavior.
- `devtools` and `mcp-bridge` consume the fallback registry; they should not fork invocation logic.

## Open Decision

Decide whether the first public release should publish all packages together or start with `@webmcp-kit/core` plus `@webmcp-kit/testing`. Publishing fewer packages first lowers support surface, but the framework helpers make adoption easier for real apps.
