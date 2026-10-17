// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { installPiServiceWorker } from './worker'
import { openRuntime } from './runtime-engine'
import { createPeer } from './protocol'
import { piSessionKey } from './session'

vi.mock('./runtime-engine', function runtime() {
  return { openRuntime: vi.fn() }
})

it('installs only lifecycle/message handlers and leaves the PWA fetch/controller alone', function test() {
  const addEventListener = vi.fn()
  const removeEventListener = vi.fn()
  const uninstall = installPiServiceWorker({
    addEventListener,
    removeEventListener
  } as unknown as ServiceWorkerGlobalScope)
  expect(
    addEventListener.mock.calls.map(function event(call) {
      return call[0]
    })
  ).toEqual(['install', 'message'])
  uninstall()
  expect(removeEventListener).toHaveBeenCalledTimes(2)
})

it('stops the runtime when a send request is cancelled', async function test() {
  let complete!: (outcome: { status: 'interrupted' }) => void
  const completed = new Promise<{ status: 'interrupted' }>(function wait(resolve) {
    complete = resolve
  })
  let started!: () => void
  const pendingStart = new Promise<void>(function wait(resolve) {
    started = resolve
  })
  const stop = vi.fn(async function stop() {
    complete({ status: 'interrupted' })
  })
  vi.mocked(openRuntime).mockResolvedValue({
    getSnapshot() {
      return { state: 'idle', messages: [] }
    },
    subscribe() {
      return function unsubscribe() {}
    },
    async send() {
      started()
      return completed
    },
    stop,
    async clear() {},
    async destroy() {
      await stop()
    }
  })
  const scope = new EventTarget()
  const client = { id: 'document', url: 'https://webmcp.test/app' }
  Object.assign(scope, {
    location: new URL('https://webmcp.test/pi/worker.js'),
    clients: {
      async get() {
        return client
      }
    }
  })
  const uninstall = installPiServiceWorker(scope as ServiceWorkerGlobalScope)
  const session = { namespace: 'tests', ownerId: 'one', conversationId: 'chat' }
  const binding = {
    connectionId: 'connection',
    documentId: 'document',
    sessionKey: piSessionKey(session)
  }
  const channel = new MessageChannel()
  const peer = createPeer(channel.port1, binding, {
    methods: [],
    async request() {},
    sendRequest(message) {
      dispatch(message)
    }
  })
  function dispatch(data: unknown, ports: MessagePort[] = []) {
    const event = new Event('message')
    Object.assign(event, {
      data,
      source: client,
      ports,
      waitUntil(pending: Promise<unknown>) {
        void pending
      }
    })
    scope.dispatchEvent(event)
  }
  try {
    dispatch({ version: 1, op: 'connect', requestId: 'connect', session, binding }, [channel.port2])
    await peer.call('ready', { available: true, capabilities: { conversation: true } })
    const controller = new AbortController()
    const outcome = peer.call('send', 'Work', controller.signal)
    await pendingStart
    controller.abort()
    await expect(outcome).rejects.toMatchObject({ code: 'stale_document' })
    expect(stop).toHaveBeenCalledOnce()
  } finally {
    peer.close()
    uninstall()
  }
})
