import { MessageChannel } from 'node:worker_threads'
import { afterEach, expect, it, vi } from 'vitest'
import { createPiHarness } from './connection'
import { createPeer } from './protocol'
import type { PiConnect, PiEnvelope, PiPeer } from './interfaces/protocol'

afterEach(function cleanup() {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('reports missing durable browser prerequisites without installing anything', async function test() {
  await expect(
    createPiHarness({
      session: { namespace: 'tests', ownerId: 'one', conversationId: 'chat' },
      worker: { url: '/pi/worker.js', scope: '/pi/' },
      resolver: {
        name: 'test',
        available: true,
        status: 'ready',
        detail: '',
        async resolve() {
          throw new Error('must not resolution')
        }
      }
    })
  ).rejects.toMatchObject({ code: 'unsupported' })
})

it('keeps a healthy turn active beyond the individual RPC timeout', async function test() {
  vi.stubGlobal('MessageChannel', MessageChannel)
  vi.stubGlobal('isSecureContext', true)
  vi.stubGlobal('indexedDB', {})
  let remote: PiPeer | undefined
  let finish: (() => void) | undefined
  let started!: () => void
  const pendingStart = new Promise<void>(function wait(resolve) {
    started = resolve
  })
  const worker = Object.assign(new EventTarget(), {
    state: 'activated',
    postMessage(message: PiConnect | PiEnvelope, ports?: MessagePort[]) {
      if (message.op === 'connect') {
        remote = createPeer(ports![0], message.binding, {
          methods: ['ready', 'send', 'ping', 'destroy'],
          async request(method) {
            if (method === 'ready') return { state: 'idle', messages: [] }
            if (method === 'send') {
              return new Promise(function pending(resolve) {
                finish = function done() {
                  resolve({ status: 'completed' })
                }
                started()
              })
            }
            return null
          }
        })
      } else void remote!.receive(message)
    }
  })
  vi.stubGlobal('navigator', {
    locks: {},
    serviceWorker: {
      async register() {
        return { active: worker }
      }
    }
  })
  vi.useFakeTimers()
  const resolve = vi.fn(async function reply() {
    return { toolName: 'pi_reply', input: { text: 'Done' }, confidence: 1, reason: 'Reply' }
  })
  const harness = await createPiHarness({
    session: { namespace: 'tests', ownerId: 'one', conversationId: 'chat' },
    worker: { url: '/pi/worker.js', scope: '/pi/' },
    limits: { maxRequestBytes: 2048 },
    resolver: { name: 'test', available: true, status: 'ready', detail: '', resolve },
    host: {
      async discover() {
        return { revision: '1', tools: [] }
      },
      async context() {
        return {}
      },
      async invoke() {
        throw new Error('Unexpected tool')
      }
    }
  })
  try {
    const outcome = harness.send('Take several rounds')
    await pendingStart
    await remote!.call('resolve', { message: 'Hello', tools: [], context: {}, singleStep: true })
    expect(resolve).toHaveBeenCalledWith(
      'Hello',
      [],
      {},
      expect.objectContaining({ maxRequestBytes: 2048 })
    )
    await vi.advanceTimersByTimeAsync(260000)
    expect(harness.getSnapshot().state).toBe('running')
    finish!()
    expect(await outcome).toEqual({ status: 'completed' })
  } finally {
    finish?.()
    await harness.destroy()
    remote?.close()
  }
})

it('admits only user turns and remains usable after a cached page is restored', async function test() {
  vi.stubGlobal('MessageChannel', MessageChannel)
  vi.stubGlobal('isSecureContext', true)
  vi.stubGlobal('indexedDB', {})
  let remote: PiPeer | undefined
  const worker = Object.assign(new EventTarget(), {
    state: 'activated',
    postMessage(message: PiConnect | PiEnvelope, ports?: MessagePort[]) {
      if (message.op === 'connect') {
        remote = createPeer(ports![0], message.binding, {
          methods: ['ready', 'destroy', 'stop', 'ping', 'send'],
          async request(method) {
            if (method === 'send') return { status: 'completed' }
            return method === 'ready' ? { state: 'idle', messages: [] } : null
          }
        })
      } else void remote!.receive(message)
    }
  })
  vi.stubGlobal('navigator', {
    locks: {},
    serviceWorker: {
      async register() {
        return { active: worker }
      }
    }
  })
  const context = vi.fn(async function context() {
    return {}
  })
  const invoke = vi.fn()
  const resolve = vi.fn()
  const harness = await createPiHarness({
    session: { namespace: 'tests', ownerId: 'one', conversationId: 'chat' },
    worker: { url: '/pi/worker.js', scope: '/pi/' },
    resolver: {
      name: 'test',
      available: true,
      capabilities: { conversation: true },
      status: 'ready',
      detail: '',
      resolve
    },
    host: {
      async discover() {
        return { revision: '1', tools: [] }
      },
      context,
      invoke
    }
  })
  try {
    await expect(remote!.call('context')).rejects.toMatchObject({ code: 'stale_document' })
    await expect(remote!.call('resolve', {})).rejects.toMatchObject({ code: 'stale_document' })
    await expect(remote!.call('invoke', {})).rejects.toMatchObject({ code: 'stale_document' })
    expect(context).not.toHaveBeenCalled()
    expect(resolve).not.toHaveBeenCalled()
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    expect(await harness.send('A new request after Back')).toEqual({ status: 'completed' })
    expect(invoke).not.toHaveBeenCalled()
  } finally {
    await harness.destroy()
    remote?.close()
  }
})

it('does not let an old heartbeat interrupt a subsequent user turn', async function test() {
  vi.stubGlobal('MessageChannel', MessageChannel)
  vi.stubGlobal('isSecureContext', true)
  vi.stubGlobal('indexedDB', {})
  let remote: PiPeer | undefined
  let pingCount = 0
  const finish: Array<() => void> = []
  const started: Array<() => void> = []
  const starts = [0, 1].map(function start() {
    return new Promise<void>(function pending(resolve) {
      started.push(resolve)
    })
  })
  const worker = Object.assign(new EventTarget(), {
    state: 'activated',
    postMessage(message: PiConnect | PiEnvelope, ports?: MessagePort[]) {
      if (message.op === 'connect') {
        remote = createPeer(ports![0], message.binding, {
          methods: ['ready', 'send', 'ping', 'destroy'],
          async request(method) {
            if (method === 'ready') return { state: 'idle', messages: [] }
            if (method === 'ping' && ++pingCount === 2)
              return new Promise(function lostHeartbeat() {})
            if (method === 'send') {
              return new Promise(function pending(resolve) {
                const index = finish.length
                finish.push(function done() {
                  resolve({ status: 'completed' })
                })
                started[index]!()
              })
            }
            return null
          }
        })
      } else void remote!.receive(message)
    }
  })
  vi.stubGlobal('navigator', {
    locks: {},
    serviceWorker: {
      async register() {
        return { active: worker }
      }
    }
  })
  vi.useFakeTimers()
  const harness = await createPiHarness({
    session: { namespace: 'tests', ownerId: 'one', conversationId: 'chat' },
    worker: { url: '/pi/worker.js', scope: '/pi/' },
    resolver: {
      name: 'test',
      available: true,
      status: 'ready',
      detail: '',
      async resolve() {
        throw new Error('Unexpected inference')
      }
    }
  })
  try {
    const first = harness.send('First turn')
    await starts[0]
    await vi.advanceTimersByTimeAsync(2000)
    expect(pingCount).toBe(2)
    finish[0]!()
    expect(await first).toEqual({ status: 'completed' })
    const second = harness.send('Second turn')
    await starts[1]
    await vi.advanceTimersByTimeAsync(3000)
    finish[1]!()
    expect(await second).toEqual({ status: 'completed' })
    expect(harness.getSnapshot().state).toBe('idle')
  } finally {
    for (const done of finish) done()
    await harness.destroy()
    remote?.close()
  }
})
