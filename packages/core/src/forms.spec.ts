import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { clearToolsForTest, invokeTool } from './registry'
import { inferFormInputSchema, registerFormTool } from './forms'

describe('form helpers', () => {
  beforeEach(() => {
    clearToolsForTest()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    clearToolsForTest()
    document.body.innerHTML = ''
  })

  it('infers schema from named form fields', () => {
    document.body.innerHTML = `
      <form>
        <label>Subject <input name="subject" required /></label>
        <label>Priority <input name="priority" type="number" /></label>
        <button type="submit">Submit</button>
      </form>
    `

    const form = document.querySelector('form')
    if (!form) throw new Error('Expected test form.')

    expect(inferFormInputSchema(form)).toEqual({
      type: 'object',
      properties: {
        subject: {
          type: 'string',
          description: 'Subject'
        },
        priority: {
          type: 'number',
          description: 'Priority'
        }
      },
      required: ['subject'],
      additionalProperties: false
    })
  })

  it('registers and invokes a form-backed tool', async () => {
    document.body.innerHTML = `
      <form>
        <input name="subject" />
        <textarea name="body"></textarea>
      </form>
    `

    const form = document.querySelector('form')
    if (!form) throw new Error('Expected test form.')

    registerFormTool({
      form,
      name: 'create_support_ticket',
      description: 'Create a support ticket from the current form fields.',
      execute(input) {
        return {
          subject: input.subject,
          body: input.body
        }
      }
    })

    const result = await invokeTool({
      toolName: 'create_support_ticket',
      input: {
        subject: 'Billing',
        body: 'Cannot access invoices.'
      }
    })

    expect(form.getAttribute('toolname')).toBe('create_support_ticket')
    expect(result.output).toEqual({
      subject: 'Billing',
      body: 'Cannot access invoices.'
    })
  })
})
