# Framework Extensions Decision

WebMCP Kit should stay framework agnostic by default.

The core package owns:

- tool definitions
- native WebMCP registration
- fallback registry
- events
- planner configuration
- form helpers
- catalog/adapters

Framework subpaths should not own protocol, planner, registry, or execution logic. Vue, React, Svelte, and Astro support starts as lifecycle-safe helpers that delegate registration to `webmcp-kit`.

Thin optional subpaths should only wrap lifecycle cleanup and delegate all behavior to core. Current subpaths:

- `webmcp-kit/vue`
- `webmcp-kit/react`
- `webmcp-kit/svelte`
