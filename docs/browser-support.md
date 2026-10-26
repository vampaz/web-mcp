# Browser Support

WebMCP Kit detects native browser support at runtime. It does not assume that every Chrome build has WebMCP enabled.

```ts
import { getSupportLabel, isWebMCPSupported } from '@vampaz/webmcp-kit'

if (isWebMCPSupported()) {
  console.log('Native WebMCP is available.')
} else {
  console.log(getSupportLabel())
}
```

## Native Mode

When `document.modelContext.registerTool` exists, WebMCP Kit registers tools with the browser native API and also keeps a fallback copy for local inspection and tests. Older `navigator.modelContext.registerTool` builds are still supported as a legacy fallback.

Native registration follows the current Chrome WebMCP shape:

- Tool `annotations`, including `readOnlyHint` and `untrustedContentHint`, are passed to `document.modelContext.registerTool`.
- Native cleanup uses `AbortSignal` when available, matching Chrome's documented unregister path.
- Returned native `unregister()` or `dispose()` handles are still honored for compatibility.
- Registration handles expose a `ready` promise because native registration is asynchronous. The fallback registry is usable immediately, and an asynchronous native failure switches the handle to fallback mode with a warning.

## Fallback Mode

Fallback mode keeps tools in an in-memory registry. It is useful for:

- local demos
- devtools inspection
- Playwright tests
- provider resolution experiments
- catalog exports

Fallback mode exposes tools to application-controlled callers, including production assistants, devtools, and tests. It does not enable native browser-agent discovery in a browser that lacks WebMCP.

## Chrome Built-In AI

The kit's Chrome resolver uses `window.LanguageModel` when available. It declares English text input and output. The local lab uses its configured LM Studio model; it does not automatically switch to browser AI.

The command input uses the supplied `resolver` or `resolverOptions`. To offer Chrome AI in its selector, add an explicit option whose factory calls `createResolver({ provider: 'chrome-built-in' })`; omit that option to hide it. There is no `showChromeAI` option. Without a supplied resolver or option list, the element uses automatic Chrome/local resolution. See [resolver configuration](./resolver-providers.md#command-input).

The automatic resolver uses local heuristics when Chrome AI is unavailable. Downloadable or downloading Chrome models remain selected and initialize from a user command. Non-strict Chrome resolution can fall back to heuristics on failure. Explicit Chrome selection and strict conversational resolution report failure without substituting another provider.

## Application-Owned Browser Models

An application can configure the command input with a custom browser-local resolver. For example, a WebLLM integration owns its model download and WebGPU requirements. The application installs that dependency and passes a `ToolResolver` to the kit. WebMCP Kit does not bundle WebLLM or download a model on import.

## Inspecting Tools

During development or preview deployments, mount `@vampaz/webmcp-kit/devtools` to inspect registered tools, warnings, prompt previews, sample inputs, and invocation history. The consuming application owns the environment/access gate and must deliberately mount the overlay. The local lab's Toolkit tab loads it on demand in development.

## Chrome And Lighthouse Inspection

Use browser feature detection as the source of truth before documenting support for a specific environment. In supported Chrome or Lighthouse environments, inspect the native browser surface first, then compare it with the WebMCP Kit devtools overlay. In unsupported environments, the overlay and test bridge should still show fallback-registered tools so demos and QA remain usable.

Useful references:

- [Chrome WebMCP Imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api)
- [Chrome WebMCP Declarative API](https://developer.chrome.com/docs/ai/webmcp/declarative-api)
- [Chrome WebMCP best practices](https://developer.chrome.com/docs/ai/webmcp/best-practices)
- [Chrome WebMCP evals](https://developer.chrome.com/docs/ai/webmcp/evals)
- [When to use WebMCP and MCP](https://developer.chrome.com/docs/ai/webmcp/compare-mcp)

## Pi and chat prerequisites

Core fallback needs neither native WebMCP nor Pi. The independent chat accepts an application controller and does not require Pi or a framework. Chat uses Custom Elements, Shadow DOM, and ResizeObserver; popup mode also uses the Popover API. Embedded Pi requires a secure context, IndexedDB, Web Locks, and an explicitly configured conversational model. Missing prerequisites produce an error; persistent history never silently becomes in-memory history. Use the TLS plugin's advertised HTTPS domain for development and see [operations](./operations.md#browser-prerequisites) for deployment checks.

The source suite selects Chromium with native WebMCP disabled, Firefox, and WebKit for portable storage/chat checks. Pi tests cover the runtime without a service worker and coexistence with an application's PWA service worker. A separate `native-chromium` project enables the real WebMCP API and asserts discovery/invocation/cancellation. Mocked native unit tests are separate evidence. `test:lmstudio` is a separate real-model lane and does not run in the standard CI workflow.

Tests on 2026-10-17 use Playwright 1.64.1: Chromium 156.0.8078.4, Firefox 157.0, and WebKit 27.2. Browser results and any local platform limitations are recorded in the implementation evidence; configured projects do not imply passing tests. No minimum browser version beyond these tested prerequisites is claimed.
