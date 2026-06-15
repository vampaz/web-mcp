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

All framework helpers return the same handle:

```ts
interface UseWebMCPToolResult<TInput, TOutput> {
  unregister: () => void
  getRegistration: () => RegisteredTool<TInput, TOutput> | undefined
}
```

Vue accepts refs, computed values, and getters for `when`. React accepts a boolean computed during render. Svelte accepts a boolean, function, or readable store.
