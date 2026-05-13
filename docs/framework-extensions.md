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

Framework packages should not own protocol, planner, registry, or execution logic. Vue, React, Svelte, and Astro support starts as documentation recipes that show lifecycle-safe registration with `@webmcp-kit/core`.

Thin optional packages can be reconsidered after core adoption if users repeatedly ask for framework-specific ergonomics. Those packages should only wrap lifecycle cleanup and delegate all behavior to core.
