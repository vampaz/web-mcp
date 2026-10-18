/// <reference lib="webworker" />
import type { PiController } from './interfaces/controller'
import type { PiToolCatalog } from './interfaces/host'
import type { PlannerContext, ToolInvocationResult, ToolPlan } from '@vampaz/webmcp-kit'
import { createPeer, validConnect, validEnvelope } from './protocol'
import { PiFailure } from './errors'
import { openRuntime } from './runtime-engine'

export function installPiServiceWorker(
  scope: ServiceWorkerGlobalScope = self as unknown as ServiceWorkerGlobalScope
): () => void {
  const connections = new Map<
    string,
    {
      clientId: string
      binding: import('./interfaces/protocol').PiBinding
      receive(data: unknown): Promise<void>
      close(): Promise<void>
    }
  >()
  function install(event: ExtendableEvent) {
    event.waitUntil(scope.skipWaiting())
  }
  function receive(event: ExtendableMessageEvent) {
    const source = event.source
    const port = event.ports[0]
    if (!source || !('id' in source) || !('url' in source)) return
    const client = source as Client
    const documentUrl = new URL(client.url)
    if (documentUrl.origin !== scope.location.origin) return
    if (!validConnect(event.data)) {
      const connection = connections.get(event.data?.binding?.connectionId)
      if (
        connection &&
        client.id === connection.clientId &&
        validEnvelope(event.data, connection.binding)
      )
        event.waitUntil(connection.receive(event.data))
      return
    }
    if (!port) return
    if (
      documentUrl.origin !== scope.location.origin ||
      connections.has(event.data.binding.connectionId)
    ) {
      port.close()
      return
    }
    const command = event.data
    let runtime: PiController | undefined
    let ready: Promise<PiController> | undefined
    let unsubscribe: (() => void) | undefined
    let closed = false
    let plannerCapabilities = { conversation: false }
    let plannerAvailable = false
    const peer = createPeer(port, command.binding, {
      methods: ['ready', 'send', 'stop', 'clear', 'destroy', 'ping'],
      async request(method, payload, signal) {
        const current = await scope.clients.get(client.id)
        if (closed || !current || current.url !== client.url)
          throw new PiFailure('stale_document', 'The initiating document is no longer available.')
        if (method === 'ping') return null
        if (method === 'ready') {
          if (ready)
            throw new PiFailure('transport_failed', 'The conversation is already connected.')
          const config = payload as {
            available?: boolean
            capabilities?: { conversation?: boolean }
          }
          plannerAvailable = config?.available === true
          plannerCapabilities = { conversation: config?.capabilities?.conversation === true }
          ready = openRuntime({
            session: command.session,
            limits: command.limits,
            host: {
              async discover(signal) {
                return (await peer.call('discover', undefined, signal)) as PiToolCatalog
              },
              async context(signal) {
                return (await peer.call('context', undefined, signal)) as PlannerContext
              },
              async invoke(call, signal) {
                return (await peer.call('invoke', call, signal, null)) as ToolInvocationResult
              }
            },
            planner: {
              name: 'Application planner',
              available: plannerAvailable,
              capabilities: plannerCapabilities,
              status: plannerAvailable ? 'ready' : 'unavailable',
              detail: 'The application owns the planner.',
              async plan(message, tools, context, options) {
                return (await peer.call(
                  'plan',
                  {
                    message,
                    tools: tools.map(function describe(tool) {
                      return {
                        name: tool.name,
                        description: tool.description,
                        inputSchema: tool.inputSchema
                      }
                    }),
                    context,
                    singleStep: options?.singleStep
                  },
                  options?.signal
                )) as ToolPlan
              }
            }
          })
          runtime = await ready
          unsubscribe = runtime.subscribe(function changed(snapshot) {
            if (!closed) peer.event('snapshot', snapshot)
          })
          return runtime.getSnapshot()
        }
        if (!ready)
          throw new PiFailure('transport_failed', 'Connect before sending conversation commands.')
        const controller = await ready
        if (method === 'send') {
          if (typeof payload !== 'string')
            throw new PiFailure('configuration', 'The message must be text.')
          signal.throwIfAborted()
          function cancel() {
            void controller.stop()
          }
          signal.addEventListener('abort', cancel, { once: true })
          try {
            return await controller.send(payload)
          } finally {
            signal.removeEventListener('abort', cancel)
          }
        }
        if (method === 'stop') {
          await controller.stop()
          return null
        }
        if (method === 'clear') {
          await controller.clear()
          return null
        }
        unsubscribe?.()
        await controller.destroy()
        connections.delete(command.binding.connectionId)
        // Return the acknowledgement before closing the port.
        setTimeout(function disconnect() {
          closed = true
          peer.close()
        }, 0)
        return null
      }
    })
    connections.set(command.binding.connectionId, {
      clientId: client.id,
      binding: command.binding,
      receive: peer.receive,
      async close() {
        closed = true
        unsubscribe?.()
        await runtime?.destroy()
        peer.close()
      }
    })
  }
  scope.addEventListener('install', install)
  scope.addEventListener('message', receive)
  return function uninstall() {
    scope.removeEventListener('install', install)
    scope.removeEventListener('message', receive)
    for (const connection of connections.values()) void connection.close()
    connections.clear()
  }
}
