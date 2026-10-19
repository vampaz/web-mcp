import { piProtocolVersion } from './interfaces/protocol'
import type { PiBinding, PiConnect, PiEnvelope, PiPeer } from './interfaces/protocol'
import { isPiError, jsonBytes, piError, PiFailure } from './errors'
import { piSessionKey } from './session'

const maxPayloadBytes = 16 * 1024 * 1024
const operations = ['request', 'reply', 'event', 'cancel', 'cancelled']

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function identity(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 1000
}

export function validBinding(value: unknown): value is PiBinding {
  return (
    record(value) &&
    ['connectionId', 'documentId', 'sessionKey'].every(function valid(key) {
      return identity(value[key])
    })
  )
}

export function validConnect(value: unknown): value is PiConnect {
  if (
    !record(value) ||
    value.version !== piProtocolVersion ||
    value.op !== 'connect' ||
    !identity(value.requestId) ||
    !validBinding(value.binding)
  )
    return false
  try {
    return (
      boundedJson(value) &&
      piSessionKey(value.session as PiConnect['session']) === value.binding.sessionKey
    )
  } catch {
    return false
  }
}

export function boundedJson(value: unknown): boolean {
  try {
    return jsonBytes(value) <= maxPayloadBytes
  } catch {
    return false
  }
}

export function validEnvelope(value: unknown, binding: PiBinding): value is PiEnvelope {
  if (
    !record(value) ||
    value.version !== piProtocolVersion ||
    !identity(value.requestId) ||
    !validBinding(value.binding) ||
    !operations.includes(String(value.op)) ||
    !boundedJson(value)
  )
    return false
  if (
    value.binding.connectionId !== binding.connectionId ||
    value.binding.documentId !== binding.documentId ||
    value.binding.sessionKey !== binding.sessionKey
  )
    return false
  if ((value.op === 'request' || value.op === 'event') && !identity(value.method)) return false
  if (value.error !== undefined && !isPiError(value.error)) return false
  return true
}

export function createPeer(
  port: MessagePort,
  binding: PiBinding,
  options: {
    methods: readonly string[]
    request(method: string, payload: unknown, signal: AbortSignal): Promise<unknown>
    event?(method: string, payload: unknown): void
    sendRequest?(message: PiEnvelope): void
  }
): PiPeer {
  const pending = new Map<
    string,
    { resolve(value: unknown): void; reject(error: Error): void; cleanup(): void }
  >()
  const incoming = new Map<string, AbortController>()
  const seen = new Set<string>()
  let closed = false
  function post(message: Omit<PiEnvelope, 'version' | 'binding'>) {
    if (closed) throw new PiFailure('transport_failed', 'The conversation connection closed.')
    const envelope: PiEnvelope = { ...message, version: piProtocolVersion, binding }
    if (!boundedJson(envelope))
      throw new PiFailure(
        'limit_reached',
        'The conversation message exceeds the transport limit. Start a new chat or reduce the selected context.'
      )
    const detached = JSON.parse(JSON.stringify(envelope)) as PiEnvelope
    if (options.sendRequest && (message.op === 'request' || message.op === 'cancel'))
      options.sendRequest(detached)
    else port.postMessage(detached)
  }
  async function receive(event: MessageEvent) {
    if (closed || !validEnvelope(event.data, binding)) return
    const message = event.data
    const id = message.requestId
    if (message.op === 'reply' || message.op === 'cancelled') {
      const operation = pending.get(id)
      if (!operation) return
      pending.delete(id)
      operation.cleanup()
      if (message.op === 'cancelled')
        operation.reject(
          new PiFailure(
            'stale_document',
            'The turn was cancelled. An action already started may have completed.'
          )
        )
      else if (message.error)
        operation.reject(new PiFailure(message.error.code, message.error.message))
      else operation.resolve(message.payload)
    } else if (message.op === 'cancel') {
      incoming.get(id)?.abort()
      post({ op: 'cancelled', requestId: id })
    } else if (message.op === 'event') {
      options.event?.(message.method!, message.payload)
    } else if (message.op === 'request') {
      if (seen.has(id)) return
      if (seen.size >= 10000) {
        api.close()
        return
      }
      seen.add(id)
      const controller = new AbortController()
      incoming.set(id, controller)
      try {
        if (!options.methods.includes(message.method!))
          throw new PiFailure(
            'transport_failed',
            'The Pi service worker speaks a different protocol version. Reload the page to update it.'
          )
        const result = await options.request(message.method!, message.payload, controller.signal)
        if (!closed && !controller.signal.aborted)
          post({ op: 'reply', requestId: id, payload: result })
      } catch (error) {
        if (!closed && !controller.signal.aborted)
          post({ op: 'reply', requestId: id, error: piError(error, 'transport_failed') })
      } finally {
        incoming.delete(id)
      }
    }
  }
  port.addEventListener('message', receive)
  port.start()
  const api: PiPeer = {
    receive(data) {
      return receive({ data } as MessageEvent)
    },
    call(method, payload, signal, timeoutMs = 130000) {
      if (closed)
        return Promise.reject(
          new PiFailure('transport_failed', 'The conversation connection closed.')
        )
      if (signal?.aborted)
        return Promise.reject(
          new PiFailure('stale_document', 'The turn was cancelled before the request started.')
        )
      return new Promise(function call(resolve, reject) {
        const requestId = crypto.randomUUID()
        let cancellation: ReturnType<typeof setTimeout> | undefined
        const timeout =
          timeoutMs === null
            ? undefined
            : setTimeout(function expired() {
                pending.delete(requestId)
                cleanup()
                cancelRemote()
                reject(
                  new PiFailure(
                    'transport_failed',
                    'The worker stopped responding. Reopen chat to restore history. An action outcome may be unknown; check application state.'
                  )
                )
              }, timeoutMs)
        function cleanup() {
          clearTimeout(timeout)
          clearTimeout(cancellation)
          signal?.removeEventListener('abort', abort)
        }
        function cancelRemote() {
          try {
            post({ op: 'cancel', requestId })
          } catch {
            // A disconnected worker cannot acknowledge; the bounded local rejection still settles.
          }
        }
        function abort() {
          cancelRemote()
          cancellation = setTimeout(function unacknowledged() {
            pending.delete(requestId)
            cleanup()
            reject(
              new PiFailure(
                'transport_failed',
                'Cancellation was not acknowledged. Check application state before continuing.'
              )
            )
          }, 3000)
        }
        pending.set(requestId, { resolve, reject, cleanup })
        signal?.addEventListener('abort', abort, { once: true })
        try {
          post({ op: 'request', requestId, method, payload })
          if (signal?.aborted) abort()
        } catch (error) {
          pending.delete(requestId)
          cleanup()
          reject(error)
        }
      })
    },
    event(method, payload) {
      post({ op: 'event', requestId: crypto.randomUUID(), method, payload })
    },
    cancelIncoming() {
      for (const controller of incoming.values()) controller.abort()
    },
    close() {
      if (closed) return
      closed = true
      api.cancelIncoming()
      for (const operation of pending.values()) {
        operation.cleanup()
        operation.reject(new PiFailure('transport_failed', 'The conversation connection closed.'))
      }
      pending.clear()
      port.removeEventListener('message', receive)
      port.close()
    }
  }
  return api
}
