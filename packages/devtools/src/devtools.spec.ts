import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearToolsForTest, defineTool, registerTool } from 'webmcp-kit'

import { mountDevtoolsOverlay } from './devtools'

describe('devtools overlay', () => {
  beforeEach(() => {
    clearToolsForTest()
    document.body.innerHTML = ''
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  afterEach(() => {
    clearToolsForTest()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('renders registered tools and invokes them', async () => {
    const execute = vi.fn(function executeTool() {
      return { ok: true }
    })

    registerTool(
      defineTool({
        name: 'create_invoice',
        description: 'Create a draft invoice for a customer and add it to the local invoice list.',
        inputSchema: {
          type: 'object',
          properties: {
            customerName: { type: 'string' },
            amount: { type: 'number', minimum: 1 }
          },
          required: ['customerName', 'amount'],
          additionalProperties: false
        },
        execute
      })
    )

    const overlay = mountDevtoolsOverlay()

    expect(document.body.textContent).toContain('Tool Inspector')
    expect(document.body.textContent).toContain('Integration health')
    expect(document.body.textContent).toContain('1 tool registered and ready.')
    expect(document.body.textContent).toContain('create_invoice')
    expect(document.body.textContent).toContain('Quality 100%')
    expect(document.body.textContent).toContain('Prompt preview')

    const invokeButton = document.querySelector<HTMLButtonElement>('button[data-action="invoke"]')
    invokeButton?.click()
    await flushPromises()

    expect(execute).toHaveBeenCalledWith(
      { customerName: 'Acme Corp', amount: 1 },
      { source: 'devtools' }
    )
    expect(document.body.textContent).toContain('create_invoice - success')
    expect(document.body.textContent).toContain('Invocation history')
    expect(document.body.textContent).toContain('"input"')
    expect(document.body.textContent).toContain('"output"')

    const replayButton = document.querySelector<HTMLButtonElement>('button[data-action="replay"]')
    replayButton?.click()
    await flushPromises()

    expect(execute).toHaveBeenCalledTimes(2)

    overlay.destroy()
    expect(document.body.textContent).not.toContain('Tool Inspector')
  })

  it('shows invalid JSON errors without invoking the tool', async () => {
    const execute = vi.fn(function executeTool() {
      return { ok: true }
    })

    registerTool(
      defineTool({
        name: 'create_invoice',
        description: 'Create a draft invoice for a customer and add it to the local invoice list.',
        inputSchema: {
          type: 'object',
          properties: {
            amount: { type: 'number', minimum: 1 }
          },
          additionalProperties: false
        },
        execute
      })
    )

    const overlay = mountDevtoolsOverlay()
    const textarea = document.querySelector<HTMLTextAreaElement>(
      'textarea[data-tool-name="create_invoice"]'
    )
    if (!textarea) throw new Error('Expected devtools textarea.')

    textarea.value = '{'
    document.querySelector<HTMLButtonElement>('button[data-action="invoke"]')?.click()
    await flushPromises()

    expect(execute).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Input must be valid JSON.')

    overlay.destroy()
  })

  it('shows read-only hints for annotated tools', () => {
    registerTool(
      defineTool({
        name: 'get_invoice_status',
        description: 'Read visible invoice status information without changing invoice data.',
        inputSchema: {
          type: 'object',
          properties: {
            invoiceId: { type: 'string' }
          },
          required: ['invoiceId'],
          additionalProperties: false
        },
        annotations: {
          readOnlyHint: true
        },
        execute(input) {
          return input
        }
      })
    )

    const overlay = mountDevtoolsOverlay()

    expect(document.body.textContent).toContain('Read-only')

    overlay.destroy()
  })

  it('keeps history inputs attached to concurrent calls for the same tool', async () => {
    const resolvers: Array<() => void> = []
    const execute = vi.fn(function executeTool(input: { amount: number }) {
      return new Promise(function resolveLater(resolve: (value: { amount: number }) => void) {
        resolvers.push(function resolveInput() {
          resolve(input)
        })
      })
    })

    registerTool(
      defineTool({
        name: 'create_invoice',
        description: 'Create a draft invoice for a customer and add it to the local invoice list.',
        inputSchema: {
          type: 'object',
          properties: {
            amount: { type: 'number', minimum: 1 }
          },
          additionalProperties: false
        },
        execute
      })
    )

    const overlay = mountDevtoolsOverlay()
    const textarea = document.querySelector<HTMLTextAreaElement>(
      'textarea[data-tool-name="create_invoice"]'
    )
    const invokeButton = document.querySelector<HTMLButtonElement>('button[data-action="invoke"]')
    if (!textarea || !invokeButton) throw new Error('Expected devtools controls.')

    textarea.value = JSON.stringify({ amount: 1 })
    invokeButton.click()
    textarea.value = JSON.stringify({ amount: 2 })
    invokeButton.click()
    await flushPromises()

    expect(execute).toHaveBeenCalledTimes(2)

    resolvers[1]?.()
    resolvers[0]?.()
    await flushPromises()

    expect(document.body.textContent).toContain('"amount": 1')
    expect(document.body.textContent).toContain('"amount": 2')

    overlay.destroy()
  })

  it('shows integration errors when no tools are registered', () => {
    const overlay = mountDevtoolsOverlay()

    expect(document.body.textContent).toContain('Integration health')
    expect(document.body.textContent).toContain('1 integration error found.')
    expect(document.body.textContent).toContain('No WebMCP tools are registered')
    expect(document.body.textContent).toContain('Register a tool with registerTool()')

    overlay.destroy()
  })
})

async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}
