# Framework Extensions Decision

WebMCP Kit should stay framework agnostic by default.

The core package owns:

- tool definitions
- native WebMCP registration
- fallback registry
- events
- resolver configuration
- form helpers
- catalog/adapters

Framework subpaths should not own protocol, resolver, registry, or execution logic. Vue, React, Svelte, and Astro support starts as lifecycle-safe helpers that delegate registration to `@vampaz/webmcp-kit`.

Thin optional subpaths should only wrap lifecycle cleanup and delegate all behavior to core. Current subpaths:

- `@vampaz/webmcp-kit/vue`
- `@vampaz/webmcp-kit/react`
- `@vampaz/webmcp-kit/svelte`

All framework helpers return the same handle:

```ts
interface UseWebMCPToolResult<TInput, TOutput> {
  unregister: () => void
  getRegistration: () => RegisteredTool<TInput, TOutput> | undefined
}
```

Vue accepts refs, computed values, and getters for `when`. React accepts a boolean computed during render. Svelte accepts a boolean or readable store; with runes, wrap state in `toStore(() => value)`.

Each subpath also exports `useWebMCPTools(tools, options?)`. It registers the whole list atomically through core `registerTools()` with the same lifecycle and `when` rules, and returns `{ unregister, getRegistrations }`. A duplicate name registers none of the list.
