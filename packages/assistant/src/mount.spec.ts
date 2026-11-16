import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { PiController } from '@vampaz/webmcp-kit/pi'
import { createPiHarness } from '@vampaz/webmcp-kit/pi'
import type { ToolResolver } from '@vampaz/webmcp-kit'
import { mountAssistant } from './mount'

vi.mock('@vampaz/webmcp-kit/pi', function mockPi() {
  return { createPiHarness: vi.fn() }
})

const session = { namespace: 'assistant-test', ownerId: 'owner', conversationId: 'one' }
const resolver: ToolResolver = {
  name: 'Test resolver',
  available: true,
  status: 'ready',
  detail: 'Test only.',
  async resolve() {
    throw new Error('No inference in mount tests.')
  }
}

function controller(): PiController {
  const snapshot = { state: 'idle' as const, messages: [] }
  return {
    getSnapshot() {
      return snapshot
    },
    subscribe() {
      return function remove() {}
    },
    async send() {
      return { status: 'completed' }
    },
    async stop() {},
    async clear() {},
    async refresh() {},
    async destroy() {}
  }
}

beforeEach(function layout() {
  vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserverStub {
      observe() {}
      disconnect() {}
    }
  )
  vi.stubGlobal('matchMedia', function matchMedia() {
    return { matches: false }
  })
  Object.defineProperty(HTMLElement.prototype, 'showPopover', {
    configurable: true,
    value() {
      this.dataset.popover = 'open'
    }
  })
  Object.defineProperty(HTMLElement.prototype, 'hidePopover', {
    configurable: true,
    value() {
      delete this.dataset.popover
    }
  })
})

afterEach(function cleanup() {
  document.body.replaceChildren()
  vi.mocked(createPiHarness).mockReset()
  vi.unstubAllGlobals()
  delete (HTMLElement.prototype as { showPopover?: unknown }).showPopover
  delete (HTMLElement.prototype as { hidePopover?: unknown }).hidePopover
})

it('mounts a chat element after the harness is ready', async function mount() {
  const next = controller()
  const destroy = vi.fn(next.destroy)
  const instance = { ...next, destroy }
  vi.mocked(createPiHarness).mockResolvedValue(instance)
  const container = document.createElement('div')
  document.body.append(container)

  const assistant = mountAssistant({ container, session, resolver })
  expect(assistant.element).toBeUndefined()
  expect(assistant.controller).toBeUndefined()
  await assistant.ready

  expect(createPiHarness).toHaveBeenCalledWith({ session, resolver })
  expect(assistant.controller).toBe(instance)
  const element = assistant.element!
  expect(container.firstElementChild).toBe(element)
  expect(element.controller).toBe(instance)
  expect(element.dataset.mode).toBe('popup')

  await assistant.destroy()
  expect(destroy).toHaveBeenCalledOnce()
  expect(assistant.element).toBeUndefined()
  expect(assistant.controller).toBeUndefined()
  expect(container.childElementCount).toBe(0)
})

it('forwards context, limits, cancellation and chat options', async function options_() {
  const next = controller()
  vi.mocked(createPiHarness).mockResolvedValue(next)
  function context() {
    return { value: 1 }
  }
  const onCancel = vi.fn()
  const container = document.createElement('div')
  const assistant = mountAssistant({
    container,
    session,
    resolver,
    context,
    limits: { maxToolCalls: 2 },
    onCancel,
    chat: {
      mode: 'inline',
      title: 'Custom assistant',
      suggestedPrompts: ['Read']
    }
  })
  await assistant.ready

  expect(createPiHarness).toHaveBeenCalledWith({
    session,
    resolver,
    context,
    limits: { maxToolCalls: 2 },
    onCancel
  })
  expect(assistant.element!.dataset.mode).toBe('inline')
  expect(assistant.element!.shadowRoot!.querySelector('h2')!.textContent).toBe('Custom assistant')
  await assistant.destroy()
})

it('waits for pending initialization and late cleanup before destroy settles', async function late() {
  let resolveHarness!: (value: PiController) => void
  vi.mocked(createPiHarness).mockReturnValue(
    new Promise<PiController>(function wait(complete) {
      resolveHarness = complete
    })
  )
  const container = document.createElement('div')
  document.body.append(container)
  const assistant = mountAssistant({ container, session, resolver })
  let releaseCleanup!: () => void
  const destroy = vi.fn(function destroy() {
    return new Promise<void>(function wait(resolve) {
      releaseCleanup = resolve
    })
  })
  const teardown = assistant.destroy()
  expect(assistant.destroy()).toBe(teardown)
  let settled = false
  void teardown.then(function done() {
    settled = true
  })
  await Promise.resolve()
  expect(settled).toBe(false)

  resolveHarness({ ...controller(), destroy })
  await vi.waitFor(function called() {
    expect(destroy).toHaveBeenCalledOnce()
  })
  expect(settled).toBe(false)
  expect(container.childElementCount).toBe(0)
  expect(assistant.element).toBeUndefined()
  expect(assistant.controller).toBeUndefined()

  releaseCleanup()
  await teardown
  await Promise.resolve()
  expect(settled).toBe(true)
  expect(container.childElementCount).toBe(0)
})

it('propagates late cleanup failure through destroy and resolves ready', async function lateFailure() {
  let resolveHarness!: (value: PiController) => void
  vi.mocked(createPiHarness).mockReturnValue(
    new Promise<PiController>(function wait(complete) {
      resolveHarness = complete
    })
  )
  const assistant = mountAssistant({
    container: document.createElement('div'),
    session,
    resolver
  })
  const teardown = assistant.destroy()
  resolveHarness({
    ...controller(),
    destroy: vi.fn(async function destroy() {
      throw new Error('cleanup failed')
    })
  })

  await expect(teardown).rejects.toThrow('cleanup failed')
  await expect(assistant.ready).resolves.toBeUndefined()
  expect(assistant.element).toBeUndefined()
  expect(assistant.controller).toBeUndefined()
})

it('rejects ready when initialization fails after teardown', async function lateInitializationFailure() {
  let reject!: (error: Error) => void
  vi.mocked(createPiHarness).mockReturnValue(
    new Promise<PiController>(function wait(_resolve, fail) {
      reject = fail
    })
  )
  const assistant = mountAssistant({ container: document.createElement('div'), session, resolver })
  const teardown = assistant.destroy()
  expect(assistant.destroy()).toBe(teardown)
  reject(new Error('storage_failed'))
  await expect(assistant.ready).rejects.toThrow('storage_failed')
  await expect(teardown).resolves.toBeUndefined()
  expect(assistant.element).toBeUndefined()
})

it('cleans up and rejects ready when chat configuration throws', async function configureFailure() {
  const next = controller()
  const destroy = vi.fn(next.destroy)
  vi.mocked(createPiHarness).mockResolvedValue({
    ...next,
    getSnapshot() {
      throw new Error('configure failed')
    },
    destroy
  })
  const container = document.createElement('div')
  const assistant = mountAssistant({ container, session, resolver })
  await expect(assistant.ready).rejects.toThrow('configure failed')
  expect(destroy).toHaveBeenCalledOnce()
  expect(container.childElementCount).toBe(0)
  expect(assistant.element).toBeUndefined()
  expect(assistant.controller).toBeUndefined()
})

it('cleans up and rejects ready when appending chat throws', async function appendFailure() {
  const next = controller()
  const destroy = vi.fn(next.destroy)
  vi.mocked(createPiHarness).mockResolvedValue({ ...next, destroy })
  const container = document.createElement('div')
  container.append = function append() {
    throw new Error('append failed')
  }
  const assistant = mountAssistant({ container, session, resolver })
  await expect(assistant.ready).rejects.toThrow('append failed')
  expect(destroy).toHaveBeenCalledOnce()
  expect(assistant.element).toBeUndefined()
  expect(assistant.controller).toBeUndefined()
})

it('settles destroy requested during failed mount cleanup', async function destroyDuringFailure() {
  const next = controller()
  let releaseCleanup!: () => void
  const cleanup = new Promise<void>(function wait(resolve) {
    releaseCleanup = resolve
  })
  const destroy = vi.fn(function destroy() {
    return cleanup
  })
  vi.mocked(createPiHarness).mockResolvedValue({
    ...next,
    getSnapshot() {
      throw new Error('configure failed')
    },
    destroy
  })
  const container = document.createElement('div')
  const assistant = mountAssistant({ container, session, resolver })
  await vi.waitFor(function cleanupStarted() {
    expect(destroy).toHaveBeenCalledOnce()
  })
  const teardown = assistant.destroy()
  expect(assistant.destroy()).toBe(teardown)
  let settled = false
  void teardown.then(function done() {
    settled = true
  })
  await Promise.resolve()
  expect(settled).toBe(false)

  releaseCleanup()
  await expect(assistant.ready).rejects.toThrow('configure failed')
  await expect(teardown).resolves.toBeUndefined()
  await Promise.resolve()
  expect(settled).toBe(true)
  expect(destroy).toHaveBeenCalledOnce()
  expect(container.childElementCount).toBe(0)
  expect(assistant.element).toBeUndefined()
})

it('propagates failed mount cleanup through destroy', async function destroyDuringFailureRejected() {
  const next = controller()
  let rejectCleanup!: (error: Error) => void
  const cleanup = new Promise<void>(function wait(_resolve, fail) {
    rejectCleanup = fail
  })
  const destroy = vi.fn(function destroy() {
    return cleanup
  })
  vi.mocked(createPiHarness).mockResolvedValue({
    ...next,
    getSnapshot() {
      throw new Error('configure failed')
    },
    destroy
  })
  const assistant = mountAssistant({
    container: document.createElement('div'),
    session,
    resolver
  })
  await vi.waitFor(function cleanupStarted() {
    expect(destroy).toHaveBeenCalledOnce()
  })
  const teardown = assistant.destroy()
  rejectCleanup(new Error('cleanup failed'))

  await expect(assistant.ready).rejects.toThrow('configure failed')
  await expect(teardown).rejects.toThrow('cleanup failed')
  expect(destroy).toHaveBeenCalledOnce()
  expect(assistant.element).toBeUndefined()
})

it('keeps the mount error when failed cleanup rejects without destroy', async function failureCleanup() {
  const next = controller()
  const destroy = vi.fn(async function destroy() {
    throw new Error('cleanup failed')
  })
  vi.mocked(createPiHarness).mockResolvedValue({
    ...next,
    getSnapshot() {
      throw new Error('configure failed')
    },
    destroy
  })
  const assistant = mountAssistant({
    container: document.createElement('div'),
    session,
    resolver
  })
  await expect(assistant.ready).rejects.toThrow('configure failed')
  expect(destroy).toHaveBeenCalledOnce()
  await expect(assistant.destroy()).resolves.toBeUndefined()
})

it('does not mount or leak when configure requests destroy', async function reentrant() {
  const next = controller()
  const destroy = vi.fn(next.destroy)
  const snapshot = {
    state: 'idle' as const,
    messages: [{ id: 'one', role: 'assistant' as const, text: 'Hello' }]
  }
  vi.mocked(createPiHarness).mockResolvedValue({
    ...next,
    getSnapshot() {
      return snapshot
    },
    destroy
  })
  const container = document.createElement('div')
  document.body.append(container)
  let assistant!: ReturnType<typeof mountAssistant>
  let teardown: Promise<void> | undefined
  const renderMessage = vi.fn(function render() {
    teardown = assistant.destroy()
    return true
  })
  assistant = mountAssistant({ container, session, resolver, chat: { renderMessage } })

  await assistant.ready
  await teardown
  expect(renderMessage).toHaveBeenCalled()
  expect(destroy).toHaveBeenCalledOnce()
  expect(container.childElementCount).toBe(0)
  expect(assistant.element).toBeUndefined()
  expect(assistant.controller).toBeUndefined()
})

it('propagates mounted cleanup failure through destroy', async function cleanupFailure() {
  const next = controller()
  vi.mocked(createPiHarness).mockResolvedValue(next)
  const container = document.createElement('div')
  document.body.append(container)
  const assistant = mountAssistant({ container, session, resolver })
  await assistant.ready
  next.destroy = vi.fn(async function destroy() {
    throw new Error('cleanup failed')
  })

  const teardown = assistant.destroy()
  expect(assistant.destroy()).toBe(teardown)
  await expect(teardown).rejects.toThrow('cleanup failed')
  expect(container.childElementCount).toBe(0)
  expect(assistant.element).toBeUndefined()
  expect(assistant.controller).toBeUndefined()
})

it('cleans up and rejects ready when initialization fails', async function failure() {
  vi.mocked(createPiHarness).mockRejectedValue(new Error('Worker unavailable'))
  const container = document.createElement('div')
  const assistant = mountAssistant({ container, session, resolver })
  await expect(assistant.ready).rejects.toThrow('Worker unavailable')
  expect(container.childElementCount).toBe(0)
  expect(assistant.element).toBeUndefined()
  expect(assistant.controller).toBeUndefined()
  const first = assistant.destroy()
  expect(assistant.destroy()).toBe(first)
  await expect(first).resolves.toBeUndefined()
  await expect(assistant.destroy()).resolves.toBeUndefined()
})

it('is idempotent and does not dispose the borrowed resolver or app tools', async function owned() {
  const next = controller()
  const destroy = vi.fn(next.destroy)
  vi.mocked(createPiHarness).mockResolvedValue({ ...next, destroy })
  const dispose = vi.fn()
  const ownedResolver = { ...resolver, dispose }
  const assistant = mountAssistant({
    container: document.createElement('div'),
    session,
    resolver: ownedResolver
  })
  await assistant.ready

  const first = assistant.destroy()
  const second = assistant.destroy()
  expect(first).toBe(second)
  await Promise.all([first, second])

  expect(destroy).toHaveBeenCalledOnce()
  expect(dispose).not.toHaveBeenCalled()
})
