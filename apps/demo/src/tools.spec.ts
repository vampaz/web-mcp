import { afterEach, expect, it } from 'vitest'
import { invokeTool, setConfirmationHandler, unregisterTool } from '@vampaz/webmcp-kit'
import { registerCounterTools } from './tools'

afterEach(function cleanup() {
  unregisterTool('read_counter')
  unregisterTool('set_counter')
  setConfirmationHandler(undefined)
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
