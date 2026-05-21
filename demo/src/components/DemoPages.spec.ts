import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearToolsForTest, invokeTool, listTools, type WebMCPCommandInputElement } from '@webmcp-kit/core'

import CommerceDemo from './CommerceDemo.vue'
import InventoryDemo from './InventoryDemo.vue'
import InvoicesDemo from './InvoicesDemo.vue'
import SupportDemo from './SupportDemo.vue'
import { mountWithDeps } from '@/test-utils/mount-with-deps'

interface WindowWithLanguageModel extends Window {
  LanguageModel?: {
    availability: (options?: unknown) => Promise<'available'>
    create: () => Promise<{
      prompt: (message: string) => Promise<string>
    }>
  }
}

describe('demo pages', () => {
  beforeEach(() => {
    clearToolsForTest()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    clearToolsForTest()
    delete (window as WindowWithLanguageModel).LanguageModel
    document.body.innerHTML = ''
  })

  it('starts with an empty command input and placeholder example', async () => {
    const wrapper = mountWithDeps(InventoryDemo, { attachTo: document.body })
    await flushPromises()

    expect(wrapper.text()).toContain('Inventory')
    expect(wrapper.text()).not.toContain('Invoices')

    const commandInput = await getCommandInput(wrapper)
    const commandTextInput = getCommandTextInput(commandInput)
    expect(commandTextInput.value).toBe('')
    expect(commandTextInput.getAttribute('placeholder')).toBe('Try: Select all French items')
    const providerControl = commandInput.shadowRoot?.querySelector<HTMLSelectElement>('[data-provider]')
    expect(providerControl).toBeInstanceOf(HTMLSelectElement)
    expect(providerControl?.value).toBe('auto')
    expect(commandInput.shadowRoot?.querySelector('[data-model]')).toBeNull()
    const diagnosticsRow = commandInput.shadowRoot?.querySelector<HTMLDetailsElement>('.webmcp-diagnostics')
    const diagnosticsSlot = commandInput.shadowRoot?.querySelector<HTMLSlotElement>('slot[name="diagnostics"]')
    expect(diagnosticsRow).toBeInstanceOf(HTMLDetailsElement)
    expect(diagnosticsSlot?.assignedElements()[0]?.getAttribute('data-webmcp-diagnostics')).toBe('')
    expect(wrapper.find('details.diagnostics-panel').exists()).toBe(false)

    await commandInput.run('Select all French items')
    await flushPromises()

    expect(wrapper.text()).toContain('5 selected')
    expect(wrapper.text()).toContain('Croissant')
    expect(wrapper.text()).toContain('Pain au chocolat')
    expect(window.confirm).not.toHaveBeenCalled()
  })

  it('shows model controls after choosing a local development provider', async () => {
    const wrapper = mountWithDeps(InventoryDemo, { attachTo: document.body })
    await flushPromises()

    const commandInput = await getCommandInput(wrapper)
    const providerControl = commandInput.shadowRoot?.querySelector<HTMLSelectElement>('[data-provider]')
    if (!providerControl) throw new Error('Expected provider control.')

    providerControl.value = 'local'
    providerControl.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(wrapper.text()).toContain('Local heuristic planner')

    providerControl.value = 'openai'
    providerControl.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    const settings = commandInput.shadowRoot?.querySelector<HTMLDetailsElement>('.webmcp-settings')
    const modelControl = commandInput.shadowRoot?.querySelector<HTMLSelectElement>('[data-model]')
    expect(settings?.open).toBe(true)
    expect(modelControl).toBeInstanceOf(HTMLSelectElement)
    expect(modelControl?.value).toBe('gpt-5.4-mini')
  })

  it('uses page-specific command examples', async () => {
    await expectCommandPlaceholder(InventoryDemo, 'Try: Select all French items')
    await expectCommandPlaceholder(InvoicesDemo, 'Try: Mark Stark Industries invoices as paid')
    await expectCommandPlaceholder(CommerceDemo, 'Try: Add two keyboard kits to the cart')
    await expectCommandPlaceholder(SupportDemo, 'Try: Mark billing access as resolved')
  })

  it('operates visible controls from AI-chosen context IDs', async () => {
    ;(window as WindowWithLanguageModel).LanguageModel = {
      availability: async () => 'available',
      create: async () => ({
        prompt: async (message: string) => {
          if (message.includes('French')) {
            return JSON.stringify({
              toolName: 'select_items',
              input: { ids: ['item_4', 'item_7'] },
              confidence: 0.94,
              reason: 'Selected French items from current inventory context.'
            })
          }

          throw new Error('Unexpected prompt')
        }
      })
    }

    const wrapper = mountWithDeps(InventoryDemo, { attachTo: document.body })
    await flushPromises()

    const commandInput = await getCommandInput(wrapper)
    await commandInput.run('Select all French items')
    await flushPromises()

    expect(wrapper.text()).toContain('2 selected')
    expect(wrapper.text()).toContain('Croissant')
  })

  it('executes chained invoice plans in order', async () => {
    const wrapper = mountWithDeps(InvoicesDemo, { attachTo: document.body })
    await flushPromises()

    const commandInput = await getCommandInput(wrapper)
    await commandInput.run('Mark Stark Industries invoices as paid')
    await flushPromises()

    const starkInvoiceRow = wrapper.findAll('tbody tr').find(function findStarkRow(row) {
      return row.text().includes('Stark Industries')
    })
    expect(starkInvoiceRow?.text()).toContain('paid')
    expect(starkInvoiceRow?.classes()).toContain('selected')
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('"status": "paid"'))
  })

  it('guards and confirms cart checkout', async () => {
    const wrapper = mountWithDeps(CommerceDemo, { attachTo: document.body })
    await flushPromises()

    await expect(invokeTool({
      toolName: 'checkout_cart',
      input: {},
      confirmed: true
    })).resolves.toMatchObject({
      status: 'blocked',
      error: 'Cart is empty.'
    })

    await invokeTool({
      toolName: 'add_to_cart',
      input: {
        productId: 'kbd-01',
        quantity: 2
      }
    })
    await flushPromises()

    vi.mocked(window.confirm).mockReturnValueOnce(false)
    await expect(invokeTool({
      toolName: 'checkout_cart',
      input: {}
    })).resolves.toMatchObject({
      status: 'blocked',
      error: 'Checkout clears the cart and represents a purchase action.'
    })

    await expect(invokeTool({
      toolName: 'checkout_cart',
      input: {},
      confirmed: true
    })).resolves.toMatchObject({
      status: 'success',
      output: {
        total: 258
      }
    })
    await flushPromises()

    expect(wrapper.text()).toContain('No cart lines yet.')
  })

  it('registers only inventory tools on the inventory page', async () => {
    mountWithDeps(InventoryDemo, { attachTo: document.body })
    await flushPromises()

    expect(getRegisteredToolNames()).toEqual(['clear_item_selection', 'select_items'])
  })

  it('registers only invoice tools on the invoices page', async () => {
    mountWithDeps(InvoicesDemo, { attachTo: document.body })
    await flushPromises()

    expect(getRegisteredToolNames()).toEqual([
      'create_invoice',
      'filter_invoices',
      'open_invoice',
      'select_invoices',
      'sort_invoices',
      'update_selected_invoice_status'
    ])
  })
})

async function getCommandInput(wrapper: ReturnType<typeof mountWithDeps>): Promise<WebMCPCommandInputElement> {
  await customElements.whenDefined('webmcp-command-input')
  const element = wrapper.find('webmcp-command-input').element as WebMCPCommandInputElement
  if (!element.shadowRoot) throw new Error('Expected WebMCP command input shadow root.')
  return element
}

function getCommandTextInput(element: WebMCPCommandInputElement): HTMLInputElement {
  const input = element.shadowRoot?.querySelector<HTMLInputElement>('[data-command-input]')
  if (!input) throw new Error('Expected WebMCP command text input.')
  return input
}

async function expectCommandPlaceholder(component: object, placeholder: string) {
  const wrapper = mountWithDeps(component, { attachTo: document.body })
  await flushPromises()

  const commandInput = await getCommandInput(wrapper)
  expect(getCommandTextInput(commandInput).getAttribute('placeholder')).toBe(placeholder)

  wrapper.unmount()
  clearToolsForTest()
  document.body.innerHTML = ''
}

function getRegisteredToolNames(): string[] {
  return listTools().map(function getToolName(entry) {
    return entry.tool.name
  }).sort()
}
