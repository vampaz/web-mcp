import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearToolsForTest } from '@vampaz/webmcp-kit/testing'
import { defineTool, invokeTool, registerTool } from '@vampaz/webmcp-kit'

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
    Reflect.deleteProperty(navigator, 'clipboard')
  })

  it('refreshes registration mode and warnings in place after native registration fails', async () => {
    const registration = registerTool(
      defineTool({
        name: 'read_total',
        description: 'Read the current invoice total for the open workspace.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true },
        execute() {
          return 1
        }
      })
    )
    const overlay = mountDevtoolsOverlay()
    await flushPromises()
    const textarea = query<HTMLTextAreaElement>('textarea[data-tool-name="read_total"]')
    textarea.value = '{"draft":true}'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    registration.mode = 'native-and-fallback'
    overlay.refresh()

    // The registry updates the same registration object when native registration fails later.
    registration.mode = 'fallback'
    registration.warnings.push(
      'Native WebMCP registration failed; the fallback registry remains active.'
    )
    overlay.refresh()

    expect(query('[data-mode]').textContent).toBe('fallback')
    expect(overlayText()).toContain('Native WebMCP registration failed')
    expect(query<HTMLTextAreaElement>('textarea[data-tool-name="read_total"]')).toBe(textarea)
    expect(textarea.value).toBe('{"draft":true}')
    overlay.destroy()
  })

  it('batches registrations and avoids scope evaluation while closed', async () => {
    const scope = vi.fn(() => ({ available: true }))
    const overlay = mountDevtoolsOverlay({ initiallyOpen: false })
    for (const name of ['read_first', 'read_second'])
      registerTool(
        defineTool({
          name,
          description: 'Read a value from the current application state.',
          inputSchema: { type: 'object', properties: {} },
          scope,
          execute() {
            return 1
          }
        })
      )
    await flushPromises()
    expect(scope).not.toHaveBeenCalled()
    expect(overlayText()).toContain('2 tools')
    const toggle = query<HTMLButtonElement>('[data-action="toggle"]')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(query('.wmk-devtools').hasAttribute('data-open')).toBe(false)
    toggle.click()
    expect(scope).toHaveBeenCalledTimes(2)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    overlay.destroy()
  })

  it('renders inside an isolated shadow root at the requested corner', () => {
    const overlay = mountDevtoolsOverlay({ position: 'top-start' })

    const host = document.querySelector<HTMLElement>('.wmk-devtools-host')
    expect(host?.shadowRoot).not.toBeNull()
    expect(document.head.querySelector('style')).toBeNull()
    expect(document.body.querySelector('style')).toBeNull()
    expect(query('.wmk-devtools').dataset.position).toBe('top-start')
    expect(query('.wmk-devtools').hasAttribute('data-open')).toBe(true)
    const styles = host?.shadowRoot?.querySelector('style')?.textContent ?? ''
    expect(styles).toContain('var(--wmk-devtools-accent, #2458ff)')
    expect(styles).not.toContain('--demo-blue')
    expect(styles).not.toContain('100vw')

    overlay.destroy()
    expect(document.querySelector('.wmk-devtools-host')).toBeNull()
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

    expect(overlayText()).toContain('Tool Inspector')
    expect(overlayText()).toContain('Integration health')
    expect(overlayText()).toContain('1 tool registered with 1 warning.')
    expect(overlayText()).toContain('create_invoice')
    expect(overlayText()).toContain('Quality 80%')
    expect(overlayText()).toContain('Improve this tool')
    expect(overlayText()).toContain('Require confirmation for this mutating action')
    expect(overlayText()).toContain('Prompt preview')

    query<HTMLButtonElement>('button[data-action="invoke"]').click()
    await flushPromises()

    expect(execute).toHaveBeenCalledWith(
      { customerName: 'Acme Corp', amount: 1 },
      { source: 'devtools' }
    )
    await vi.waitFor(() => expect(overlayText()).toContain('create_invoice - success'))
    expect(overlayText()).toContain('Invocation history')
    expect(overlayText()).toContain('"input"')
    expect(overlayText()).toContain('"output"')

    query<HTMLButtonElement>('button[data-action="replay"]').click()
    await flushPromises()

    expect(execute).toHaveBeenCalledTimes(2)

    overlay.destroy()
    expect(document.body.textContent).not.toContain('Tool Inspector')
  })

  it('shows invalid JSON errors inline without invoking the tool', async () => {
    const execute = vi.fn(function executeTool() {
      return { ok: true }
    })
    registerTool(createAmountTool(execute))

    const overlay = mountDevtoolsOverlay()
    const textarea = query<HTMLTextAreaElement>('textarea[data-tool-name="create_invoice"]')
    const error = query<HTMLElement>('[data-input-error]')

    textarea.value = '{'
    query<HTMLButtonElement>('button[data-action="invoke"]').click()
    await flushPromises()

    expect(execute).not.toHaveBeenCalled()
    expect(error.hidden).toBe(false)
    expect(error.textContent).toContain('Input must be valid JSON.')
    expect(textarea.getAttribute('aria-invalid')).toBe('true')
    expect(textarea.getAttribute('aria-describedby')).toContain(error.id)
    expect(query('.wmk-devtools__history').textContent).toContain('No invocations yet.')

    textarea.value = '[]'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    expect(error.hidden).toBe(true)
    expect(textarea.hasAttribute('aria-invalid')).toBe(false)
    query<HTMLButtonElement>('button[data-action="invoke"]').click()
    expect(error.textContent).toBe('Input must be a JSON object.')

    overlay.destroy()
  })

  it('preserves edited tool input across unrelated overlay renders', async () => {
    registerTool(
      defineTool({
        name: 'create_invoice',
        description: 'Create a draft invoice.',
        inputSchema: {
          type: 'object',
          properties: {
            amount: { type: 'number' }
          },
          additionalProperties: false
        },
        execute(input) {
          return input
        }
      })
    )
    registerTool(
      defineTool({
        name: 'search_products',
        description: 'Search products.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' }
          },
          additionalProperties: false
        },
        execute(input) {
          return input
        }
      })
    )

    const overlay = mountDevtoolsOverlay()
    const invoiceInput = query<HTMLTextAreaElement>('textarea[data-tool-name="create_invoice"]')
    const searchInput = query<HTMLTextAreaElement>('textarea[data-tool-name="search_products"]')
    const searchButton = query<HTMLButtonElement>(
      'button[data-action="invoke"][data-tool-name="search_products"]'
    )

    invoiceInput.value = JSON.stringify({ amount: 42 })
    invoiceInput.dispatchEvent(new Event('input', { bubbles: true }))
    invoiceInput.focus()
    invoiceInput.setSelectionRange(2, 4)
    searchInput.value = JSON.stringify({ query: 'dock' })
    searchButton.click()
    await flushPromises()

    expect(query<HTMLTextAreaElement>('textarea[data-tool-name="create_invoice"]')).toBe(
      invoiceInput
    )
    expect(invoiceInput.value).toBe(JSON.stringify({ amount: 42 }))
    expect(getShadowRoot().activeElement).toBe(invoiceInput)
    expect(invoiceInput.selectionStart).toBe(2)

    overlay.destroy()
  })

  it('keeps open details and panel scroll position when events re-render', async () => {
    registerTool(createReadTool('read_status'))
    const overlay = mountDevtoolsOverlay()
    const panel = query<HTMLElement>('.wmk-devtools__panel')
    const preview = query<HTMLDetailsElement>('.wmk-devtools__preview')
    preview.open = true
    panel.scrollTop = 120

    await invokeTool({ toolName: 'read_status', input: {} })
    registerTool(createReadTool('read_other'))
    await flushPromises()

    expect(query<HTMLDetailsElement>('.wmk-devtools__preview')).toBe(preview)
    expect(preview.open).toBe(true)
    expect(panel.scrollTop).toBe(120)
    expect(getShadowRoot().querySelectorAll('.wmk-devtools__tool')).toHaveLength(2)

    overlay.destroy()
  })

  it('records source, time, and confirmation outcome in a 50 entry history', async () => {
    registerTool(createAmountTool(vi.fn(), { reason: 'Creates an invoice.' }))
    registerTool(createReadTool('read_status'))
    const overlay = mountDevtoolsOverlay()

    query<HTMLButtonElement>(
      'button[data-action="invoke"][data-tool-name="create_invoice"]'
    ).click()
    await vi.waitFor(() => expect(overlayText()).toContain('create_invoice - success'))
    const item = query('.wmk-devtools__history-item')
    expect(item.textContent).toContain('devtools')
    expect(item.textContent).toContain('confirmation approved')
    expect(item.querySelector('time')?.getAttribute('datetime')).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    for (let index = 0; index < 55; index += 1) {
      await invokeTool({ toolName: 'read_status', input: {} })
    }
    await flushPromises()
    expect(getShadowRoot().querySelectorAll('.wmk-devtools__history-item')).toHaveLength(50)

    overlay.destroy()
  })

  it('filters tools and shows schema hints next to each input', () => {
    registerTool(createAmountTool(vi.fn(), { reason: 'Creates an invoice.' }))
    registerTool(createReadTool('read_status'))
    const overlay = mountDevtoolsOverlay()

    const hints = query('.wmk-devtools__schema')
    expect(hints.textContent).toContain('amount')
    expect(hints.textContent).toContain('number')
    expect(hints.textContent).toContain('required')
    expect(overlayText()).toContain('No input fields.')

    const filter = query<HTMLInputElement>('[data-filter]')
    filter.value = 'STATUS'
    filter.dispatchEvent(new Event('input', { bubbles: true }))
    const articles = Array.from(
      getShadowRoot().querySelectorAll<HTMLElement>('.wmk-devtools__tool')
    )
    expect(
      articles
        .filter(function visible(article) {
          return !article.hidden
        })
        .map(function name(article) {
          return article.querySelector('strong')?.textContent
        })
    ).toEqual(['read_status'])

    filter.value = 'missing'
    filter.dispatchEvent(new Event('input', { bubbles: true }))
    expect(query('[data-filter-empty]').hidden).toBe(false)

    overlay.destroy()
  })

  it('shows an in-progress state while Invoke runs', async () => {
    let finish!: () => void
    registerTool(
      defineTool({
        name: 'read_slow',
        description: 'Read a slow value from the current application state.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true },
        execute() {
          return new Promise<number>(function wait(resolve) {
            finish = function done() {
              resolve(1)
            }
          })
        }
      })
    )
    const overlay = mountDevtoolsOverlay()
    const article = query('.wmk-devtools__tool')
    const status = query('[data-tool-status]')

    query<HTMLButtonElement>('button[data-action="invoke"]').click()
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))

    expect(article.hasAttribute('data-busy')).toBe(true)
    expect(status.textContent).toContain('Invoking')

    finish()
    await vi.waitFor(() => expect(article.hasAttribute('data-busy')).toBe(false))
    expect(status.textContent).toMatch(/^Last call: success in \d+ms\.$/)

    overlay.destroy()
  })

  it('copies an invokeTool snippet and reports clipboard failures', async () => {
    const writeText = vi.fn(async function write() {})
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    registerTool(createAmountTool(vi.fn(), { reason: 'Creates an invoice.' }))
    const overlay = mountDevtoolsOverlay()
    const textarea = query<HTMLTextAreaElement>('textarea[data-tool-name="create_invoice"]')
    const status = query('[data-tool-status]')
    textarea.value = JSON.stringify({ amount: 5 })

    query<HTMLButtonElement>('button[data-action="copy"]').click()
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledOnce())

    expect(writeText).toHaveBeenCalledWith(
      'await invokeTool({\n  toolName: "create_invoice",\n  input: {\n    "amount": 5\n  }\n})'
    )
    await vi.waitFor(() => expect(status.textContent).toBe('Copied the invokeTool() snippet.'))

    writeText.mockRejectedValueOnce(new Error('Permission denied'))
    query<HTMLButtonElement>('button[data-action="copy"]').click()
    await vi.waitFor(() => expect(status.textContent).toBe('Copy failed: Permission denied'))

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

    expect(overlayText()).toContain('Read-only')

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
    registerTool(createAmountTool(execute))

    const overlay = mountDevtoolsOverlay()
    const textarea = query<HTMLTextAreaElement>('textarea[data-tool-name="create_invoice"]')
    const invokeButton = query<HTMLButtonElement>('button[data-action="invoke"]')

    textarea.value = JSON.stringify({ amount: 1 })
    invokeButton.click()
    textarea.value = JSON.stringify({ amount: 2 })
    invokeButton.click()
    await flushPromises()

    expect(execute).toHaveBeenCalledTimes(2)

    resolvers[1]?.()
    resolvers[0]?.()
    await flushPromises()

    expect(overlayText()).toContain('"amount": 1')
    expect(overlayText()).toContain('"amount": 2')

    overlay.destroy()
  })

  it('shows integration errors when no tools are registered', () => {
    const overlay = mountDevtoolsOverlay()

    expect(overlayText()).toContain('Integration health')
    expect(overlayText()).toContain('1 integration error found.')
    expect(overlayText()).toContain('No WebMCP tools are registered')
    expect(overlayText()).toContain('Register a tool with registerTool()')

    overlay.destroy()
  })

  it('keeps the inspector usable with quoted tool names and non-JSON results', async function test() {
    registerTool(
      defineTool({
        name: 'read_"quoted',
        description: 'Read a value that cannot be serialized to JSON.',
        inputSchema: { type: 'object', properties: {} },
        execute() {
          return 1n
        }
      })
    )
    const overlay = mountDevtoolsOverlay()
    expect(query('textarea').getAttribute('aria-label')).toBe('read_"quoted input JSON')
    query<HTMLButtonElement>('[data-action="invoke"]').click()
    await flushPromises()
    await vi.waitFor(() => expect(overlayText()).toContain('cannot be displayed as JSON'))
    expect(function refresh() {
      overlay.refresh()
    }).not.toThrow()
    overlay.destroy()
  })
})

function getShadowRoot(): ShadowRoot {
  const root = document.querySelector('.wmk-devtools-host')?.shadowRoot
  if (!root) throw new Error('Expected devtools shadow root.')
  return root
}

function query<T extends HTMLElement = HTMLElement>(selector: string): T {
  const element = getShadowRoot().querySelector<T>(selector)
  if (!element) throw new Error(`Expected ${selector}.`)
  return element
}

function overlayText(): string {
  return getShadowRoot().querySelector('.wmk-devtools')?.textContent ?? ''
}

function createAmountTool(
  execute: (input: { amount: number }) => unknown,
  confirmation?: { reason: string }
) {
  return defineTool({
    name: 'create_invoice',
    description: 'Create a draft invoice for a customer and add it to the local invoice list.',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'number', minimum: 1 }
      },
      required: ['amount'],
      additionalProperties: false
    },
    ...(confirmation ? { confirmation } : {}),
    execute
  })
}

function createReadTool(name: string) {
  return defineTool({
    name,
    description: 'Read a value from the current application state.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    execute() {
      return 1
    }
  })
}

async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}
