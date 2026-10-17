import type { WebMCPTool } from '@vampaz/webmcp-kit'
import type {
  PiController,
  PiHarnessOptions,
  PiSnapshot,
  PiTurnOutcome
} from './interfaces/controller'
import type { PiBinding, PiConnect, PiPeer } from './interfaces/protocol'
import { isPiError, piError, PiFailure } from './errors'
import { createPeer } from './protocol'
import { piSessionKey, resolvePiLimits } from './session'
import { createRegistryToolHost } from './tool-host'

export async function createPiHarness(options: PiHarnessOptions): Promise<PiController> {
  const key = piSessionKey(options.session)
  const limits = resolvePiLimits(options.limits)
  if (
    typeof window === 'undefined' ||
    !window.isSecureContext ||
    !navigator.serviceWorker ||
    !navigator.locks ||
    typeof indexedDB === 'undefined'
  )
    throw new PiFailure(
      'unsupported',
      'Pi needs a secure browser context, service workers, IndexedDB, and Web Locks.'
    )
  const url = new URL(options.worker.url, location.href)
  const scope = new URL(options.worker.scope, location.href)
  if (
    url.origin !== location.origin ||
    scope.origin !== location.origin ||
    !scope.pathname.endsWith('/') ||
    !url.pathname.startsWith(scope.pathname) ||
    scope.pathname === '/'
  )
    throw new PiFailure(
      'configuration',
      'Use a same-origin worker URL inside its dedicated non-root scope.'
    )
  const registration = await navigator.serviceWorker.register(url.href, {
    scope: scope.href,
    type: 'module'
  })
  let worker = registration.installing ?? registration.waiting ?? registration.active
  if (!worker) throw new PiFailure('unsupported', 'The Pi service worker could not start.')
  await waitForActivation(worker)
  let peer: PiPeer
  const host = options.host ?? createRegistryToolHost(options.context)
  let snapshot: PiSnapshot = { state: 'loading', messages: [] }
  let closed = false
  let activeTurn = false
  let turnRevision = 0
  let sending = false
  let stopped = false
  let clearing = false
  let checking = false
  let suspension: Promise<void> | undefined
  const listeners = new Set<(snapshot: PiSnapshot) => void>()
  function publish(value: PiSnapshot) {
    if (closed && value.state !== 'closed') return
    if (sending && !activeTurn && !stopped && !['error', 'closed'].includes(value.state))
      value = { ...value, state: 'running' }
    snapshot = structuredClone(value)
    for (const listener of listeners) {
      try {
        listener(structuredClone(snapshot))
      } catch {
        /* Subscriber failure cannot affect the worker. */
      }
    }
  }
  async function connect() {
    if (closed) throw new PiFailure('stale_document', 'The document closed.')
    if (peer) {
      void peer.call('destroy', undefined, undefined, 1000).catch(function disconnected() {})
      peer.close()
    }
    worker?.removeEventListener('statechange', workerChanged)
    worker = registration.active ?? registration.installing ?? registration.waiting
    if (!worker)
      throw new PiFailure('unsupported', 'The Pi worker is unavailable. Reload the page.')
    await waitForActivation(worker)
    if (closed) throw new PiFailure('stale_document', 'The document closed.')
    const target = worker
    const binding: PiBinding = {
      connectionId: crypto.randomUUID(),
      documentId: crypto.randomUUID(),
      sessionKey: key
    }
    const channel = new MessageChannel()
    peer = createPeer(channel.port1, binding, {
      sendRequest(message) {
        target.postMessage(message)
      },
      methods: ['discover', 'context', 'invoke', 'plan'],
      async request(method, payload, signal) {
        if (closed) throw new PiFailure('stale_document', 'The document closed.')
        if (method === 'discover') return host.discover(signal)
        if (!activeTurn)
          throw new PiFailure(
            'stale_document',
            'Only an active user turn can request application context, inference, or actions.'
          )
        if (method === 'context') return host.context(signal)
        if (method === 'invoke') {
          const call = payload as Parameters<typeof host.invoke>[0]
          if (
            !call ||
            typeof call.name !== 'string' ||
            typeof call.revision !== 'string' ||
            !call.input ||
            typeof call.input !== 'object' ||
            Array.isArray(call.input) ||
            'confirmed' in call
          )
            throw new PiFailure('transport_failed', 'Invalid tool request.')
          return host.invoke(call, signal)
        }
        const request = payload as {
          message: string
          tools: WebMCPTool[]
          context: Record<string, unknown>
          singleStep?: boolean
        }
        if (
          !request ||
          typeof request.message !== 'string' ||
          !Array.isArray(request.tools) ||
          !request.context ||
          typeof request.context !== 'object'
        )
          throw new PiFailure('transport_failed', 'Invalid planner request.')
        try {
          return await options.planner.plan(request.message, request.tools, request.context, {
            signal,
            singleStep: request.singleStep === true,
            maxRequestBytes: limits.maxRequestBytes
          })
        } catch (error) {
          const failure = piError(error)
          throw new PiFailure(failure.code, failure.message)
        }
      },
      event(method, payload) {
        if (method === 'snapshot' && isSnapshot(payload)) publish(payload)
      }
    })
    const command: PiConnect = {
      version: 1,
      op: 'connect',
      requestId: crypto.randomUUID(),
      binding,
      session: options.session,
      limits: options.limits
    }
    target.postMessage(command, [channel.port2])
    target.addEventListener('statechange', workerChanged)
    const ready = await peer.call(
      'ready',
      { capabilities: options.planner.capabilities, available: options.planner.available },
      undefined,
      15000
    )
    if (!isSnapshot(ready)) throw new PiFailure('transport_failed', 'Invalid worker snapshot.')
    if (closed) throw new PiFailure('stale_document', 'The document closed.')
    publish(ready)
  }
  async function ensureConnected() {
    try {
      await peer.call('ping', undefined, undefined, 2000)
    } catch {
      await connect()
    }
  }
  function cancelled() {
    activeTurn = false
    stopped = true
    peer?.cancelIncoming()
    options.onCancel?.()
  }
  function pagehide(event: PageTransitionEvent) {
    if (event.persisted) {
      suspension = api.stop().catch(function disconnected() {
        // A restored document reconnects on its next user turn.
      })
    } else void api.destroy()
  }
  function workerChanged() {
    if (worker?.state !== 'redundant' || closed) return
    cancelled()
    peer.close()
    publish({
      ...snapshot,
      state: 'interrupted',
      error: {
        code: 'transport_failed',
        message:
          'The worker changed. Check application state, then send a new request to reconnect.'
      }
    })
  }
  const heartbeat = setInterval(async function checkWorker() {
    if (closed || checking || !activeTurn) return
    checking = true
    const connection = peer
    const revision = turnRevision
    try {
      await connection.call('ping', undefined, undefined, 3000)
    } catch (error) {
      if (!closed && activeTurn && peer === connection && turnRevision === revision) {
        cancelled()
        peer.close()
        publish({ ...snapshot, state: 'interrupted', error: piError(error, 'transport_failed') })
      }
    } finally {
      checking = false
    }
  }, 2000)
  const api: PiController = {
    getSnapshot() {
      return structuredClone(snapshot)
    },
    subscribe(listener) {
      listeners.add(listener)
      listener(structuredClone(snapshot))
      return function unsubscribe() {
        listeners.delete(listener)
      }
    },
    async send(text) {
      if (closed)
        return {
          status: 'error',
          error: { code: 'configuration', message: 'This conversation has closed.' }
        }
      if (sending || clearing || ['loading', 'running', 'stopping'].includes(snapshot.state))
        return {
          status: 'error',
          error: { code: 'conversation_busy', message: 'Wait for the current operation to finish.' }
        }
      if (typeof text !== 'string' || !text.trim() || text.length > 16000)
        return {
          status: 'error',
          error: { code: 'configuration', message: 'Enter a message of 1–16000 characters.' }
        }
      sending = true
      turnRevision++
      stopped = false
      publish({ ...snapshot, state: 'running', error: undefined })
      try {
        await suspension
        await ensureConnected()
        if (closed || stopped) {
          publish({ ...snapshot, state: 'interrupted' })
          return { status: 'interrupted' }
        }
        activeTurn = true
        // Individual model requests and the heartbeat bound failures, not the entire turn.
        const outcome = await peer.call('send', text, undefined, null)
        if (!isTurnOutcome(outcome))
          throw new PiFailure(
            'transport_failed',
            'Invalid worker turn outcome. Check application state before continuing.'
          )
        publish({
          ...snapshot,
          state:
            outcome.status === 'completed'
              ? 'idle'
              : outcome.status === 'error'
                ? 'error'
                : 'interrupted',
          error: outcome.error
        })
        return outcome
      } catch (error) {
        cancelled()
        const failure = piError(error, 'transport_failed')
        publish({ ...snapshot, state: 'interrupted', error: failure })
        return { status: 'interrupted', error: failure }
      } finally {
        activeTurn = false
        sending = false
      }
    },
    async stop() {
      cancelled()
      await peer.call('stop', undefined, undefined, 5000)
    },
    async clear() {
      if (closed || sending || clearing)
        throw new PiFailure('conversation_busy', 'Stop the current turn before clearing chat.')
      clearing = true
      try {
        await ensureConnected()
        await peer.call('clear')
      } finally {
        clearing = false
      }
    },
    async destroy() {
      if (closed) return
      closed = true
      clearInterval(heartbeat)
      cancelled()
      window.removeEventListener('pagehide', pagehide)
      worker?.removeEventListener('statechange', workerChanged)
      try {
        await peer?.call('destroy', undefined, undefined, 5000)
      } catch {
        /* Recovery will mark any unfinished operation interrupted. */
      } finally {
        peer?.close()
        publish({ ...snapshot, state: 'closed' })
        listeners.clear()
      }
    }
  }
  window.addEventListener('pagehide', pagehide)
  try {
    await connect()
  } catch (error) {
    await api.destroy()
    throw error
  }
  return api
}

function isSnapshot(value: unknown): value is PiSnapshot {
  if (!value || typeof value !== 'object') return false
  const snapshot = value as PiSnapshot
  return (
    ['loading', 'idle', 'running', 'stopping', 'interrupted', 'error', 'closed'].includes(
      snapshot.state
    ) &&
    (snapshot.error === undefined || isPiError(snapshot.error)) &&
    Array.isArray(snapshot.messages) &&
    snapshot.messages.every(function valid(message) {
      return (
        typeof message?.id === 'string' &&
        ['user', 'assistant', 'tool'].includes(message.role) &&
        typeof message.text === 'string'
      )
    })
  )
}

function isTurnOutcome(value: unknown): value is PiTurnOutcome {
  if (!value || typeof value !== 'object') return false
  const outcome = value as PiTurnOutcome
  return (
    ['completed', 'interrupted', 'error'].includes(outcome.status) &&
    (outcome.error === undefined || isPiError(outcome.error))
  )
}

async function waitForActivation(worker: ServiceWorker): Promise<void> {
  await new Promise<void>(function wait(resolve, reject) {
    const timeout = setTimeout(function expired() {
      finish(new PiFailure('unsupported', 'The Pi worker could not activate.'))
    }, 15000)
    function finish(error?: Error) {
      clearTimeout(timeout)
      worker.removeEventListener('statechange', changed)
      if (error) reject(error)
      else resolve()
    }
    function changed() {
      if (worker.state === 'activated') finish()
      else if (worker.state === 'redundant')
        finish(new PiFailure('unsupported', 'The Pi worker was replaced. Reopen chat.'))
    }
    worker.addEventListener('statechange', changed)
    changed()
  })
}
