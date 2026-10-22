import { afterEach, expect, it } from 'vitest'
import { invokeTool, registerTool } from '@vampaz/webmcp-kit'
import { clearToolsForTest } from '@vampaz/webmcp-kit/testing'
import { createGreetingTool, registerContactFormTool } from './toolkit'

afterEach(function cleanup() {
  clearToolsForTest()
  document.body.replaceChildren()
})

it('validates greeting input with the Zod schema before execution', async function greeting() {
  registerTool(createGreetingTool())
  expect(
    (await invokeTool({ toolName: 'format_greeting', input: { name: 'Ada', excited: true } }))
      .output
  ).toEqual({ greeting: 'Hello, Ada!' })
  expect(
    (await invokeTool({ toolName: 'format_greeting', input: { name: 'Ada', extra: 1 } })).code
  ).toBe('invalid_input')
})

it('fills the contact form draft from validated tool input', async function contactForm() {
  document.body.innerHTML = `<form>
    <input name="name" required maxlength="40">
    <select name="topic"><option value="billing">Billing</option><option value="support">Support</option></select>
    <input name="urgent" type="checkbox">
  </form>`
  const form = document.querySelector('form')!
  const filled: unknown[] = []
  registerContactFormTool(form, function record(input) {
    filled.push(input)
  })
  const input = { name: 'Ada', topic: 'support', urgent: true }
  expect((await invokeTool({ toolName: 'fill_contact_form', input })).status).toBe('success')
  expect(filled).toEqual([input])
  expect(new FormData(form).get('topic')).toBe('support')
  expect(
    (await invokeTool({ toolName: 'fill_contact_form', input: { ...input, topic: 'sales' } })).code
  ).toBe('invalid_input')
})
