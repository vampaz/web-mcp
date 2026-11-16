# Page bridge

[Documentation index](./README.md) · [API reference](./api-reference.md) · [Security](./security.md)

`@vampaz/webmcp-kit/page-bridge` exposes the fallback registry to a script in the same window when the browser has no native WebMCP. Use it for a page-owned integration or an embedded agent that can already post messages into the page. It is not a network transport, an MCP server, or an authentication boundary.

```ts
import { installPageBridge } from '@vampaz/webmcp-kit/page-bridge'

const bridge = installPageBridge()
// Later, during application teardown:
bridge.uninstall()
```

`installPageBridge()` is a singleton; a second call shares the installed bridge and uninstall function, though the returned handle object is not guaranteed to be the same object. Uninstall removes the message listener and aborts the signals for in-flight invocations. Cancellation is cooperative: a tool that ignores its signal may continue or complete. The bridge accepts only messages where `event.source === window` and `event.origin === window.location.origin`, and posts replies to the current origin. That same-window restriction prevents cross-frame delivery; it does **not** make messages trusted. Any script already running in the page can use the bridge. That adds no trust beyond the script already running in the page, but it is an explicit capability surface: install it only when those scripts are intended to discover and invoke tools. Tools still run through normal validation, scope, approval, guards, and execution. Apps that do not want this surface must not install it.

## Protocol

The protocol string is `webmcp-kit-bridge/v1`. Messages with another protocol are ignored.

### Requests

| `kind`     | Fields                                   | Effect                                                     |
| ---------- | ---------------------------------------- | ---------------------------------------------------------- |
| `discover` | `protocol`, `requestId`                  | Returns the current available-tool catalog.                |
| `invoke`   | `protocol`, `requestId`, `name`, `input` | Invokes one available tool through the normal pipeline.    |
| `cancel`   | `protocol`, `requestId`                  | Aborts the signal for the invocation with that request ID. |

`requestId` is a caller-chosen string. `name` must be a string and `input` must be a JSON object. An invalid invoke request returns an error reply with `Invalid invoke request.` and does not execute a tool.

### Replies

```ts
interface PageBridgeCatalog {
  revision: string
  tools: Array<{
    name: string
    description: string
    inputSchema: JsonSchema
    annotations?: ToolAnnotations
  }>
}

type PageBridgeReply =
  | {
      protocol: 'webmcp-kit-bridge/v1'
      kind: 'catalog-reply'
      requestId: string
      catalog: PageBridgeCatalog
    }
  | {
      protocol: 'webmcp-kit-bridge/v1'
      kind: 'invoke-reply'
      requestId: string
      status: 'result'
      output: unknown
    }
  | {
      protocol: 'webmcp-kit-bridge/v1'
      kind: 'invoke-reply'
      requestId: string
      status: 'error'
      error: string
    }
  | {
      protocol: 'webmcp-kit-bridge/v1'
      kind: 'cancel-reply'
      requestId: string
    }
```

`catalog-reply` includes only available tools. The `revision` is an opaque string that changes when the registry changes. Successful invocations return `status: 'result'` and `output`; failures return `status: 'error'` and an error string. A `cancel` request receives `cancel-reply` when the abort request is acknowledged. It does not guarantee completion, failure, or rollback. The eventual `invoke-reply` reflects the actual invocation outcome: it may be a success result if the tool ignores cancellation, or it may not arrive while the invocation remains pending. Cancelling an ID that is not in flight still receives `cancel-reply`.

### Unsolicited change notice

```ts
interface PageBridgeToolsChanged {
  protocol: 'webmcp-kit-bridge/v1'
  kind: 'tools-changed'
  revision: string
}
```

The bridge posts one of these whenever a tool is registered or unregistered. Use it to refresh a cached catalog.

## Duplicate request IDs

A `requestId` identifies one in-flight invocation. If a second `invoke` uses the same `requestId` while the first is still running, the bridge replies with `status: 'error'` and `error: 'An invocation with this request ID is already in progress.'`. It does not replace, cancel, or execute the second request. The first invocation remains in flight and can be cancelled with a `cancel` request using the same `requestId`. After the first invocation settles, that ID can be reused.

## Serialization

Replies use `window.postMessage` and carry JSON-safe values. Framework-reactive (Proxy) tool outputs and catalogs are unwrapped with a JSON round-trip before posting. A result that JSON cannot carry produces `status: 'error'` with `Tool result could not be delivered.`; a void result is posted as `output: undefined`. Tool catalog entries that cannot be serialized are omitted individually, so one malformed schema does not hide the rest of the catalog.

## Trust and scope

The bridge is page-local. It is not an authentication system, authorization boundary, or a replacement for server-side checks. Approval and guards still apply to every invocation. Do not install it merely to make an external connection work; use native browser WebMCP when available, and use an application-owned transport when messages must cross process or origin boundaries.

The separate `/mcp-bridge` entry is an in-process JSON-RPC-style adapter; it is not the page bridge protocol.
