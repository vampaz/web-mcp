import { subscribeWebMCPKitEvents } from './events'
import { invokeTool, listAvailableTools } from './registry'
import type {
  JsonSchema,
  RegisteredTool,
  ToolAnnotations,
  ToolInvocationResult
} from './interfaces/tool'

/**
 * Protocol identifier shared by every page-bridge message. Senders and receivers
 * ignore messages carrying any other protocol string, so incompatible versions
 * can coexist on the same page.
 */
export const PAGE_BRIDGE_PROTOCOL = 'webmcp-kit-bridge/v1'

export interface PageBridgeTool {
  name: string
  description: string
  inputSchema: JsonSchema
  annotations?: ToolAnnotations
}

export interface PageBridgeCatalog {
  revision: string
  tools: PageBridgeTool[]
}

export type PageBridgeRequest =
  | { protocol: typeof PAGE_BRIDGE_PROTOCOL; kind: 'discover'; requestId: string }
  | {
      protocol: typeof PAGE_BRIDGE_PROTOCOL
      kind: 'invoke'
      requestId: string
      name: string
      input: Record<string, unknown>
    }
  | { protocol: typeof PAGE_BRIDGE_PROTOCOL; kind: 'cancel'; requestId: string }

export type PageBridgeReply =
  | {
      protocol: typeof PAGE_BRIDGE_PROTOCOL
      kind: 'catalog-reply'
      requestId: string
      catalog: PageBridgeCatalog
    }
  | {
      protocol: typeof PAGE_BRIDGE_PROTOCOL
      kind: 'invoke-reply'
      requestId: string
      status: 'result'
      output: unknown
    }
  | {
      protocol: typeof PAGE_BRIDGE_PROTOCOL
      kind: 'invoke-reply'
      requestId: string
      status: 'error'
      error: string
    }
  | { protocol: typeof PAGE_BRIDGE_PROTOCOL; kind: 'cancel-reply'; requestId: string }

/** Unsolicited notice that the registry changed; carries the new catalog revision. */
export interface PageBridgeToolsChanged {
  protocol: typeof PAGE_BRIDGE_PROTOCOL
  kind: 'tools-changed'
  revision: string
}

export type PageBridgeMessage = PageBridgeReply | PageBridgeToolsChanged

export interface PageBridgeHandle {
  uninstall(): void
}

interface BridgeState {
  calls: Map<string, AbortController>
  uninstall(): void
}

let state: BridgeState | undefined

/**
 * Any script running in the page can message this bridge. That carries no extra
 * trust: such a script could already call the page's own code directly. Sites
 * that do not want this surface simply never call `installPageBridge`.
 */
export function installPageBridge(): PageBridgeHandle {
  if (state) return { uninstall: state.uninstall }

  const instanceId = randomId()
  let epoch = 0
  const calls = new Map<string, AbortController>()
  let revision = `${instanceId}:0`

  function bumpRevision(): void {
    epoch++
    revision = `${instanceId}:${epoch}`
  }

  function post(message: PageBridgeMessage): void {
    try {
      window.postMessage(message, window.location.origin)
    } catch {
      /* A reply that cannot be cloned cannot be delivered; the sender times out. */
    }
  }

  /**
   * The wire format is JSON: window.postMessage structured-clones and rejects Proxy
   * objects, which every framework-reactive value is. Unwrap them and drop what JSON
   * cannot carry before posting.
   */
  function jsonClone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value))
  }

  function announceToolsChanged(): void {
    bumpRevision()
    post({ protocol: PAGE_BRIDGE_PROTOCOL, kind: 'tools-changed', revision })
  }

  async function dispatch(request: PageBridgeRequest): Promise<void> {
    if (request.kind === 'discover') {
      post({
        protocol: PAGE_BRIDGE_PROTOCOL,
        kind: 'catalog-reply',
        requestId: request.requestId,
        catalog: {
          revision,
          // Clone each tool on its own: one registry entry with a cycle or a BigInt in its
          // schema must not prevent the rest of the catalog from arriving.
          tools: listAvailableTools().flatMap(function cloneTool(registration) {
            try {
              return [jsonClone(toBridgeTool(registration))]
            } catch {
              return []
            }
          })
        }
      })
      return
    }
    if (request.kind === 'cancel') {
      calls.get(request.requestId)?.abort()
      post({ protocol: PAGE_BRIDGE_PROTOCOL, kind: 'cancel-reply', requestId: request.requestId })
      return
    }
    if (typeof request.name !== 'string' || !isRecord(request.input)) {
      post({
        protocol: PAGE_BRIDGE_PROTOCOL,
        kind: 'invoke-reply',
        requestId: request.requestId,
        status: 'error',
        error: 'Invalid invoke request.'
      })
      return
    }
    const controller = new AbortController()
    calls.set(request.requestId, controller)
    let result: ToolInvocationResult
    try {
      result = await invokeTool({
        toolName: request.name,
        input: request.input,
        source: 'page-bridge',
        signal: controller.signal
      })
    } catch {
      post({
        protocol: PAGE_BRIDGE_PROTOCOL,
        kind: 'invoke-reply',
        requestId: request.requestId,
        status: 'error',
        error: 'Tool invocation failed.'
      })
      return
    } finally {
      calls.delete(request.requestId)
    }
    if (result.status === 'success') {
      let output: unknown
      try {
        // JSON has no undefined value, so a void tool skips the round-trip: structured clone
        // carries undefined, which the extension reads as "no output" instead of an error.
        output = result.output === undefined ? undefined : jsonClone(result.output)
      } catch {
        post({
          protocol: PAGE_BRIDGE_PROTOCOL,
          kind: 'invoke-reply',
          requestId: request.requestId,
          status: 'error',
          error: 'Tool result could not be delivered.'
        })
        return
      }
      post({
        protocol: PAGE_BRIDGE_PROTOCOL,
        kind: 'invoke-reply',
        requestId: request.requestId,
        status: 'result',
        output
      })
      return
    }
    post({
      protocol: PAGE_BRIDGE_PROTOCOL,
      kind: 'invoke-reply',
      requestId: request.requestId,
      status: 'error',
      error: result.error ?? 'Tool invocation failed.'
    })
  }

  function onMessage(event: MessageEvent): void {
    if (event.source !== window || event.origin !== window.location.origin) return
    const data = event.data as Partial<PageBridgeRequest> | null
    if (
      !data ||
      typeof data !== 'object' ||
      data.protocol !== PAGE_BRIDGE_PROTOCOL ||
      (data.kind !== 'discover' && data.kind !== 'invoke' && data.kind !== 'cancel') ||
      typeof data.requestId !== 'string'
    )
      return
    void dispatch(data as PageBridgeRequest).catch(function ignore() {})
  }

  function onKitEvent(): void {
    announceToolsChanged()
  }

  const unsubscribeKitEvents = subscribeWebMCPKitEvents(function announceRegistryChange(event) {
    if (event.type === 'registered' || event.type === 'unregistered') onKitEvent()
  })

  let uninstalled = false
  state = {
    calls,
    uninstall() {
      if (uninstalled) return
      uninstalled = true
      unsubscribeKitEvents()
      window.removeEventListener('message', onMessage)
      for (const controller of calls.values()) controller.abort()
      calls.clear()
      state = undefined
    }
  }
  window.addEventListener('message', onMessage)
  return { uninstall: state.uninstall }
}

function toBridgeTool(registration: RegisteredTool): PageBridgeTool {
  return {
    name: registration.tool.name,
    description: registration.tool.description,
    inputSchema: registration.tool.inputSchema,
    ...(registration.tool.annotations ? { annotations: registration.tool.annotations } : {})
  }
}

/** `crypto.randomUUID` is missing on insecure origins, which must not break site startup. */
function randomId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return Math.random().toString(16).slice(2) + Date.now().toString(16)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
