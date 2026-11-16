import { afterEach, expect, it, vi } from 'vitest'
import {
  defineTool,
  invokeTool,
  registerTool,
  setConfirmationHandler,
  unregisterTool
} from '@vampaz/webmcp-kit'
import { installApprovalDialog, registerCounterTools } from './tools'

afterEach(function cleanup() {
  unregisterTool('read_counter')
  unregisterTool('set_counter')
  unregisterTool('save_draft')
  setConfirmationHandler(undefined)
  document.body.innerHTML = ''
})
it('shares schema validation and application confirmation for counter mutations', async function test() {
  const counter = registerCounterTools(function changed() {})
  setConfirmationHandler(function deny() {
    return false
  })
  expect((await invokeTool({ toolName: 'set_counter', input: { value: 200 } })).code).toBe(
    'invalid_input'
  )
  expect((await invokeTool({ toolName: 'set_counter', input: { value: 7 } })).code).toBe(
    'confirmation_denied'
  )
  expect(counter.getValue()).toBe(0)
  setConfirmationHandler(function approve() {
    return true
  })
  expect((await invokeTool({ toolName: 'set_counter', input: { value: 7 } })).status).toBe(
    'success'
  )
  expect((await invokeTool({ toolName: 'read_counter', input: {} })).output).toEqual({ value: 7 })
  counter.destroy()
})

it('skips approval only for pi when the preference is off', async function test() {
  const counter = registerCounterTools(function changed() {})
  const dialog = createApprovalDialog()
  const remove = installApprovalDialog(dialog, function requiresApproval() {
    return false
  })

  expect(
    (await invokeTool({ toolName: 'set_counter', input: { value: 3 }, source: 'pi' })).status
  ).toBe('success')
  expect(dialog.open).toBe(false)

  const pending = invokeTool({
    toolName: 'set_counter',
    input: { value: 4 },
    source: 'page-bridge'
  })
  await vi.waitFor(function waitingForDialog() {
    expect(dialog.open).toBe(true)
  })
  expect(dialog.querySelector('#approval-action')?.textContent).toContain('New value: 4')

  dialog.close('approve')
  expect(await pending).toMatchObject({ status: 'success', output: { value: 4 } })
  expect(counter.getValue()).toBe(4)

  remove()
  counter.destroy()
  dialog.remove()
})

it('opens approval for a caller-required confirmation even when the pi preference is off', async function test() {
  const counter = registerCounterTools(function changed() {})
  const dialog = createApprovalDialog()
  const remove = installApprovalDialog(dialog, function requiresApproval() {
    return false
  })

  const pending = invokeTool({
    toolName: 'set_counter',
    input: { value: 5 },
    source: 'pi',
    requireConfirmation: { reason: 'This action follows content from an untrusted source.' }
  })
  await vi.waitFor(function waitingForDialog() {
    expect(dialog.open).toBe(true)
  })
  // The tool's own reason still wins when both the tool and the caller require approval.
  expect(dialog.querySelector('#approval-action')?.textContent).toContain(
    'Change the application counter?'
  )

  dialog.close('approve')
  expect(await pending).toMatchObject({ status: 'success', output: { value: 5 } })

  remove()
  counter.destroy()
  dialog.remove()
})

it('opens approval for a caller-required confirmation on an unconfirmed tool', async function test() {
  registerTool(
    defineTool({
      name: 'save_draft',
      description: 'Save the current draft.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute() {
        return { saved: true }
      }
    })
  )
  const dialog = createApprovalDialog()
  const remove = installApprovalDialog(dialog, function requiresApproval() {
    return false
  })

  const pending = invokeTool({
    toolName: 'save_draft',
    input: {},
    source: 'pi',
    requireConfirmation: { reason: 'This action follows content from an untrusted source.' }
  })
  await vi.waitFor(function waitingForDialog() {
    expect(dialog.open).toBe(true)
  })
  expect(dialog.querySelector('#approval-action')?.textContent).toContain(
    'This action follows content from an untrusted source.'
  )

  dialog.close('deny')
  expect(await pending).toMatchObject({ status: 'blocked', code: 'confirmation_denied' })

  remove()
  dialog.remove()
})

function createApprovalDialog(): HTMLDialogElement {
  const dialog = document.createElement('dialog')
  dialog.innerHTML = '<p id="approval-action"></p>'
  dialog.showModal = vi.fn(function showModal() {
    dialog.setAttribute('open', '')
  })
  dialog.close = vi.fn(function close(returnValue?: string) {
    if (returnValue !== undefined) dialog.returnValue = returnValue
    dialog.removeAttribute('open')
    dialog.dispatchEvent(new Event('close'))
  })
  document.body.append(dialog)
  return dialog
}
