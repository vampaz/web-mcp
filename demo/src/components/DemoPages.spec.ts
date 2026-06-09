import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearToolsForTest,
  invokeTool,
  listTools,
  type WebMCPCommandInputElement
} from 'webmcp-kit'

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
    expect(wrapper.text()).toContain('Context-scoped selection')
    expect(wrapper.text()).toContain('Planner context')

    const commandInput = await getCommandInput(wrapper)
    const commandTextInput = getCommandTextInput(commandInput)
    expect(commandTextInput.value).toBe('')
    expect(commandTextInput.getAttribute('placeholder')).toBe('Try: Select all French items')
    expect(commandInput.shadowRoot?.querySelector('[data-provider]')).toBeNull()
    expect(commandInput.shadowRoot?.querySelector('[data-model]')).toBeNull()
    expect(commandInput.shadowRoot?.querySelector('.webmcp-settings')).toBeNull()
    const diagnosticsRow =
      commandInput.shadowRoot?.querySelector<HTMLDetailsElement>('.webmcp-diagnostics')
    const diagnosticsSlot = commandInput.shadowRoot?.querySelector<HTMLSlotElement>(
      'slot[name="diagnostics"]'
    )
    expect(diagnosticsRow).toBeInstanceOf(HTMLDetailsElement)
    expect(diagnosticsSlot?.assignedElements()[0]?.getAttribute('data-webmcp-diagnostics')).toBe('')
    expect(wrapper.find('details.diagnostics-panel').exists()).toBe(false)
    const inventoryTable = wrapper.get('table[aria-label="Selectable inventory items"]')
    expect(
      inventoryTable.findAll('thead th').map(function mapHeader(header) {
        return header.text()
      })
    ).toEqual(['Select', '#', 'Item', 'Aisle', 'Stock', 'Supplier', 'Demand', 'Margin'])

    await commandInput.run('Select all French items')
    await flushPromises()

    expect(wrapper.text()).toContain('5 selected')
    expect(wrapper.text()).toContain('Croissant')
    expect(wrapper.text()).toContain('Pain au chocolat')
    expect(wrapper.text()).toContain('select_items')
    expect(wrapper.text()).toContain('"ids"')
    expect(window.confirm).not.toHaveBeenCalled()
  })

  it('uses local deterministic planning when demo tests do not configure endpoints', async () => {
    const wrapper = mountWithDeps(InventoryDemo, { attachTo: document.body })
    await flushPromises()

    const commandInput = await getCommandInput(wrapper)
    await commandInput.run('Select all French items')
    await flushPromises()

    expect(wrapper.text()).toContain('5 selected')
    expect(commandInput.shadowRoot?.querySelector('[data-provider]')).toBeNull()
    expect(commandInput.shadowRoot?.querySelector('[data-model]')).toBeNull()
  })

  it('opens and focuses the command input with command k', async () => {
    const wrapper = mountWithDeps(InventoryDemo, { attachTo: document.body })
    await flushPromises()

    const commandInput = await getCommandInput(wrapper)
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'k',
      metaKey: true
    })

    window.dispatchEvent(event)
    await flushPromises()

    expect(event.defaultPrevented).toBe(true)
    expect(commandInput.panelOpen).toBe(true)
    expect(commandInput.shadowRoot?.activeElement).toBe(getCommandTextInput(commandInput))
    expect(wrapper.get('button.webmcp-command-launcher').attributes('aria-expanded')).toBe('true')

    getCommandTextInput(commandInput).dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
    )
    await flushPromises()

    expect(commandInput.panelOpen).toBe(false)
    expect(wrapper.get('button.webmcp-command-launcher').attributes('aria-expanded')).toBe('false')
  })

  it('uses page-specific command examples', async () => {
    await expectCommandPlaceholder(InventoryDemo, 'Try: Select all French items')
    await expectCommandPlaceholder(InvoicesDemo, 'Try: Mark Stark Industries invoices as paid')
    await expectCommandPlaceholder(CommerceDemo, 'Try: Add two keyboard kits to the cart')
    await expectCommandPlaceholder(SupportDemo, 'Try: Create a support ticket')
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

  it('sorts inventory through the registered tool', async () => {
    const wrapper = mountWithDeps(InventoryDemo, { attachTo: document.body })
    await flushPromises()

    await invokeTool({
      toolName: 'sort_inventory',
      input: {
        direction: 'desc',
        sortBy: 'stock'
      }
    })
    await flushPromises()

    expect(wrapper.get('tbody tr').text()).toContain('Water')
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
    expect(wrapper.text()).toContain('select_invoices -> update_selected_invoice_status')
    expect(wrapper.text()).toContain('"status": "paid"')
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('"status": "paid"'))
  })

  it('shows blocked planner results as part of the commerce safety story', async () => {
    const wrapper = mountWithDeps(CommerceDemo, { attachTo: document.body })
    await flushPromises()

    expect(wrapper.text()).toContain('Guarded purchase flow')

    const commandInput = await getCommandInput(wrapper)
    await commandInput.run('Add 20 keyboard kits to the cart')
    await flushPromises()

    expect(wrapper.text()).toContain('Blocked "Add 20 keyboard kits to the cart"')
    expect(wrapper.text()).toContain('Requested quantity exceeds available stock.')
    expect(wrapper.text()).toContain('add_to_cart')
    expect(wrapper.text()).toContain('"quantity": 20')
  })

  it('adds products from individual commerce catalog cards', async () => {
    const wrapper = mountWithDeps(CommerceDemo, { attachTo: document.body })
    await flushPromises()

    await wrapper.get('input[aria-label="Quantity for Travel USB-C dock"]').setValue('3')
    await wrapper.get('button[aria-label="Add Travel USB-C dock to cart"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Travel USB-C dock')
    expect(wrapper.text()).toContain('3 in cart')
    expect(wrapper.text()).toContain('€267')
  })

  it('guards and confirms cart checkout', async () => {
    const wrapper = mountWithDeps(CommerceDemo, { attachTo: document.body })
    await flushPromises()

    await expect(
      invokeTool({
        toolName: 'checkout_cart',
        input: {},
        confirmed: true
      })
    ).resolves.toMatchObject({
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
    await expect(
      invokeTool({
        toolName: 'checkout_cart',
        input: {}
      })
    ).resolves.toMatchObject({
      status: 'blocked',
      error: 'Checkout clears the cart and represents a purchase action.'
    })

    await expect(
      invokeTool({
        toolName: 'checkout_cart',
        input: {},
        confirmed: true
      })
    ).resolves.toMatchObject({
      status: 'success',
      output: {
        total: 258
      }
    })
    await flushPromises()

    expect(wrapper.text()).toContain('No cart lines yet.')
  })

  it('creates support tickets from the page suggestion', async () => {
    const wrapper = mountWithDeps(SupportDemo, { attachTo: document.body })
    await flushPromises()

    const commandInput = await getCommandInput(wrapper)
    await commandInput.run('Create a support ticket')
    await flushPromises()

    expect(wrapper.text()).toContain('4 tickets')
    expect(wrapper.text()).toContain('Support ticket created')
    expect(wrapper.text()).toContain('Help request opened for Northwind.')
    expect(wrapper.text()).toContain('create_support_ticket')
    expect(wrapper.text()).toContain('"subject": "Help request"')
  })

  it('blocks commerce cart quantities beyond available stock', async () => {
    mountWithDeps(CommerceDemo, { attachTo: document.body })
    await flushPromises()

    await expect(
      invokeTool({
        toolName: 'add_to_cart',
        input: {
          productId: 'kbd-01',
          quantity: 18
        }
      })
    ).resolves.toMatchObject({
      status: 'success'
    })

    await expect(
      invokeTool({
        toolName: 'add_to_cart',
        input: {
          productId: 'kbd-01',
          quantity: 1
        }
      })
    ).resolves.toMatchObject({
      status: 'blocked',
      error: 'Requested quantity exceeds available stock.'
    })

    await expect(
      invokeTool({
        toolName: 'update_cart_quantity',
        input: {
          productId: 'kbd-01',
          quantity: 19
        }
      })
    ).resolves.toMatchObject({
      status: 'blocked',
      error: 'Requested quantity exceeds available stock.'
    })
  })

  it('registers only inventory tools on the inventory page', async () => {
    mountWithDeps(InventoryDemo, { attachTo: document.body })
    await flushPromises()

    expect(getRegisteredToolNames()).toEqual([
      'clear_item_selection',
      'select_items',
      'sort_inventory'
    ])
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

async function getCommandInput(
  wrapper: ReturnType<typeof mountWithDeps>
): Promise<WebMCPCommandInputElement> {
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
  return listTools()
    .map(function getToolName(entry) {
      return entry.tool.name
    })
    .sort()
}
