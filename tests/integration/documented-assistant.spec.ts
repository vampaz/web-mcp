import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { clearToolsForTest } from '@vampaz/webmcp-kit/testing'
import { listTools, type ToolResolver } from '@vampaz/webmcp-kit'
import { createPiHarness, type PiController } from '@vampaz/webmcp-kit/pi'
import { createDialogApproval } from '@vampaz/webmcp-kit/assistant'
import { mountCounterAssistant } from '../../docs/examples/counter-assistant'

vi.mock('@vampaz/webmcp-kit/pi', function mock() {
  return { createPiHarness: vi.fn() }
})

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
    value() {}
  })
  Object.defineProperty(HTMLElement.prototype, 'hidePopover', {
    configurable: true,
    value() {}
  })
})

afterEach(function cleanup() {
  clearToolsForTest()
  document.body.replaceChildren()
  vi.resetAllMocks()
  vi.unstubAllGlobals()
  delete (HTMLElement.prototype as { showPopover?: unknown }).showPopover
  delete (HTMLElement.prototype as { hidePopover?: unknown }).hidePopover
})

const resolver: ToolResolver = {
  name: 'Unused test resolver',
  available: true,
  status: 'ready',
  detail: 'Initialization is controlled by the test.',
  async resolve() {
    throw new Error('This example lifecycle check must not run inference.')
  }
}

function mount() {
  return mountCounterAssistant({
    container: document.body,
    session: { namespace: 'docs', ownerId: 'test', conversationId: 'counter' },
    resolver,
    approve() {
      return false
    },
    onValue() {}
  })
}

it('mounts the documented chat and unregisters its tools on teardown', async function mounted() {
  const destroy = vi.fn(async function destroy() {})
  const api: PiController = {
    getSnapshot() {
      return { state: 'idle', messages: [] }
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
    destroy
  }
  vi.mocked(createPiHarness).mockResolvedValue(api)
  const assistant = mount()
  await assistant.ready

  expect(listTools()).toHaveLength(2)
  const chat = document.querySelector('webmcp-chat')
  expect(chat).not.toBeNull()
  expect(chat!.shadowRoot!.querySelector('h2')!.textContent).toBe('Counter assistant')

  await assistant.destroy()
  expect(listTools()).toHaveLength(0)
  expect(document.querySelector('webmcp-chat')).toBeNull()
  expect(destroy).toHaveBeenCalledOnce()
})

it('waits for a late controller and its cleanup before destroy settles', async function late() {
  let resolve!: (controller: PiController) => void
  const pending = new Promise<PiController>(function wait(complete) {
    resolve = complete
  })
  vi.mocked(createPiHarness).mockReturnValue(pending)
  const assistant = mount()
  expect(listTools()).toHaveLength(2)
  let releaseCleanup!: () => void
  const destroy = vi.fn(function destroy() {
    return new Promise<void>(function wait(complete) {
      releaseCleanup = complete
    })
  })
  const teardown = assistant.destroy()
  let settled = false
  void teardown.then(function done() {
    settled = true
  })
  await Promise.resolve()
  expect(settled).toBe(false)

  resolve({ destroy } as unknown as PiController)
  await vi.waitFor(function called() {
    expect(destroy).toHaveBeenCalledOnce()
  })
  expect(settled).toBe(false)
  expect(document.querySelector('webmcp-chat')).toBeNull()

  releaseCleanup()
  await teardown
  await assistant.ready
  expect(settled).toBe(true)
  expect(listTools()).toHaveLength(0)
  expect(document.querySelector('webmcp-chat')).toBeNull()
})

it('removes registered actions and surfaces a failed worker initialization', async function failure() {
  vi.mocked(createPiHarness).mockRejectedValue(new Error('Worker unavailable'))
  const assistant = mount()
  await expect(assistant.ready).rejects.toThrow('Worker unavailable')
  expect(listTools()).toHaveLength(0)
})

function dialogFixture() {
  const dialog = document.createElement('dialog')
  dialog.innerHTML = '<pre data-approval-text></pre>'
  document.body.append(dialog)
  // jsdom has no modal implementation. Dispatch close separately to model queued browser events.
  dialog.showModal = function showModal() {
    this.open = true
  }
  dialog.close = function close() {
    this.open = false
  }
  return { dialog, approval: createDialogApproval(dialog) }
}

const tool = { name: 'set_counter', description: 'Change the counter', inputSchema: {} }

it('closes and denies an application approval when the invocation aborts', async function abort() {
  const { dialog, approval } = dialogFixture()
  const controller = new AbortController()
  const result = approval.confirm({
    tool,
    input: { value: 7 },
    reason: 'Change?',
    signal: controller.signal
  })
  expect(dialog.open).toBe(true)
  controller.abort()
  await expect(result).resolves.toBe(false)
  expect(dialog.open).toBe(false)
})

it('does not deny a replacement approval when an old close event arrives', async function replacement() {
  const { dialog, approval } = dialogFixture()
  const first = approval.confirm({ tool, input: { value: 1 }, reason: 'First?' })
  const second = approval.confirm({ tool, input: { value: 2 }, reason: 'Second?' })
  await expect(first).resolves.toBe(false)
  dialog.dispatchEvent(new Event('close'))
  expect(dialog.open).toBe(true)
  dialog.returnValue = 'approve'
  dialog.close()
  dialog.dispatchEvent(new Event('close'))
  await expect(second).resolves.toBe(true)
})
