<template>
  <main class="demo-shell">
    <nav class="demo-nav" aria-label="Demo resources">
      <a href="/readme/">README</a>
    </nav>

    <webmcp-command-input
      ref="commandInput"
      class="demo-command-input"
      placeholder="Try: Select all French items"
      @webmcp-command-error="handleCommandError"
      @webmcp-command-plan="handleCommandPlan"
      @webmcp-command-result="handleCommandResult"
    />

    <DemoSemanticInventory
      :items="selectableItems"
      :selected-count="selectedItems.length"
      @clear-selection="clearItemSelection"
      @select-all="selectAllItems"
      @toggle-item="setItemSelected"
    />

    <DemoInvoiceTable
      :active-invoice-id="activeInvoiceId"
      :density="settings.density"
      :filtered-count="visibleInvoices.length"
      :filters="invoiceFilters"
      :invoices="visibleInvoices"
      :selected-count="selectedInvoices.length"
      :sort-direction="invoiceSortDirection"
      :sort-key="invoiceSortKey"
      :total-count="invoices.length"
      @clear-selection="clearInvoiceSelection"
      @mark-selected="markSelectedInvoices"
      @open-invoice="openInvoice"
      @select-visible="selectVisibleInvoices"
      @toggle-invoice="setInvoiceSelected"
      @update:query="invoiceFilters.query = $event"
      @update:sort-direction="invoiceSortDirection = $event"
      @update:sort-key="invoiceSortKey = $event"
      @update:status="invoiceFilters.status = $event"
    />

    <section class="app-panels">
      <DemoSupportTicketPanel
        ref="supportTicketPanel"
        :body="supportBody"
        :subject="supportSubject"
        @submit="submitSupportForm"
        @update:body="supportBody = $event"
        @update:subject="supportSubject = $event"
      />

      <DemoInvoiceDrawer
        :active-invoice="activeInvoice"
        :draft="invoiceDraft"
        @create-invoice="createInvoiceFromDraft"
        @update:draft="updateInvoiceDraft"
      />

      <DemoCartEditor
        v-model:discount-percent="cartDiscountPercent"
        v-model:quantity="cartQuantity"
        v-model:selected-product-id="selectedProductId"
        :cart="cart"
        :products="products"
        :total="cartTotal"
        @add-product="addSelectedProductToCart"
        @checkout="checkoutCartFromUi"
        @remove-line="removeCartLine"
        @update-line="updateCartLineQuantity"
      />
    </section>

    <DemoTicketBoard
      :tickets="tickets"
      @update-ticket-assignee="updateTicketAssignee"
      @update-ticket-priority="updateTicketPriority"
      @update-ticket-status="updateTicketStatus"
    />

    <DemoRuntimeStatus
      ref="runtimeStatusPanel"
      :planner-detail="plannerDetail"
      :planner-name="plannerName"
      :registered-tools-count="registeredTools.length"
      :support-label="supportLabel"
    />
  </main>
</template>

<script setup lang="ts">
import {
  createBestPlanner,
  createConfiguredPlanner,
  defineWebMCPCommandInput,
  defineTool,
  getSupportLabel,
  installWebMCPKitTestBridge,
  invokeTool,
  listTools,
  registerTool,
  registerFormTool,
  setConfirmationHandler,
  type PlannerProviderConfig,
  type PlannerProviderKind,
  type ToolInvocationResult,
  type ToolPlan,
  type ToolPlanner,
  type WebMCPCommandErrorEventDetail,
  type WebMCPCommandInputElement,
  type WebMCPCommandPlanEventDetail,
  type WebMCPCommandResultEventDetail
} from '@webmcp-kit/core'
import { mountDevtoolsOverlay, type DevtoolsOverlay } from '@webmcp-kit/devtools'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import DemoCartEditor from '@/components/DemoCartEditor.vue'
import DemoInvoiceDrawer from '@/components/DemoInvoiceDrawer.vue'
import DemoInvoiceTable from '@/components/DemoInvoiceTable.vue'
import DemoRuntimeStatus from '@/components/DemoRuntimeStatus.vue'
import DemoSemanticInventory from '@/components/DemoSemanticInventory.vue'
import DemoSupportTicketPanel from '@/components/DemoSupportTicketPanel.vue'
import DemoTicketBoard from '@/components/DemoTicketBoard.vue'
import type { CartLine, DemoSettings, Invoice, InvoiceDraft, InvoiceFilters, Product, SelectableItem, SupportTicket } from '@/interfaces/demo'
import {
  getCloudflareBindingModels,
  getInitialDemoSettings,
  getInitialInvoiceDraft,
  getInitialInvoices,
  getInitialSelectableItems,
  getInitialProducts,
  getInitialTickets
} from '@/utils/demo-data'

const showCloudflareBinding = true
const showDevtools = import.meta.env.DEV || import.meta.env.PUBLIC_WEBMCP_PREVIEW === 'true'
const showPlannerControls = import.meta.env.DEV
const shouldInstallTestBridge = import.meta.env.DEV || import.meta.env.MODE === 'test'
const shouldDefaultToCloudflareBinding = showCloudflareBinding && import.meta.env.MODE !== 'test'
const cloudflareBindingModels = getCloudflareBindingModels()
const plannerName = ref('Loading')
const plannerDetail = ref(shouldDefaultToCloudflareBinding ? 'Using the Cloudflare AI binding planner endpoint.' : 'Checking Chrome built-in AI availability.')
const plannerProvider = ref<PlannerProviderKind>(shouldDefaultToCloudflareBinding ? 'cloudflare-binding' : 'auto')
const plannerModel = ref(shouldDefaultToCloudflareBinding ? cloudflareBindingModels[0].id : 'openrouter/auto')
const plannerBaseUrl = ref('')
const plannerEndpoint = ref('/api/webmcp/plan')
const plannerApiKey = ref('')
const plannerAccountId = ref('')
const plannerAuthMode = ref<'server' | 'user-key'>(shouldDefaultToCloudflareBinding ? 'server' : 'user-key')
const lastPlannerUsed = ref('No command has run yet')
const selectedToolName = ref('select_items')
const registeredTools = ref<ReturnType<typeof listTools>>([])
const lastPlan = ref<ToolPlan | null>(null)
const lastResult = ref<ToolInvocationResult | null>(null)
const commandPhase = ref<'idle' | 'preparing' | 'planning' | 'executing' | 'completed' | 'failed'>('idle')
const unregisterCallbacks: Array<() => void> = []
const commandInput = ref<WebMCPCommandInputElement | null>(null)
const supportTicketPanel = ref<{ supportForm: HTMLFormElement | null } | null>(null)
const runtimeStatusPanel = ref<{ devtoolsHost: HTMLElement | null } | null>(null)
const supportSubject = ref('Billing access')
const supportBody = ref('I cannot open the latest invoice from the workspace.')
let devtoolsOverlay: DevtoolsOverlay | undefined
const supportLabel = computed(function getCurrentSupportLabel() {
  return getSupportLabel()
})
const selectedItems = computed(function getSelectedItems() {
  return selectableItems.value.filter(function filterSelectedItem(item) {
    return item.selected
  })
})
const selectedInvoices = computed(function getSelectedInvoices() {
  return invoices.value.filter(function filterSelectedInvoice(invoice) {
    return invoice.selected
  })
})
const visibleInvoices = computed(function getVisibleInvoices() {
  const query = invoiceFilters.value.query.trim().toLowerCase()
  const rows = invoices.value.filter(function filterInvoice(invoice) {
    const matchesStatus = invoiceFilters.value.status === 'all' || invoice.status === invoiceFilters.value.status
    const searchableText = `${invoice.customerName} ${invoice.owner} ${invoice.status} ${invoice.id}`.toLowerCase()
    return matchesStatus && (!query || searchableText.includes(query))
  })

  return [...rows].sort(function sortInvoices(left, right) {
    const direction = invoiceSortDirection.value === 'asc' ? 1 : -1
    const leftValue = left[invoiceSortKey.value]
    const rightValue = right[invoiceSortKey.value]
    if (typeof leftValue === 'number' && typeof rightValue === 'number') return (leftValue - rightValue) * direction
    return String(leftValue).localeCompare(String(rightValue)) * direction
  })
})
const activeInvoice = computed(function getActiveInvoice() {
  return invoices.value.find(function findInvoice(invoice) {
    return invoice.id === activeInvoiceId.value
  })
})
const cartTotal = computed(function getCartTotal() {
  const subtotal = cart.value.reduce(function sumCart(total, line) {
    return total + line.price * line.quantity
  }, 0)
  return Math.round(subtotal * (1 - cartDiscountPercent.value / 100))
})
const usesRemotePlanner = computed(function getUsesRemotePlanner() {
  return plannerProvider.value === 'openrouter'
    || plannerProvider.value === 'openai'
    || plannerProvider.value === 'openai-compatible'
    || plannerProvider.value === 'cloudflare-binding'
    || plannerProvider.value === 'cloudflare-workers-ai'
})
const plannerModelLabel = computed(function getPlannerModelLabel() {
  if (plannerProvider.value === 'cloudflare-binding') {
    return cloudflareBindingModels.find(function findModel(model) {
      return model.id === plannerModel.value
    })?.label ?? plannerModel.value
  }

  if (usesRemotePlanner.value) return plannerModel.value || 'Default model'
  if (plannerProvider.value === 'auto') return 'Best available'
  return 'Provider managed'
})

const selectableItems = ref<SelectableItem[]>(getInitialSelectableItems())
const invoices = ref<Invoice[]>(getInitialInvoices())
const products = ref<Product[]>(getInitialProducts())
const cart = ref<CartLine[]>([])
const tickets = ref<SupportTicket[]>(getInitialTickets())
const invoiceFilters = ref<InvoiceFilters>({
  query: '',
  status: 'all'
})
const invoiceSortKey = ref<'amount' | 'customerName' | 'dueDate' | 'status'>('dueDate')
const invoiceSortDirection = ref<'asc' | 'desc'>('asc')
const activeInvoiceId = ref(invoices.value[0]?.id ?? '')
const invoiceDraft = ref<InvoiceDraft>(getInitialInvoiceDraft())
const selectedProductId = ref(products.value[0]?.id ?? '')
const cartQuantity = ref(1)
const cartDiscountPercent = ref(0)
const settings = ref<DemoSettings>(getInitialDemoSettings())
let currentPlanner: ToolPlanner | undefined

watch(plannerProvider, function handlePlannerProviderChanged(provider) {
  if (provider === 'openrouter') {
    plannerModel.value = 'openrouter/auto'
    plannerAuthMode.value = 'user-key'
  } else if (provider === 'openai') {
    plannerModel.value = 'gpt-4.1-mini'
    plannerAuthMode.value = 'user-key'
  } else if (provider === 'cloudflare-workers-ai') {
    plannerModel.value = '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b'
    plannerAuthMode.value = 'server'
  } else if (provider === 'cloudflare-binding') {
    plannerModel.value = cloudflareBindingModels[0].id
    plannerAuthMode.value = 'server'
    plannerEndpoint.value = '/api/webmcp/plan'
  } else if (provider === 'openai-compatible') {
    plannerModel.value = ''
    plannerAuthMode.value = 'user-key'
  }

  void refreshPlanner().then(configureCommandInput)
})

onMounted(async function handleMounted() {
  defineWebMCPCommandInput()
  setConfirmationHandler(confirmToolInvocation)
  registerDemoTools()
  registerSupportFormTool()
  refreshTools()
  if (shouldInstallTestBridge) {
    unregisterCallbacks.push(installWebMCPKitTestBridge())
  }
  if (showDevtools && runtimeStatusPanel.value?.devtoolsHost) {
    devtoolsOverlay = mountDevtoolsOverlay({
      container: runtimeStatusPanel.value.devtoolsHost,
      initiallyOpen: false,
      placement: 'inline'
    })
  }

  await refreshPlanner()
  configureCommandInput()
})

onUnmounted(function handleUnmounted() {
  for (const unregister of unregisterCallbacks) {
    unregister()
  }
  currentPlanner?.dispose?.()
  devtoolsOverlay?.destroy()
  setConfirmationHandler(undefined)
})

function registerDemoTools() {
  unregisterCallbacks.push(registerTool(defineTool({
    name: 'select_items',
    description: 'Select visible inventory items by stable item IDs.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Stable item IDs to select from the visible inventory.'
        }
      },
      required: ['ids'],
      additionalProperties: false
    },
    execute(input) {
      const ids = Array.isArray(input.ids) ? input.ids.map(String) : []
      selectableItems.value = selectableItems.value.map(function mapItem(item) {
        return {
          ...item,
          selected: ids.includes(item.id)
        }
      })
      return selectedItems.value
    }
  })).unregister)

  unregisterCallbacks.push(registerTool(defineTool({
    name: 'clear_item_selection',
    description: 'Clear the current semantic inventory selection.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false
    },
    execute() {
      clearItemSelection()
      return []
    }
  })).unregister)

  unregisterCallbacks.push(registerTool(defineTool({
    name: 'create_invoice',
    description: 'Create a draft invoice for a customer and add it to the local invoice list.',
    inputSchema: {
      type: 'object',
      properties: {
        customerName: {
          type: 'string',
          description: 'The customer name to invoice.'
        },
        amount: {
          type: 'number',
          minimum: 0.01,
          description: 'The invoice amount in euros.'
        },
        dueDate: {
          type: 'string',
          description: 'The invoice due date as YYYY-MM-DD.'
        },
        owner: {
          type: 'string',
          description: 'The internal owner responsible for the invoice.'
        }
      },
      required: ['customerName', 'amount'],
      additionalProperties: false
    },
    confirmation: {
      required: true,
      reason: 'Creating an invoice changes local business state.'
    },
    execute(input) {
      const invoice = {
        id: `inv_${Date.now()}`,
        customerName: String(input.customerName ?? 'Acme Corp'),
        amount: Number(input.amount ?? 100),
        status: 'draft' as const,
        dueDate: String(input.dueDate ?? invoiceDraft.value.dueDate),
        owner: String(input.owner ?? invoiceDraft.value.owner),
        selected: false
      }
      invoices.value = [invoice, ...invoices.value]
      activeInvoiceId.value = invoice.id
      return invoice
    }
  })).unregister)

  unregisterCallbacks.push(registerTool(defineTool({
    name: 'filter_invoices',
    description: 'Apply visible invoice table filters by status, search query, or minimum amount.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['all', 'draft', 'sent', 'overdue', 'paid', 'void'],
          description: 'Invoice status filter.'
        },
        query: {
          type: 'string',
          description: 'Search text for customer, owner, status, or ID.'
        },
        minAmount: {
          type: 'number',
          description: 'Optional minimum invoice amount to convert into a search selection.'
        }
      },
      additionalProperties: false
    },
    execute(input) {
      invoiceFilters.value = {
        query: String(input.query ?? ''),
        status: isInvoiceStatusFilter(input.status) ? input.status : 'all'
      }

      if (typeof input.minAmount === 'number') {
        const minAmount = input.minAmount
        invoices.value = invoices.value.map(function mapInvoice(invoice) {
          return {
            ...invoice,
            selected: invoice.amount >= minAmount
          }
        })
      }

      return {
        filters: invoiceFilters.value,
        visibleInvoices: visibleInvoices.value
      }
    }
  })).unregister)

  unregisterCallbacks.push(registerTool(defineTool({
    name: 'sort_invoices',
    description: 'Sort the visible invoice table by a supported column.',
    inputSchema: {
      type: 'object',
      properties: {
        sortBy: {
          type: 'string',
          enum: ['amount', 'customerName', 'dueDate', 'status']
        },
        direction: {
          type: 'string',
          enum: ['asc', 'desc']
        }
      },
      required: ['sortBy'],
      additionalProperties: false
    },
    execute(input) {
      invoiceSortKey.value = isInvoiceSortKey(input.sortBy) ? input.sortBy : 'dueDate'
      invoiceSortDirection.value = input.direction === 'desc' ? 'desc' : 'asc'
      return visibleInvoices.value
    }
  })).unregister)

  unregisterCallbacks.push(registerTool(defineTool({
    name: 'select_invoices',
    description: 'Select invoice rows by stable invoice IDs in the visible invoice table.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Stable invoice IDs to select.'
        }
      },
      required: ['ids'],
      additionalProperties: false
    },
    execute(input) {
      const ids = Array.isArray(input.ids) ? input.ids.map(String) : []
      invoices.value = invoices.value.map(function mapInvoice(invoice) {
        return {
          ...invoice,
          selected: ids.includes(invoice.id)
        }
      })
      return selectedInvoices.value
    }
  })).unregister)

  unregisterCallbacks.push(registerTool(defineTool({
    name: 'open_invoice',
    description: 'Open an invoice row in the visible invoice detail drawer.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Stable invoice ID to open.'
        }
      },
      required: ['id'],
      additionalProperties: false
    },
    guard(input) {
      return invoices.value.some(function hasInvoice(invoice) {
        return invoice.id === String(input.id ?? '')
      }) || 'Invoice is not visible in the current workspace.'
    },
    execute(input) {
      activeInvoiceId.value = String(input.id)
      const invoice = activeInvoice.value
      return invoice
    }
  })).unregister)

  unregisterCallbacks.push(registerTool(defineTool({
    name: 'update_selected_invoice_status',
    description: 'Update the status for currently selected invoice rows.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['draft', 'sent', 'overdue', 'paid', 'void']
        }
      },
      required: ['status'],
      additionalProperties: false
    },
    confirmation: {
      required: true,
      reason: 'Changing invoice status mutates business records.'
    },
    guard(input) {
      if (selectedInvoices.value.length === 0) return 'No invoices are selected.'
      return isInvoiceStatus(input.status) || 'Unsupported invoice status.'
    },
    execute(input) {
      const status = input.status as Invoice['status']
      invoices.value = invoices.value.map(function mapInvoice(invoice) {
        if (!invoice.selected) return invoice
        return {
          ...invoice,
          status
        }
      })
      return selectedInvoices.value
    }
  })).unregister)

  unregisterCallbacks.push(registerTool(defineTool({
    name: 'search_products',
    description: 'Search the local product catalog and return matching products for the current shopper.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search words for product name or category.'
        }
      },
      required: ['query'],
      additionalProperties: false
    },
    execute(input) {
      const query = String(input.query ?? '').toLowerCase()
      const tokens = getSearchTokens(query)
      const matches = products.value.filter(function filterProduct(product) {
        const searchableText = `${product.name} ${product.category}`.toLowerCase()
        return tokens.some(function hasToken(token) {
          return searchableText.includes(token)
        })
      })
      return matches
    }
  })).unregister)

  unregisterCallbacks.push(registerTool(defineTool({
    name: 'add_to_cart',
    description: 'Add a known product to the cart for the current shopping session.',
    inputSchema: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          description: 'The product ID to add.'
        },
        quantity: {
          type: 'number',
          minimum: 1,
          description: 'How many units to add.'
        }
      },
      required: ['productId', 'quantity'],
      additionalProperties: false
    },
    guard(input) {
      return products.value.some(function hasProduct(item) {
        return item.id === String(input.productId ?? '')
      }) || 'Product is not available in the current catalog.'
    },
    execute(input) {
      addProductToCart(String(input.productId ?? ''), Number(input.quantity ?? 1))
      const line = cart.value.find(function findLine(item) {
        return item.productId === String(input.productId ?? '')
      })
      return line
    }
  })).unregister)

  unregisterCallbacks.push(registerTool(defineTool({
    name: 'update_cart_quantity',
    description: 'Update the quantity for an existing cart line.',
    inputSchema: {
      type: 'object',
      properties: {
        productId: {
          type: 'string'
        },
        quantity: {
          type: 'number',
          minimum: 1
        }
      },
      required: ['productId', 'quantity'],
      additionalProperties: false
    },
    guard(input) {
      return cart.value.some(function hasLine(line) {
        return line.productId === String(input.productId ?? '')
      }) || 'Cart line does not exist.'
    },
    execute(input) {
      updateCartLineQuantity(String(input.productId), Number(input.quantity ?? 1))
      return cart.value
    }
  })).unregister)

  unregisterCallbacks.push(registerTool(defineTool({
    name: 'remove_from_cart',
    description: 'Remove a product line from the visible cart.',
    inputSchema: {
      type: 'object',
      properties: {
        productId: {
          type: 'string'
        }
      },
      required: ['productId'],
      additionalProperties: false
    },
    confirmation: {
      required: true,
      reason: 'Removing a cart line changes the current order.'
    },
    execute(input) {
      removeCartLine(String(input.productId ?? ''))
      return cart.value
    }
  })).unregister)

  unregisterCallbacks.push(registerTool(defineTool({
    name: 'apply_cart_discount',
    description: 'Set the cart discount percentage control.',
    inputSchema: {
      type: 'object',
      properties: {
        percent: {
          type: 'number',
          minimum: 0,
          maximum: 100
        }
      },
      required: ['percent'],
      additionalProperties: false
    },
    execute(input) {
      cartDiscountPercent.value = Math.max(0, Math.min(100, Number(input.percent ?? 0)))
      return {
        discountPercent: cartDiscountPercent.value,
        total: cartTotal.value
      }
    }
  })).unregister)

  unregisterCallbacks.push(registerTool(defineTool({
    name: 'checkout_cart',
    description: 'Checkout the current cart and clear all cart lines after explicit confirmation.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false
    },
    confirmation: {
      required: true,
      reason: 'Checkout clears the cart and represents a purchase action.'
    },
    guard() {
      return cart.value.length > 0 || 'Cart is empty.'
    },
    execute() {
      const lines = [...cart.value]
      const total = cartTotal.value
      cart.value = []
      return {
        lines,
        total
      }
    }
  })).unregister)

  unregisterCallbacks.push(registerTool(defineTool({
    name: 'update_ticket',
    description: 'Update a support ticket status, assignee, or priority from the visible ticket board.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string'
        },
        status: {
          type: 'string',
          enum: ['new', 'triaged', 'in_progress', 'resolved']
        },
        assignee: {
          type: 'string'
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'urgent']
        }
      },
      required: ['id'],
      additionalProperties: false
    },
    guard(input) {
      return tickets.value.some(function hasTicket(ticket) {
        return ticket.id === String(input.id ?? '')
      }) || 'Ticket is not visible in the current board.'
    },
    execute(input) {
      tickets.value = tickets.value.map(function mapTicket(ticket) {
        if (ticket.id !== String(input.id)) return ticket
        return {
          ...ticket,
          assignee: typeof input.assignee === 'string' ? input.assignee : ticket.assignee,
          priority: isTicketPriority(input.priority) ? input.priority : ticket.priority,
          status: isTicketStatus(input.status) ? input.status : ticket.status
        }
      })
      return tickets.value.find(function findTicket(ticket) {
        return ticket.id === String(input.id)
      })
    }
  })).unregister)

}

function registerSupportFormTool() {
  const form = supportTicketPanel.value?.supportForm
  if (!form) return

  unregisterCallbacks.push(registerFormTool({
    form,
    name: 'create_support_ticket',
    description: 'Create a support ticket from the visible support form and mark it as open for triage.',
    execute(input) {
      return createSupportTicket(String(input.subject ?? 'Support request'), String(input.body ?? ''))
    }
  }).unregister)
}

function setItemSelected(id: string, selected: boolean) {
  selectableItems.value = selectableItems.value.map(function mapItem(item) {
    if (item.id !== id) return item
    return {
      ...item,
      selected
    }
  })
}

function selectAllItems() {
  selectableItems.value = selectableItems.value.map(function mapItem(item) {
    return {
      ...item,
      selected: true
    }
  })
}

function clearItemSelection() {
  selectableItems.value = selectableItems.value.map(function mapItem(item) {
    return {
      ...item,
      selected: false
    }
  })
}

function setInvoiceSelected(id: string, selected: boolean) {
  invoices.value = invoices.value.map(function mapInvoice(invoice) {
    if (invoice.id !== id) return invoice
    return {
      ...invoice,
      selected
    }
  })
}

function selectVisibleInvoices() {
  const visibleIds = new Set(visibleInvoices.value.map(function mapInvoiceId(invoice) {
    return invoice.id
  }))
  invoices.value = invoices.value.map(function mapInvoice(invoice) {
    return {
      ...invoice,
      selected: visibleIds.has(invoice.id)
    }
  })
}

function clearInvoiceSelection() {
  invoices.value = invoices.value.map(function mapInvoice(invoice) {
    return {
      ...invoice,
      selected: false
    }
  })
}

function markSelectedInvoices(status: Invoice['status']) {
  invoices.value = invoices.value.map(function mapInvoice(invoice) {
    if (!invoice.selected) return invoice
    return {
      ...invoice,
      status
    }
  })
}

function openInvoice(id: string) {
  activeInvoiceId.value = id
}

function updateInvoiceDraft(draft: Partial<InvoiceDraft>) {
  invoiceDraft.value = {
    ...invoiceDraft.value,
    ...draft
  }
}

function createInvoiceFromDraft() {
  const invoice = {
    id: `inv_${Date.now()}`,
    amount: invoiceDraft.value.amount,
    customerName: invoiceDraft.value.customerName,
    dueDate: invoiceDraft.value.dueDate,
    owner: invoiceDraft.value.owner,
    selected: false,
    status: invoiceDraft.value.status
  }
  invoices.value = [invoice, ...invoices.value]
  activeInvoiceId.value = invoice.id
}

function addSelectedProductToCart() {
  addProductToCart(selectedProductId.value, cartQuantity.value)
}

function addProductToCart(productId: string, quantity: number) {
  const product = products.value.find(function findProduct(item) {
    return item.id === productId
  })
  if (!product) return

  cart.value = [
    {
      productId: product.id,
      name: product.name,
      quantity,
      price: product.price
    },
    ...cart.value.filter(function removeExisting(existing) {
      return existing.productId !== product.id
    })
  ]
}

function updateCartLineQuantity(productId: string, quantity: number) {
  cart.value = cart.value.map(function mapLine(line) {
    if (line.productId !== productId) return line
    return {
      ...line,
      quantity: Math.max(1, quantity)
    }
  })
}

function removeCartLine(productId: string) {
  cart.value = cart.value.filter(function keepLine(line) {
    return line.productId !== productId
  })
}

async function checkoutCartFromUi() {
  const result = await invokeTool({
    toolName: 'checkout_cart',
    input: {}
  })
  lastResult.value = result
}

function updateTicketStatus(id: string, status: SupportTicket['status']) {
  tickets.value = tickets.value.map(function mapTicket(ticket) {
    if (ticket.id !== id) return ticket
    return {
      ...ticket,
      status
    }
  })
}

function updateTicketAssignee(id: string, assignee: string) {
  tickets.value = tickets.value.map(function mapTicket(ticket) {
    if (ticket.id !== id) return ticket
    return {
      ...ticket,
      assignee
    }
  })
}

function updateTicketPriority(id: string, priority: SupportTicket['priority']) {
  tickets.value = tickets.value.map(function mapTicket(ticket) {
    if (ticket.id !== id) return ticket
    return {
      ...ticket,
      priority
    }
  })
}

function configureCommandInput() {
  if (showPlannerControls) {
    commandInput.value?.configure({
      context: getPlannerContext,
      endpoint: plannerEndpoint.value
    })
    return
  }

  commandInput.value?.configure({
    context: getPlannerContext,
    endpoint: plannerEndpoint.value,
    model: plannerModel.value,
    planner: currentPlanner,
    provider: plannerProvider.value
  })
}

function handleCommandPlan(event: Event) {
  const detail = (event as CustomEvent<WebMCPCommandPlanEventDetail>).detail
  lastPlan.value = detail.plan
  lastResult.value = null
  lastPlannerUsed.value = `${detail.planner.name} (${detail.planner.status})`
  selectedToolName.value = detail.plan.toolName
  commandPhase.value = 'executing'
}

function handleCommandResult(event: Event) {
  const detail = (event as CustomEvent<WebMCPCommandResultEventDetail>).detail
  lastPlan.value = detail.plan
  lastResult.value = detail.result
  selectedToolName.value = detail.result.toolName
  commandPhase.value = detail.result.status === 'success' ? 'completed' : 'failed'
}

function handleCommandError(event: Event) {
  const detail = (event as CustomEvent<WebMCPCommandErrorEventDetail>).detail
  lastPlan.value = null
  selectedToolName.value = 'Planner'
  lastResult.value = {
    toolName: 'Planner',
    status: 'error',
    error: detail.error,
    durationMs: 0
  }
  commandPhase.value = 'failed'
}

function confirmToolInvocation(tool: { name: string }, input: unknown, reason: string): boolean {
  if (!settings.value.confirmationsEnabled) return true
  return window.confirm(`${reason}\n\n${JSON.stringify(input, null, 2)}`)
}

async function submitSupportForm() {
  selectedToolName.value = 'create_support_ticket'
  lastPlan.value = null
  lastPlannerUsed.value = 'Manual form'
  const result = await invokeTool({
    toolName: 'create_support_ticket',
    input: {
      subject: supportSubject.value,
      body: supportBody.value
    }
  })
  lastResult.value = result

}

function refreshTools() {
  registeredTools.value = listTools()
}

async function refreshPlanner() {
  const plannerConfig = getSelectedPlannerConfig()
  currentPlanner?.dispose?.()
  const planner = plannerConfig ? await createConfiguredPlanner(plannerConfig) : await createBestPlanner()
  currentPlanner = planner
  plannerName.value = `${planner.name} (${planner.status})`
  plannerDetail.value = planner.detail
  window.__webMCPKitDemoPlanner = planner

  return planner
}

function getSelectedPlannerConfig(): PlannerProviderConfig | undefined {
  if (plannerProvider.value === 'auto') return undefined

  if (plannerProvider.value === 'chrome-built-in' || plannerProvider.value === 'local') {
    return {
      provider: plannerProvider.value,
      auth: {
        mode: 'none'
      }
    }
  }

  if (plannerProvider.value === 'cloudflare-binding') {
    return {
      provider: plannerProvider.value,
      model: plannerModel.value || cloudflareBindingModels[0].id,
      auth: {
        mode: 'server',
        endpoint: plannerEndpoint.value
      }
    }
  }

  return {
    provider: plannerProvider.value,
    model: plannerModel.value || undefined,
    baseUrl: plannerBaseUrl.value || undefined,
    accountId: plannerAccountId.value || undefined,
    auth: plannerAuthMode.value === 'server'
      ? {
          mode: 'server',
          endpoint: plannerEndpoint.value
        }
      : {
          mode: 'user-key',
          apiKey: plannerApiKey.value || undefined
        }
  }
}

function getPlannerContext() {
  return {
    checklistItems: selectableItems.value.map(function mapChecklistItem(item, index) {
      return {
        id: item.id,
        name: item.name,
        position: index + 1,
        selected: item.selected
      }
    }),
    products: products.value,
    invoices: invoices.value,
    invoiceFilters: invoiceFilters.value,
    visibleInvoices: visibleInvoices.value,
    selectedInvoices: selectedInvoices.value,
    cart: cart.value,
    tickets: tickets.value,
    settings: settings.value
  }
}

function createSupportTicket(subject: string, body: string): SupportTicket {
  const ticket = {
    id: `ticket_${Date.now()}`,
    subject,
    body,
    status: 'new' as const,
    priority: 'medium' as const,
    assignee: 'Unassigned'
  }
  tickets.value = [ticket, ...tickets.value]
  return ticket
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Planner failed'
}

function getSearchTokens(query: string): string[] {
  const tokens = query
    .split(/\W+/)
    .filter(function keepSearchToken(token) {
      return token.length > 2 && !['find', 'for', 'the', 'products', 'product'].includes(token)
    })

  return tokens.length > 0 ? tokens : [query]
}

function isInvoiceStatus(value: unknown): value is Invoice['status'] {
  return value === 'draft' || value === 'sent' || value === 'overdue' || value === 'paid' || value === 'void'
}

function isInvoiceStatusFilter(value: unknown): value is InvoiceFilters['status'] {
  return value === 'all' || isInvoiceStatus(value)
}

function isInvoiceSortKey(value: unknown): value is 'amount' | 'customerName' | 'dueDate' | 'status' {
  return value === 'amount' || value === 'customerName' || value === 'dueDate' || value === 'status'
}

function isTicketStatus(value: unknown): value is SupportTicket['status'] {
  return value === 'new' || value === 'triaged' || value === 'in_progress' || value === 'resolved'
}

function isTicketPriority(value: unknown): value is SupportTicket['priority'] {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'urgent'
}

declare global {
  interface Window {
    __webMCPKitDemoPlanner?: {
      name: ToolPlanner['name']
      available: ToolPlanner['available']
      status: ToolPlanner['status']
      detail: ToolPlanner['detail']
      plan: (message: string, tools: ReturnType<typeof listTools>[number]['tool'][], context?: ReturnType<typeof getPlannerContext>) => Promise<ToolPlan>
    }
  }
}
</script>

<style scoped>
.demo-shell {
  width: min(1440px, calc(100% - 32px));
  margin: 0 auto;
  padding: 8px 0 80px;
}

.demo-nav {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}

.demo-nav a {
  border: 1px solid rgba(244, 240, 232, 0.18);
  padding: 6px 10px;
  color: #c9d1cb;
  font-size: 0.78rem;
  font-weight: 900;
  text-decoration: none;
  text-transform: uppercase;
}

.demo-nav a:hover,
.demo-nav a:focus-visible {
  border-color: #e8be53;
  color: #e8be53;
}

.demo-command-input {
  position: sticky;
  top: 10px;
  z-index: 1000;
  display: block;
  width: min(920px, 100%);
  margin: 0 auto 12px;
}

.app-panels {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: start;
  margin-top: 16px;
  margin-bottom: 16px;
}

.app-panels > * {
  flex: 1 1 340px;
}

@media (max-width: 620px) {
  .demo-shell {
    width: min(100% - 20px, 1440px);
    padding-top: 12px;
    padding-bottom: 36px;
  }
}
</style>
