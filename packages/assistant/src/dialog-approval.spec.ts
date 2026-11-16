import { afterEach, expect, it } from 'vitest'
import { createDialogApproval } from './dialog-approval'

afterEach(function cleanup() {
  document.body.replaceChildren()
})

function fixture() {
  const dialog = document.createElement('dialog')
  dialog.innerHTML = '<pre data-approval-text></pre>'
  document.body.append(dialog)
  dialog.showModal = function showModal() {
    this.open = true
  }
  dialog.close = function close() {
    this.open = false
  }
  return { dialog, approval: createDialogApproval(dialog) }
}

const tool = { name: 'set_counter', description: 'Change the counter', inputSchema: {} }

it('requires the documented approval text element', function missing() {
  expect(function create() {
    createDialogApproval(document.createElement('dialog'))
  }).toThrow('The approval dialog needs [data-approval-text].')
})

it('shows the request and resolves approve or deny', async function decision() {
  const { dialog, approval } = fixture()
  const approved = approval.confirm({ tool, input: { value: 7 }, reason: 'Change?' })
  expect(dialog.open).toBe(true)
  expect(dialog.querySelector('[data-approval-text]')!.textContent).toContain('Change?')
  expect(dialog.querySelector('[data-approval-text]')!.textContent).toContain('set_counter')
  dialog.returnValue = 'approve'
  dialog.close()
  dialog.dispatchEvent(new Event('close'))
  await expect(approved).resolves.toBe(true)

  const denied = approval.confirm({ tool, input: {}, reason: 'Again?' })
  dialog.returnValue = 'deny'
  dialog.close()
  dialog.dispatchEvent(new Event('close'))
  await expect(denied).resolves.toBe(false)
})

it('denies on abort and does not reopen after the signal is already aborted', async function abort() {
  const { dialog, approval } = fixture()
  const controller = new AbortController()
  const pending = approval.confirm({
    tool,
    input: { value: 7 },
    reason: 'Change?',
    signal: controller.signal
  })
  expect(dialog.open).toBe(true)
  controller.abort()
  await expect(pending).resolves.toBe(false)
  expect(dialog.open).toBe(false)

  const aborted = approval.confirm({
    tool,
    input: {},
    reason: 'Never?',
    signal: AbortSignal.abort()
  })
  await expect(aborted).resolves.toBe(false)
  expect(dialog.open).toBe(false)
})

it('denies a replaced approval without letting its queued close settle the next one', async function replacement() {
  const { dialog, approval } = fixture()
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

it('denies when the dialog cannot open', async function unopenable() {
  const dialog = document.createElement('dialog')
  dialog.innerHTML = '<pre data-approval-text></pre>'
  document.body.append(dialog)
  dialog.showModal = function showModal() {
    throw new Error('Dialog is not connected')
  }
  const approval = createDialogApproval(dialog)
  await expect(approval.confirm({ tool, input: {}, reason: 'No?' })).resolves.toBe(false)
})

it('summarizes unserializable input without leaving a pending approval', async function unserializable() {
  const { dialog, approval } = fixture()
  const cyclic: Record<string, unknown> = {}
  cyclic.self = cyclic
  const replaced = approval.confirm({
    tool,
    input: { value: BigInt(7) },
    reason: 'BigInt?'
  })
  const approved = approval.confirm({ tool, input: cyclic, reason: 'Cycle?' })
  await expect(replaced).resolves.toBe(false)
  expect(dialog.open).toBe(true)
  expect(dialog.querySelector('[data-approval-text]')!.textContent).toContain(
    '[unserializable input]'
  )
  dialog.returnValue = 'approve'
  dialog.close()
  dialog.dispatchEvent(new Event('close'))
  await expect(approved).resolves.toBe(true)
  expect(dialog.open).toBe(false)
})

it('bounds the displayed input summary', async function summaryBound() {
  const { dialog, approval } = fixture()
  const pending = approval.confirm({ tool, input: { text: 'x'.repeat(600) }, reason: 'Long?' })
  const summary = dialog.querySelector('[data-approval-text]')!.textContent!
  expect(summary).toContain('…')
  expect(summary.length).toBeLessThan(560)
  dialog.returnValue = 'deny'
  dialog.close()
  dialog.dispatchEvent(new Event('close'))
  await expect(pending).resolves.toBe(false)
})

it('cancels and closes a pending approval', async function cancel() {
  const { dialog, approval } = fixture()
  const pending = approval.confirm({ tool, input: {}, reason: 'Cancel?' })
  approval.cancel()
  await expect(pending).resolves.toBe(false)
  expect(dialog.open).toBe(false)
  approval.cancel()
})
