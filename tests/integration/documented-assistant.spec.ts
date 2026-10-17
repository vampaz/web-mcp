import { afterEach, expect, it, vi } from 'vitest'
import { clearToolsForTest, listTools, type ToolPlanner } from '@vampaz/webmcp-kit'
import { createPiHarness, type PiController } from '@vampaz/webmcp-kit/pi'
import { createDialogApproval, mountCounterAssistant } from '../../docs/examples/counter-assistant'

vi.mock('@vampaz/webmcp-kit/pi', function mock() {
  return { createPiHarness: vi.fn() }
})

afterEach(function cleanup() {
  clearToolsForTest()
  document.body.replaceChildren()
  vi.resetAllMocks()
})

const planner: ToolPlanner = {
  name: 'Unused test planner',
  available: true,
  status: 'ready',
  detail: 'Initialization is controlled by the test.',
  async plan() {
    throw new Error('This example lifecycle check must not run inference.')
  }
}

function mount() {
  return mountCounterAssistant({
    container: document.body,
    workerScope: '/webmcp-pi/',
    session: { namespace: 'docs', ownerId: 'test', conversationId: 'counter' },
    planner,
    approve() {
      return false
    },
    onValue() {}
  })
}

it('destroys a late controller without mounting chat after the host unmounts', async function late() {
  let resolve!: (controller: PiController) => void
  const pending = new Promise<PiController>(function wait(complete) {
    resolve = complete
  })
  vi.mocked(createPiHarness).mockReturnValue(pending)
  const assistant = mount()
  expect(listTools()).toHaveLength(2)
  await assistant.destroy()
  expect(listTools()).toHaveLength(0)
  const destroy = vi.fn(async function destroy() {})
  resolve({ destroy } as unknown as PiController)
  await assistant.ready
  expect(destroy).toHaveBeenCalledOnce()
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
  const result = approval.confirm(tool, { value: 7 }, 'Change?', { signal: controller.signal })
  expect(dialog.open).toBe(true)
  controller.abort()
  await expect(result).resolves.toBe(false)
  expect(dialog.open).toBe(false)
})

it('does not deny a replacement approval when an old close event arrives', async function replacement() {
  const { dialog, approval } = dialogFixture()
  const first = approval.confirm(tool, { value: 1 }, 'First?')
  const second = approval.confirm(tool, { value: 2 }, 'Second?')
  await expect(first).resolves.toBe(false)
  dialog.dispatchEvent(new Event('close'))
  expect(dialog.open).toBe(true)
  dialog.returnValue = 'approve'
  dialog.close()
  dialog.dispatchEvent(new Event('close'))
  await expect(second).resolves.toBe(true)
})
