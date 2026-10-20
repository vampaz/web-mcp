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
  expect(runtime.destroy).toHaveBeenCalled()
})

it('detaches its listener when initialization fails', async function failedInitialization() {
  const onCancel = vi.fn()
  vi.mocked(createPiRuntime).mockRejectedValueOnce(new Error('Storage unavailable'))
  await expect(createPiHarness({ ...options(), onCancel })).rejects.toThrow('Storage unavailable')
  window.dispatchEvent(new PageTransitionEvent('pagehide'))
  expect(onCancel).not.toHaveBeenCalled()
})
