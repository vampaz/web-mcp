import { setImmediate as nextTask } from 'node:timers/promises'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPiHarness } from './connection'
import { createPiRuntime } from './runtime'
import type { PiController, PiHarnessOptions } from './interfaces/controller'

vi.mock('./runtime', function runtime() {
  return { createPiRuntime: vi.fn() }
})

let harness: PiController | undefined
let runtime: PiController

beforeEach(function setup() {
  vi.stubGlobal('isSecureContext', true)
  runtime = {
    getSnapshot: vi.fn(function snapshot() {
      return { state: 'idle' as const, messages: [] }
    }),
    subscribe: vi.fn(function subscribe() {
      return function unsubscribe() {}
    }),
    send: vi.fn(async function send() {
      return { status: 'completed' as const }
    }),
    clear: vi.fn(async function clear() {}),
    refresh: vi.fn(async function refresh() {}),
    stop: vi.fn(async function stop() {}),
    destroy: vi.fn(async function destroy() {})
  }
  vi.mocked(createPiRuntime).mockResolvedValue(runtime)
})

afterEach(async function cleanup() {
  await harness?.destroy()
  harness = undefined
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

function options(): PiHarnessOptions {
  return {
    session: { namespace: 'tests', ownerId: 'one', conversationId: 'chat' },
    resolver: {
      name: 'test',
      available: true,
      status: 'ready',
      detail: '',
      async resolve() {
        throw new Error('Unexpected inference')
      }
    }
  }
}

it('requires a secure browser context before opening storage', async function prerequisites() {
  vi.stubGlobal('isSecureContext', false)
  await expect(createPiHarness(options())).rejects.toMatchObject({ code: 'unsupported' })
  expect(createPiRuntime).not.toHaveBeenCalled()
})

it('opens the in-page runtime with the registry host and no service worker', async function inPage() {
  const config = options()
  harness = await createPiHarness(config)
  expect(createPiRuntime).toHaveBeenCalledWith({
    ...config,
    host: {
      discover: expect.any(Function),
      context: expect.any(Function),
      invoke: expect.any(Function)
    },
    limits: undefined
  })
  expect(await harness.send('Hello')).toEqual({ status: 'completed' as const })
  expect(runtime.send).toHaveBeenCalledWith('Hello')
})

it('preserves the supplied tool host and request limits', async function customHost() {
  const host = { discover: vi.fn(), context: vi.fn(), invoke: vi.fn() }
  harness = await createPiHarness({ ...options(), host, limits: { maxRequestBytes: 2048 } })
  expect(createPiRuntime).toHaveBeenCalledWith(
    expect.objectContaining({ host, limits: { maxRequestBytes: 2048 } })
  )
})

it('finishes cancellation before accepting a turn after back-forward cache restoration', async function cached() {
  let finish!: () => void
  vi.mocked(runtime.stop).mockImplementationOnce(function stopping() {
    return new Promise<void>(function pending(resolve) {
      finish = resolve
    })
  })
  const onCancel = vi.fn()
  harness = await createPiHarness({ ...options(), onCancel })
  window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
  const turn = harness.send('Continue')
  expect(onCancel).toHaveBeenCalledOnce()
  expect(runtime.send).not.toHaveBeenCalled()
  expect(runtime.destroy).not.toHaveBeenCalled()
  finish()
  expect(await turn).toEqual({ status: 'completed' as const })
})

it('destroys the runtime on navigation and detaches its page listener', async function navigation() {
  harness = await createPiHarness(options())
  window.dispatchEvent(new PageTransitionEvent('pagehide'))
  await harness.destroy()
  expect(runtime.destroy).toHaveBeenCalledOnce()
  window.dispatchEvent(new PageTransitionEvent('pagehide'))
  expect(runtime.stop).toHaveBeenCalledOnce()
})

it('closes a runtime that finishes initialization after navigation', async function lateInitialization() {
  let finish!: (value: PiController) => void
  vi.mocked(createPiRuntime).mockReturnValueOnce(
    new Promise(function pending(resolve) {
      finish = resolve
    })
  )
  const opening = createPiHarness(options())
  window.dispatchEvent(new PageTransitionEvent('pagehide'))
  finish(runtime)
  await expect(opening).rejects.toMatchObject({ code: 'stale_document' })
  expect(runtime.destroy).toHaveBeenCalledOnce()
})

it('detaches its listener when initialization fails', async function failedInitialization() {
  const onCancel = vi.fn()
  vi.mocked(createPiRuntime).mockRejectedValueOnce(new Error('Storage unavailable'))
  await expect(createPiHarness({ ...options(), onCancel })).rejects.toThrow('Storage unavailable')
  window.dispatchEvent(new PageTransitionEvent('pagehide'))
  expect(onCancel).not.toHaveBeenCalled()
})

it('recovers after an application cancellation callback fails during suspension', async function cancelFailure() {
  harness = await createPiHarness({
    ...options(),
    onCancel() {
      throw new Error('Application callback failed')
    }
  })
  window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
  expect(await harness.send('Continue')).toEqual({ status: 'completed' })
  expect(runtime.send).toHaveBeenCalledWith('Continue')
  await expect(harness.destroy()).rejects.toThrow('Application callback failed')
  harness = undefined
})

it('reports closure after a failing destruction callback and blocks new work while closing', async function failedDestruction() {
  harness = await createPiHarness({
    ...options(),
    onCancel() {
      throw new Error('Cancellation failed')
    }
  })
  const closing = expect(harness.destroy()).rejects.toThrow('Cancellation failed')
  expect(await harness.send('During close')).toMatchObject({
    status: 'error',
    error: { code: 'conversation_busy', message: 'This conversation has closed.' }
  })
  await closing
  expect(await harness.send('After close')).toMatchObject({
    status: 'error',
    error: { code: 'conversation_busy', message: 'This conversation has closed.' }
  })
  await expect(harness.refresh()).rejects.toThrow('This conversation has closed.')
  await expect(harness.clear()).rejects.toThrow('This conversation has closed.')
  await expect(harness.stop()).resolves.toBeUndefined()
  expect(runtime.send).not.toHaveBeenCalled()
  harness = undefined
})

it('reports stale document when navigation and a failing callback interrupt opening', async function failedOpeningClose() {
  let finish!: (value: PiController) => void
  vi.mocked(createPiRuntime).mockReturnValueOnce(
    new Promise(function opening(resolve) {
      finish = resolve
    })
  )
  const opening = createPiHarness({
    ...options(),
    onCancel() {
      throw new Error('Cancellation failed')
    }
  })
  window.dispatchEvent(new PageTransitionEvent('pagehide'))
  finish(runtime)
  await expect(opening).rejects.toMatchObject({ code: 'stale_document' })
  expect(runtime.destroy).toHaveBeenCalledOnce()
})

it('finishes opening and suspension before admitting a restored turn', async function openingSuspension() {
  let opened!: (value: PiController) => void
  let stopped!: () => void
  vi.mocked(createPiRuntime).mockReturnValueOnce(
    new Promise(function opening(resolve) {
      opened = resolve
    })
  )
  vi.mocked(runtime.stop).mockReturnValueOnce(
    new Promise(function stopping(resolve) {
      stopped = resolve
    })
  )
  const opening = createPiHarness(options())
  window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
  opened(runtime)
  harness = await opening
  const turn = harness.send('Restored')
  expect(runtime.send).not.toHaveBeenCalled()
  stopped()
  expect(await turn).toEqual({ status: 'completed' })
})

it.each(['send', 'refresh', 'clear'] as const)(
  'waits through overlapping cached-page suspensions before %s',
  async function overlappingSuspensions(action) {
    let finishFirst!: () => void
    let finishSecond!: () => void
    vi.mocked(runtime.stop)
      .mockReturnValueOnce(
        new Promise(function first(resolve) {
          finishFirst = resolve
        })
      )
      .mockReturnValueOnce(
        new Promise(function second(resolve) {
          finishSecond = resolve
        })
      )
    harness = await createPiHarness(options())
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
    const settled = vi.fn()
    const operation = (action === 'send' ? harness.send('Restored') : harness[action]()).then(
      settled,
      settled
    )
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
    try {
      finishFirst()
      await nextTask()
      expect(settled).not.toHaveBeenCalled()
      expect(runtime[action]).not.toHaveBeenCalled()
    } finally {
      finishSecond()
      await operation
    }
    expect(runtime[action]).toHaveBeenCalledOnce()
  }
)
