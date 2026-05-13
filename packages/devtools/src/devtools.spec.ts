import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearToolsForTest, defineTool, registerTool } from '@webmcp-kit/core'

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

    registerTool(defineTool({
      name: 'create_invoice',
      description: 'Create a draft invoice for a customer and add it to the local invoice list.',
      inputSchema: {
        type: 'object',
        properties: {
          customerName: { type: 'string' },
          amount: { type: 'number', minimum: 1 }
        },
        required: ['customerName', 'amount']
      },
      execute
    }))

    const overlay = mountDevtoolsOverlay()

    expect(document.body.textContent).toContain('Tool Inspector')
    expect(document.body.textContent).toContain('create_invoice')
    expect(document.body.textContent).toContain('Quality 100%')
    expect(document.body.textContent).toContain('Prompt preview')

    const invokeButton = document.querySelector<HTMLButtonElement>('button[data-action="invoke"]')
    invokeButton?.click()
    await flushPromises()

    expect(execute).toHaveBeenCalledWith({ customerName: 'Acme Corp', amount: 1 }, { source: 'devtools' })
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
})

async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}
