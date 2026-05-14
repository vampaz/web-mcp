# Browser Support

WebMCP Kit detects native browser support at runtime. It does not assume that every Chrome build has WebMCP enabled.

```ts
import { getSupportLabel, isWebMCPSupported } from '@webmcp-kit/core'

if (isWebMCPSupported()) {
  console.log('Native WebMCP is available.')
} else {
  console.log(getSupportLabel())
}
```

## Native Mode

When `navigator.modelContext.registerTool` exists, WebMCP Kit registers tools with the browser native API and also keeps a fallback copy for local inspection and tests.

## Fallback Mode

Fallback mode keeps tools in an in-memory registry. It is useful for:

- local demos
- devtools inspection
- Playwright tests
- provider planning experiments
- catalog exports

Fallback mode is not the same as native browser-agent access. It does not give the browser agent new powers; it only gives your app a development and testing surface.

## Chrome Built-In AI

The demo can use Chrome built-in AI through `window.LanguageModel` when available. Requests should specify an output language. WebMCP Kit uses English output for planner calls so Chrome can optimize quality and safety checks.

If Chrome built-in AI is unavailable, downloadable, or still initializing, the planner can fall back to local heuristics or a configured provider.

## Inspecting Tools

During development or preview deployments, mount `@webmcp-kit/devtools` to inspect registered tools, warnings, prompt previews, sample inputs, and invocation history. The demo gates the overlay behind `import.meta.env.DEV || import.meta.env.PUBLIC_WEBMCP_PREVIEW === 'true'`.

## Chrome And Lighthouse Inspection

Use browser feature detection as the source of truth before documenting support for a specific environment. In supported Chrome or Lighthouse environments, inspect the native browser surface first, then compare it with the WebMCP Kit devtools overlay. In unsupported environments, the overlay and test bridge should still show fallback-registered tools so demos and QA remain usable.
