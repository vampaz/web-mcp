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

  it('passes numeric form input through to custom execute handlers', async () => {
    document.body.innerHTML = `
      <form>
        <label>Amount <input name="amount" type="number" /></label>
      </form>
    `

    const form = document.querySelector('form')
    if (!form) throw new Error('Expected test form.')

    registerFormTool({
      form,
      name: 'create_invoice',
      description: 'Create an invoice from the visible form fields.',
      execute(input) {
        return {
          amount: input.amount
        }
      }
    })

    await expect(
      invokeTool({
        toolName: 'create_invoice',
        input: {
          amount: 42
        }
      })
    ).resolves.toMatchObject({
      status: 'success',
      output: {
        amount: 42
      }
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
    expect(registration.warnings).toContain(
      'Form field "email" is exposed without validation constraints.'
    )
    expect(registration.warnings).toContain(
      'Sensitive form field "password" should require explicit confirmation or be excluded.'
    )
  })

  it('infers checkbox fields and official tool parameter description overrides', () => {
    document.body.innerHTML = `
      <form>
        <input name="acceptedTerms" type="checkbox" toolparamdescription="Whether the user accepted the terms." />
      </form>
    `

    const form = document.querySelector('form')
    if (!form) throw new Error('Expected test form.')

    expect(inferFormInputSchema(form).properties?.acceptedTerms).toEqual({
      type: 'boolean',
      description: 'Whether the user accepted the terms.'
    })
  })

  it('keeps data-tool-description as a compatibility fallback', () => {
    document.body.innerHTML = `
      <form>
        <textarea name="body" data-tool-description="Support request details"></textarea>
      </form>
    `

    const form = document.querySelector('form')
    if (!form) throw new Error('Expected test form.')

    expect(inferFormInputSchema(form).properties?.body).toEqual({
      type: 'string',
      description: 'Support request details'
    })
  })

  it('applies explicit field metadata as official declarative attributes', () => {
    document.body.innerHTML = `
      <form>
        <input name="email" type="email" />
      </form>
    `

    const form = document.querySelector('form')
    const email = document.querySelector('input[name="email"]')
    if (!form || !email) throw new Error('Expected test form.')

    registerFormTool({
      form,
      name: 'send_support_reply',
      description: 'Send a support reply to the visible customer email address.',
      fields: {
        email: {
          title: 'Customer email',
          description: 'Email address that receives the support reply.'
        }
      }
    })

    expect(email.getAttribute('toolparamtitle')).toBe('Customer email')
    expect(email.getAttribute('toolparamdescription')).toBe(
      'Email address that receives the support reply.'
    )
    expect(inferFormInputSchema(form).properties?.email).toEqual({
      type: 'string',
      format: 'email',
      description: 'Email address that receives the support reply.'
    })
  })

  it('infers richer schemas from email, date, time, and select fields', () => {
    document.body.innerHTML = `
      <form>
        <label>Email <input name="email" type="email" required /></label>
        <label>Date <input name="date" type="date" /></label>
        <label>Time <input name="time" type="time" /></label>
        <label>Status
          <select name="status">
            <option value="">Choose</option>
            <option value="new">New</option>
            <option value="resolved">Resolved</option>
          </select>
        </label>
      </form>
    `

    const form = document.querySelector('form')
    if (!form) throw new Error('Expected test form.')

    expect(inferFormInputSchema(form)).toEqual({
      type: 'object',
      properties: {
        email: {
          type: 'string',
          format: 'email',
          description: 'Email'
        },
        date: {
          type: 'string',
          format: 'date',
          description: 'Date'
        },
        time: {
          type: 'string',
          pattern: '^\\d{2}:\\d{2}$',
          description: 'Time'
        },
        status: {
          type: 'string',
          description: 'Status',
          enum: ['new', 'resolved']
        }
      },
      required: ['email'],
      additionalProperties: false,
      'x-webmcp-source': 'form'
    })
  })

  it('infers native constraints and multi-select fields', () => {
    document.body.innerHTML = `
      <form>
        <label>Subject <input name="subject" minlength="4" maxlength="40" pattern="[A-Za-z ]+" /></label>
        <label>Amount <input name="amount" type="number" min="1" max="500" /></label>
        <label>Tags
          <select name="tags" multiple required>
            <option value="billing">Billing</option>
            <option value="access">Access</option>
          </select>
        </label>
      </form>
    `

    const form = document.querySelector('form')
    if (!form) throw new Error('Expected test form.')

    expect(inferFormInputSchema(form)).toEqual({
      type: 'object',
      properties: {
        subject: {
          type: 'string',
          minLength: 4,
          maxLength: 40,
          pattern: '[A-Za-z ]+',
          description: 'Subject'
        },
        amount: {
          type: 'number',
          minimum: 1,
          maximum: 500,
          description: 'Amount'
        },
        tags: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['billing', 'access']
          },
          minItems: 1,
          description: 'Tags'
        }
      },
      required: ['tags'],
      additionalProperties: false,
      'x-webmcp-source': 'form'
    })
  })

  it('ignores invalid native number constraints instead of creating invalid schemas', () => {
    document.body.innerHTML = `
      <form>
        <label>Amount <input name="amount" type="number" min="not-a-number" max="Infinity" /></label>
      </form>
    `

    const form = document.querySelector('form')
    if (!form) throw new Error('Expected test form.')

    expect(inferFormInputSchema(form).properties?.amount).toEqual({
      type: 'number',
      description: 'Amount'
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

  it('blocks form execution when native validity fails after filling', async () => {
    document.body.innerHTML = `
      <form>
        <label>Email <input name="email" type="email" required /></label>
      </form>
    `

    const form = document.querySelector('form')
    if (!form) throw new Error('Expected test form.')

    registerFormTool({
      form,
      name: 'send_support_reply',
      description: 'Send a support reply to the visible customer email address.',
      execute(input) {
        return input
      }
    })

    await expect(
      invokeTool({
        toolName: 'send_support_reply',
        input: {
          email: 'not-an-email'
        }
      })
    ).resolves.toMatchObject({
      status: 'error',
      error: 'Form input does not satisfy native validation constraints.'
    })
  })

  it('dispatches input and change events when filling fields', async () => {
    const events: string[] = []
    document.body.innerHTML = `
      <form>
        <input name="subject" />
        <textarea name="body"></textarea>
        <input name="accepted" type="checkbox" />
        <label>Low <input name="priority" type="radio" value="low" /></label>
        <label>High <input name="priority" type="radio" value="high" /></label>
      </form>
    `

    const form = document.querySelector('form')
    if (!form) throw new Error('Expected test form.')

    form.addEventListener('input', function handleInput(event) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        events.push(`input:${event.target.name}`)
      }
    })
    form.addEventListener('change', function handleChange(event) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        events.push(`change:${event.target.name}`)
      }
    })

    registerFormTool({
      form,
      name: 'update_support_ticket',
      description: 'Update the support ticket form fields.'
    })

    await invokeTool({
      toolName: 'update_support_ticket',
      input: {
        subject: 'Billing',
        body: 'Cannot access invoices.',
        accepted: true,
        priority: 'high'
      }
    })

    expect(events).toEqual([
      'input:subject',
      'change:subject',
      'input:body',
      'change:body',
      'input:accepted',
      'change:accepted',
      'input:priority',
      'change:priority'
    ])
  })
})
