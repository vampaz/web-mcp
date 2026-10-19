// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { createPeer, validConnect, validEnvelope } from './protocol'
import { piProtocolVersion } from './interfaces/protocol'
import { piSessionKey } from './session'

const session = { namespace: 'tests', ownerId: 'one', conversationId: 'chat' }
const binding = {
  connectionId: 'connection',
  documentId: 'document',
  sessionKey: piSessionKey(session)
}

it('rejects mismatched, malformed, and oversized messages', function test() {
  expect(
    validConnect({ version: piProtocolVersion, op: 'connect', requestId: 'id', binding, session })
  ).toBe(true)
  expect(validConnect({ version: 1, op: 'connect', requestId: 'id', binding, session })).toBe(false)
  expect(
    validEnvelope(
      {
        version: piProtocolVersion,
        op: 'request',
        requestId: 'id',
        method: 'send',
        binding: { ...binding, documentId: 'stale' }
      },
      binding
    )
  ).toBe(false)
  expect(
    validEnvelope(
      {
        version: piProtocolVersion,
        op: 'reply',
        requestId: 'id',
        binding,
        payload: 'x'.repeat(17 * 1024 * 1024)
      },
      binding
    )
  ).toBe(false)
  expect(
    validEnvelope({ version: piProtocolVersion, op: 'unknown', requestId: 'id', binding }, binding)
  ).toBe(false)
})
it('correlates real port requests and acknowledges cancellation', async function test() {
  const channel = new MessageChannel()
  const request = vi.fn(async function request(_method, payload) {
    return payload
  })
  const left = createPeer(channel.port1, binding, { methods: [], async request() {} })
  const right = createPeer(channel.port2, binding, { methods: ['echo', 'wait'], request })
  try {
    expect(await left.call('echo', { value: 3 })).toEqual({ value: 3 })
    await expect(left.call('unknown')).rejects.toThrow('speaks a different protocol version')
    request.mockImplementationOnce(function wait() {
      return new Promise(function never() {})
    })
    const controller = new AbortController()
    const pending = left.call('wait', undefined, controller.signal)
    controller.abort()
    await expect(pending).rejects.toThrow('cancelled')
  } finally {
    left.close()
    right.close()
  }
})

it('does not dispatch a request whose signal is already aborted', async function test() {
  const channel = new MessageChannel()
  const request = vi.fn(async function invoke() {
    return 'mutation completed'
  })
  const left = createPeer(channel.port1, binding, { methods: [], async request() {} })
  const right = createPeer(channel.port2, binding, { methods: ['invoke'], request })
  try {
    const controller = new AbortController()
    controller.abort()
    await expect(left.call('invoke', {}, controller.signal)).rejects.toMatchObject({
      code: 'stale_document'
    })
    expect(request).not.toHaveBeenCalled()
  } finally {
    left.close()
    right.close()
  }
})

it.each(['timeout', 'abort'] as const)(
  'settles %s when the worker cannot receive cancellation',
  async function test(mode) {
    vi.useFakeTimers()
    const channel = new MessageChannel()
    const peer = createPeer(channel.port1, binding, {
      methods: [],
      async request() {},
      sendRequest(message) {
        if (message.op === 'cancel') throw new Error('Worker is redundant')
      }
    })
    try {
      const controller = new AbortController()
      const pending = peer.call('wait', undefined, controller.signal, 10)
      const settled = expect(pending).rejects.toMatchObject({ code: 'transport_failed' })
      if (mode === 'abort') controller.abort()
      await vi.advanceTimersByTimeAsync(mode === 'abort' ? 3010 : 10)
      await settled
    } finally {
      peer.close()
      channel.port2.close()
      vi.useRealTimers()
    }
  }
)

it('allows a cancellable request without a whole-operation deadline', async function test() {
  vi.useFakeTimers()
  const channel = new MessageChannel()
  const sent: import('./interfaces/protocol').PiEnvelope[] = []
  const peer = createPeer(channel.port1, binding, {
    methods: [],
    async request() {},
    sendRequest(message) {
      sent.push(message)
    }
  })
  try {
    const controller = new AbortController()
    const pending = peer.call('send', 'Long turn', controller.signal, null)
    const rejected = expect(pending).rejects.toMatchObject({ code: 'stale_document' })
    await vi.advanceTimersByTimeAsync(260000)
    expect(
      sent.map(function operation(message) {
        return message.op
      })
    ).toEqual(['request'])
    controller.abort()
    expect(sent.at(-1)?.op).toBe('cancel')
    await peer.receive({
      version: piProtocolVersion,
      binding,
      requestId: sent[0]!.requestId,
      op: 'cancelled'
    })
    await rejected
  } finally {
    peer.close()
    channel.port2.close()
    vi.useRealTimers()
  }
})
