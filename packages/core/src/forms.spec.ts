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
      additionalProperties: false,
      'x-webmcp-source': 'form'
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

  it('warns on risky form-backed tools', () => {
    document.body.innerHTML = `
      <form>
        <input name="email" />
        <input name="password" type="password" />
        <textarea name="body" data-tool-description="Support request details"></textarea>
      </form>
    `

    const form = document.querySelector('form')
    if (!form) throw new Error('Expected test form.')

    const registration = registerFormTool({
      form,
      name: 'submit_account_request',
      description: 'Submit the account request form for review by the support team.'
    })

    expect(registration.warnings).toContain('Form field "email" needs a specific tool description.')
    expect(registration.warnings).toContain('Form field "email" is exposed without validation constraints.')
    expect(registration.warnings).toContain('Sensitive form field "password" should require explicit confirmation or be excluded.')
  })

  it('infers checkbox fields and data-tool-description overrides', () => {
    document.body.innerHTML = `
      <form>
        <input name="acceptedTerms" type="checkbox" data-tool-description="Whether the user accepted the terms." />
      </form>
    `

    const form = document.querySelector('form')
    if (!form) throw new Error('Expected test form.')

    expect(inferFormInputSchema(form).properties?.acceptedTerms).toEqual({
      type: 'boolean',
      description: 'Whether the user accepted the terms.'
    })
  })

  it('fills radio groups through RadioNodeList fields', async () => {
    document.body.innerHTML = `
      <form>
        <label>Low <input name="priority" type="radio" value="low" /></label>
        <label>High <input name="priority" type="radio" value="high" /></label>
      </form>
    `

    const form = document.querySelector('form')
    if (!form) throw new Error('Expected test form.')

    registerFormTool({
      form,
      name: 'set_ticket_priority',
      description: 'Set the support ticket priority from the current form fields.'
    })

    await invokeTool({
      toolName: 'set_ticket_priority',
      input: {
        priority: 'high'
      }
    })

    const priority = form.elements.namedItem('priority')
    expect(priority).toBeInstanceOf(RadioNodeList)
    expect((priority as RadioNodeList).value).toBe('high')
  })
})
