import { afterEach, expect, it, vi } from 'vitest'
import {
  getConfirmationHandler,
  requestToolConfirmation,
  setConfirmationHandler
} from './confirmation'

afterEach(function reset() {
  setConfirmationHandler(undefined)
  vi.restoreAllMocks()
})

it('supports nested owners and out-of-order disposal without restoring a removed handler', () => {
  function first() {
    return true
  }
  function second() {
    return false
  }
  const disposeFirst = setConfirmationHandler(first)
  const disposeSecond = setConfirmationHandler(second)
  disposeFirst()
  expect(getConfirmationHandler()).toBe(second)
  disposeSecond()
  expect(getConfirmationHandler()).toBeUndefined()
  disposeFirst()
  const dispose = setConfirmationHandler(first)
  const top = setConfirmationHandler(second)
  top()
  expect(getConfirmationHandler()).toBe(first)
  dispose()
})

it('shows the tool name and a bounded argument summary in the browser fallback', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  const tool = {
    name: 'send_invoice',
    description: 'Send the selected invoice to the customer.',
    inputSchema: { type: 'object' },
    confirmation: { reason: 'Send this invoice?' }
  }

  await expect(requestToolConfirmation(tool, { note: 'x'.repeat(600) })).resolves.toBe(true)

  const message = confirm.mock.calls[0]?.[0] ?? ''
  expect(message.startsWith('Send this invoice?')).toBe(true)
  expect(message).toContain('send_invoice')
  expect(message).toContain('"note"')
  expect(message).toContain('…')
  expect(message.slice(message.indexOf('send_invoice')).length).toBeLessThanOrEqual(500)
})

it('keeps the browser fallback working when the input cannot be serialized', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  const cyclic: Record<string, unknown> = {}
  cyclic.self = cyclic
  const tool = {
    name: 'save_note',
    description: 'Save the selected note in the workspace.',
    inputSchema: { type: 'object' }
  }

  await expect(requestToolConfirmation(tool, cyclic)).resolves.toBe(false)

  const message = confirm.mock.calls[0]?.[0] ?? ''
  expect(message).toContain('save_note')
  expect(message).toContain('[unserializable input]')
})
