<template>
  <main class="demo-shell">
    <DemoCommandPalette
      :cloudflare-binding-models="cloudflareBindingModels"
      :command-button-label="commandButtonLabel"
      :affected-rows="affectedRows"
      :affected-state-empty="affectedStateEmpty"
      :is-command-running="isCommandRunning"
      :outcome-tone="outcomeTone"
      :outcome-detail="outcomeDetail"
      :outcome-label="outcomeLabel"
      :outcome-title="outcomeTitle"
      :planner-model="plannerModel"
      :planner-model-label="plannerModelLabel"
      :planner-name="plannerName"
      :planner-provider="plannerProvider"
      :selected-tool-name="activeToolName"
      :prompt="prompt"
      :show-cloudflare-binding="showCloudflareBinding"
      :uses-remote-planner="usesRemotePlanner"
      @run="runPrompt"
      @update:planner-model="plannerModel = $event"
      @update:planner-provider="plannerProvider = $event"
      @update:prompt="prompt = $event"
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

    <DemoRuntimeStatus
      :planner-detail="plannerDetail"
      :planner-name="plannerName"
      :registered-tools-count="registeredTools.length"
      :support-label="supportLabel"
    />

    <section class="tool-surface">
      <DemoSupportTicketPanel
        ref="supportTicketPanel"
        :body="supportBody"
        :subject="supportSubject"
        @submit="submitSupportForm"
        @update:body="supportBody = $event"
        @update:subject="supportSubject = $event"
      />

      <DemoActivityPanel ref="activityPanel" :activity="activity" />
    </section>

    <section class="operations-grid">
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

      <DemoSettingsPanel :settings="settings" @update:settings="updateSettings" />
    </section>

    <DemoTicketBoard
      :tickets="tickets"
      @update-ticket-assignee="updateTicketAssignee"
      @update-ticket-priority="updateTicketPriority"
      @update-ticket-status="updateTicketStatus"
    />
  </main>
</template>

<script setup lang="ts">
import {
  createBestPlanner,
  createConfiguredPlanner,
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
  type ToolPlanner
} from '@webmcp-kit/core'
import { mountDevtoolsOverlay, type DevtoolsOverlay } from '@webmcp-kit/devtools'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import DemoActivityPanel from '@/components/DemoActivityPanel.vue'
import DemoCartEditor from '@/components/DemoCartEditor.vue'
import DemoCommandPalette from '@/components/DemoCommandPalette.vue'
import DemoInvoiceDrawer from '@/components/DemoInvoiceDrawer.vue'
import DemoInvoiceTable from '@/components/DemoInvoiceTable.vue'
import DemoRuntimeStatus from '@/components/DemoRuntimeStatus.vue'
import DemoSettingsPanel from '@/components/DemoSettingsPanel.vue'
import DemoSupportTicketPanel from '@/components/DemoSupportTicketPanel.vue'
import DemoTicketBoard from '@/components/DemoTicketBoard.vue'
import type { ActivityItem, CartLine, DemoSettings, Invoice, InvoiceDraft, InvoiceFilters, OutcomeRow, Product, SupportTicket } from '@/interfaces/demo'
import {
  getCloudflareBindingModels,
  getInitialActivity,
  getInitialDemoSettings,
  getInitialInvoiceDraft,
  getInitialInvoices,
  getInitialProducts,
  getInitialTickets
} from '@/utils/demo-data'

const showCloudflareBinding = import.meta.env.DEV || import.meta.env.PUBLIC_WEBMCP_PREVIEW === 'true'
const showDevtools = import.meta.env.DEV || import.meta.env.PUBLIC_WEBMCP_PREVIEW === 'true'
const shouldDefaultToCloudflareBinding = showCloudflareBinding && import.meta.env.MODE !== 'test'
const cloudflareBindingModels = getCloudflareBindingModels()
const prompt = ref('Select overdue invoices')
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
const selectedToolName = ref('select_invoices')
const registeredTools = ref<ReturnType<typeof listTools>>([])
const lastPlan = ref<ToolPlan | null>(null)
const lastResult = ref<ToolInvocationResult | null>(null)
const commandPhase = ref<'idle' | 'preparing' | 'planning' | 'executing' | 'completed' | 'failed'>('idle')
const unregisterCallbacks: Array<() => void> = []
const supportTicketPanel = ref<{ supportForm: HTMLFormElement | null } | null>(null)
const activityPanel = ref<{ devtoolsHost: HTMLElement | null } | null>(null)
const supportSubject = ref('Billing access')
const supportBody = ref('I cannot open the latest invoice from the workspace.')
let devtoolsOverlay: DevtoolsOverlay | undefined
const supportLabel = computed(function getCurrentSupportLabel() {
  return getSupportLabel()
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
const activeToolName = computed(function getActiveToolName() {
  return lastPlan.value?.toolName ?? selectedToolName.value
})
const isCommandRunning = computed(function getIsCommandRunning() {
  return commandPhase.value === 'preparing'
    || commandPhase.value === 'planning'
    || commandPhase.value === 'executing'
})
const commandButtonLabel = computed(function getCommandButtonLabel() {
  if (commandPhase.value === 'preparing') return 'Preparing...'
  if (commandPhase.value === 'planning') return 'Planning...'
  if (commandPhase.value === 'executing') return 'Running...'
  return 'Run'
})
const outcomeTone = computed(function getOutcomeTone() {
  if (isCommandRunning.value) return 'running'
  if (!lastResult.value) return 'idle'
  return lastResult.value.status
})
const outcomeLabel = computed(function getOutcomeLabel() {
  if (commandPhase.value === 'preparing') return 'Preparing'
  if (commandPhase.value === 'planning') return 'Planning'
  if (commandPhase.value === 'executing') return 'Executing'
  if (!lastResult.value) return 'Ready'
  return lastResult.value.status
})
const outcomeTitle = computed(function getOutcomeTitle() {
  if (commandPhase.value === 'preparing') return 'Collecting tools and app context'
  if (commandPhase.value === 'planning') return 'Provider is choosing the tool'
  if (commandPhase.value === 'executing') return `${selectedToolName.value} is running`
  if (!lastResult.value) return 'Run a command to see the app change'
  if (lastResult.value.status === 'success') return getToolSuccessTitle(lastResult.value.toolName)
  if (lastResult.value.status === 'blocked') return `${getToolDisplayName(lastResult.value.toolName)} was blocked`
  if (lastResult.value.status === 'unavailable') return `${getToolDisplayName(lastResult.value.toolName)} is unavailable`

  return `${getToolDisplayName(lastResult.value.toolName)} failed`
})
const outcomeDetail = computed(function getOutcomeDetail() {
  if (commandPhase.value === 'preparing') return 'The demo is reading the registered tools and visible app state before planning.'
  if (commandPhase.value === 'planning') return `${lastPlannerUsed.value} is turning the command into a tool call.`
  if (commandPhase.value === 'executing') return `Running ${selectedToolName.value} with the planned input.`
  if (!lastResult.value) return 'The selected tool, generated input, confirmation status, and affected state will stay visible here.'
  if (lastResult.value.error) return lastResult.value.error

  return `Completed in ${lastResult.value.durationMs}ms.`
})
const affectedStateEmpty = computed(function getAffectedStateEmpty() {
  if (!lastResult.value) return 'Nothing has run yet.'
  if (lastResult.value.status !== 'success') return 'No state changed.'
  if (activeToolName.value === 'checkout_cart') return 'Checkout completed with no cart lines.'

  return 'No matching state is visible yet.'
})
const affectedRows = computed(function getAffectedRows(): OutcomeRow[] {
  if (!lastResult.value) return []

  if (activeToolName.value === 'search_products') {
    return getProductRows(Array.isArray(lastResult.value.output) ? lastResult.value.output : [])
  }

  if (activeToolName.value === 'filter_invoices' || activeToolName.value === 'sort_invoices') {
    return visibleInvoices.value.slice(0, 4).map(function mapInvoice(invoice) {
      return {
        id: invoice.id,
        title: invoice.customerName,
        value: `€${invoice.amount}`,
        meta: `${invoice.status} · ${invoice.dueDate}`
      }
    })
  }

  if (activeToolName.value === 'select_invoices' || activeToolName.value === 'update_selected_invoice_status') {
    return selectedInvoices.value.slice(0, 4).map(function mapInvoice(invoice) {
      return {
        id: invoice.id,
        title: invoice.customerName,
        value: `€${invoice.amount}`,
        meta: invoice.status
      }
    })
  }

  if (activeToolName.value === 'create_invoice') {
    return invoices.value.slice(0, 3).map(function mapInvoice(invoice) {
      return {
        id: invoice.id,
        title: invoice.customerName,
        value: `€${invoice.amount}`,
        meta: invoice.status
      }
    })
  }

  if (activeToolName.value === 'add_to_cart') {
    return getCartRows(cart.value)
  }

  if (activeToolName.value === 'update_cart_quantity' || activeToolName.value === 'remove_from_cart' || activeToolName.value === 'apply_cart_discount') {
    return getCartRows(cart.value)
  }

  if (activeToolName.value === 'update_ticket') {
    return tickets.value.slice(0, 3).map(function mapTicket(ticket) {
      return {
        id: ticket.id,
        title: ticket.subject,
        value: ticket.status,
        meta: `${ticket.priority} · ${ticket.assignee}`
      }
    })
  }

  if (activeToolName.value === 'update_demo_settings') {
    return [
      {
        id: 'settings',
        title: settings.value.confirmationsEnabled ? 'Confirmations enabled' : 'Confirmations disabled',
        value: settings.value.density,
        meta: `${settings.value.plannerConfidence}% threshold`
      }
    ]
  }

  if (activeToolName.value === 'checkout_cart') {
    return getCartRows(getCheckoutLines(lastResult.value.output))
  }

  if (activeToolName.value === 'create_support_ticket') {
    return tickets.value.slice(0, 3).map(function mapTicket(ticket) {
      return {
        id: ticket.id,
        title: ticket.subject,
        value: ticket.status,
        meta: ticket.body
      }
    })
  }

  return activity.value.slice(0, 3).map(function mapActivity(item) {
    return {
      id: item.id,
      title: item.title,
      value: item.tone,
      meta: item.detail
    }
  })
})

const invoices = ref<Invoice[]>(getInitialInvoices())
const products = ref<Product[]>(getInitialProducts())
const cart = ref<CartLine[]>([])
const tickets = ref<SupportTicket[]>(getInitialTickets())
const activity = ref<ActivityItem[]>(getInitialActivity())
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

  void refreshPlanner()
})

onMounted(async function handleMounted() {
  setConfirmationHandler(confirmToolInvocation)
  registerDemoTools()
  registerSupportFormTool()
  refreshTools()
  unregisterCallbacks.push(installWebMCPKitTestBridge())
  if (showDevtools && activityPanel.value?.devtoolsHost) {
    devtoolsOverlay = mountDevtoolsOverlay({
      container: activityPanel.value.devtoolsHost,
      initiallyOpen: false,
      placement: 'inline'
    })
  }

  await refreshPlanner()
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
      addActivity('Invoice created', `${invoice.customerName} for €${invoice.amount}`, 'success')
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

      addActivity('Invoices filtered', `${visibleInvoices.value.length} invoices visible`, 'info')
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
      addActivity('Invoices sorted', `${invoiceSortKey.value} ${invoiceSortDirection.value}`, 'info')
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
      addActivity('Invoices selected', `${selectedInvoices.value.length} invoice rows selected`, 'success')
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
      addActivity('Invoice opened', invoice?.customerName ?? activeInvoiceId.value, 'info')
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
      addActivity('Invoice status updated', `${selectedInvoices.value.length} invoices marked ${status}`, 'success')
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
      addActivity('Products searched', `${matches.length} matches for "${query}"`, 'info')
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
      addActivity('Cart updated', `${line?.name ?? input.productId} added`, 'success')
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
      addActivity('Cart quantity changed', `${input.productId} set to ${input.quantity}`, 'success')
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
      addActivity('Cart line removed', String(input.productId ?? ''), 'info')
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
      addActivity('Cart discount applied', `${cartDiscountPercent.value}%`, 'success')
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
      addActivity('Checkout completed', `${lines.length} lines for €${total}`, 'success')

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
      addActivity('Ticket updated', String(input.id), 'success')
      return tickets.value.find(function findTicket(ticket) {
        return ticket.id === String(input.id)
      })
    }
  })).unregister)

  unregisterCallbacks.push(registerTool(defineTool({
    name: 'update_demo_settings',
    description: 'Update visible assistant behavior settings such as confirmations, density, notifications, and confidence threshold.',
    inputSchema: {
      type: 'object',
      properties: {
        confirmationsEnabled: {
          type: 'boolean'
        },
        density: {
          type: 'string',
          enum: ['comfortable', 'compact']
        },
        notificationsEnabled: {
          type: 'boolean'
        },
        plannerConfidence: {
          type: 'number',
          minimum: 0,
          maximum: 100
        }
      },
      additionalProperties: false
    },
    execute(input) {
      updateSettings({
        confirmationsEnabled: typeof input.confirmationsEnabled === 'boolean' ? input.confirmationsEnabled : undefined,
        density: input.density === 'comfortable' || input.density === 'compact' ? input.density : undefined,
        notificationsEnabled: typeof input.notificationsEnabled === 'boolean' ? input.notificationsEnabled : undefined,
        plannerConfidence: typeof input.plannerConfidence === 'number' ? input.plannerConfidence : undefined
      })
      addActivity('Settings updated', `${settings.value.density}, confirmations ${settings.value.confirmationsEnabled ? 'on' : 'off'}`, 'success')
      return settings.value
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
  addActivity('Invoice status updated', `${selectedInvoices.value.length} invoices marked ${status}`, 'success')
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
  addActivity('Invoice created', `${invoice.customerName} for €${invoice.amount}`, 'success')
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

function updateSettings(nextSettings: Partial<DemoSettings>) {
  settings.value = {
    ...settings.value,
    ...Object.fromEntries(Object.entries(nextSettings).filter(function keepDefinedValue([, value]) {
      return value !== undefined
    }))
  }
}

async function runPrompt() {
  if (isCommandRunning.value) return

  commandPhase.value = 'preparing'
  lastPlan.value = null
  lastResult.value = null
  selectedToolName.value = 'Planning'
  const planner = await getCurrentPlanner()
  if (!planner) {
    commandPhase.value = 'failed'
    lastResult.value = {
      toolName: 'Planner',
      status: 'error',
      error: 'No planner is available.',
      durationMs: 0
    }
    return
  }

  const tools = listTools().map(function mapRegistration(registration) {
    return registration.tool
  })
  lastPlannerUsed.value = `${planner.name} (${planner.status})`
  commandPhase.value = 'planning'
  let plan: ToolPlan
  try {
    plan = await planner.plan(prompt.value, tools, getPlannerContext())
  } catch (error) {
    const errorMessage = getErrorMessage(error)
    lastPlan.value = null
    selectedToolName.value = planner.name
    lastResult.value = {
      toolName: planner.name,
      status: 'error',
      error: errorMessage,
      durationMs: 0
    }
    commandPhase.value = 'failed'
    addActivity('Planning failed', errorMessage, 'warning')
    return
  }
  lastPlan.value = plan
  selectedToolName.value = plan.toolName
  commandPhase.value = 'executing'

  const result = await invokeTool({
    toolName: plan.toolName,
    input: plan.input,
    source: 'planner'
  })
  lastResult.value = result
  commandPhase.value = result.status === 'success' ? 'completed' : 'failed'

  if (result.status !== 'success') {
    addActivity('Command blocked', result.error ?? 'The selected tool could not run.', 'warning')
  }
}

function confirmToolInvocation(tool: { name: string }, input: unknown, reason: string): boolean {
  if (!settings.value.confirmationsEnabled) return true
  addActivity('Confirmation requested', `${tool.name}: ${reason}`, 'warning')
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

  if (result.status !== 'success') {
    addActivity('Ticket blocked', result.error ?? 'The ticket form could not run.', 'warning')
  }
}

function refreshTools() {
  registeredTools.value = listTools()
}

async function getCurrentPlanner() {
  return refreshPlanner()
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

function getToolDisplayName(toolName: string): string {
  if (toolName === 'filter_invoices') return 'Invoice table'
  if (toolName === 'sort_invoices') return 'Invoice table'
  if (toolName === 'select_invoices') return 'Invoice selection'
  if (toolName === 'open_invoice') return 'Invoice drawer'
  if (toolName === 'update_selected_invoice_status') return 'Invoice status'
  if (toolName === 'search_products') return 'Product search'
  if (toolName === 'create_invoice') return 'Invoice'
  if (toolName === 'add_to_cart') return 'Cart'
  if (toolName === 'update_cart_quantity') return 'Cart'
  if (toolName === 'remove_from_cart') return 'Cart'
  if (toolName === 'apply_cart_discount') return 'Cart'
  if (toolName === 'checkout_cart') return 'Checkout'
  if (toolName === 'update_ticket') return 'Ticket board'
  if (toolName === 'update_demo_settings') return 'Settings'
  if (toolName === 'create_support_ticket') return 'Support ticket'
  return toolName
}

function getToolSuccessTitle(toolName: string): string {
  if (toolName === 'filter_invoices') return 'Invoice table filtered'
  if (toolName === 'sort_invoices') return 'Invoice table sorted'
  if (toolName === 'select_invoices') return 'Invoices selected'
  if (toolName === 'open_invoice') return 'Invoice opened'
  if (toolName === 'update_selected_invoice_status') return 'Invoice status updated'
  if (toolName === 'search_products') return 'Product search completed'
  if (toolName === 'create_invoice') return 'Invoice created'
  if (toolName === 'add_to_cart') return 'Cart updated'
  if (toolName === 'update_cart_quantity') return 'Cart quantity updated'
  if (toolName === 'remove_from_cart') return 'Cart line removed'
  if (toolName === 'apply_cart_discount') return 'Cart discount applied'
  if (toolName === 'checkout_cart') return 'Checkout completed'
  if (toolName === 'update_ticket') return 'Ticket updated'
  if (toolName === 'update_demo_settings') return 'Settings updated'
  if (toolName === 'create_support_ticket') return 'Support ticket created'
  return `${toolName} completed`
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
  addActivity('Ticket opened', ticket.subject, 'success')
  return ticket
}

function addActivity(title: string, detail: string, tone: ActivityItem['tone']) {
  activity.value = [
    {
      id: `activity_${Date.now()}`,
      title,
      detail,
      tone
    },
    ...activity.value
  ].slice(0, 6)
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Planner failed'
}

function getProductRows(value: unknown[]): OutcomeRow[] {
  return value.filter(isProduct).map(function mapProduct(product) {
    return {
      id: product.id,
      title: product.name,
      value: `€${product.price}`,
      meta: product.category
    }
  })
}

function getSearchTokens(query: string): string[] {
  const tokens = query
    .split(/\W+/)
    .filter(function keepSearchToken(token) {
      return token.length > 2 && !['find', 'for', 'the', 'products', 'product'].includes(token)
    })

  return tokens.length > 0 ? tokens : [query]
}

function getCartRows(lines: CartLine[]): OutcomeRow[] {
  return lines.map(function mapCartLine(line) {
    return {
      id: line.productId,
      title: line.name,
      value: `${line.quantity}x`,
      meta: `€${line.price}`
    }
  })
}

function getCheckoutLines(output: unknown): CartLine[] {
  if (!output || typeof output !== 'object' || !('lines' in output) || !Array.isArray(output.lines)) {
    return []
  }

  return output.lines.filter(isCartLine)
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

function isProduct(value: unknown): value is Product {
  return !!value
    && typeof value === 'object'
    && 'id' in value
    && 'name' in value
    && 'category' in value
    && 'price' in value
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.category === 'string'
    && typeof value.price === 'number'
}

function isCartLine(value: unknown): value is CartLine {
  return !!value
    && typeof value === 'object'
    && 'productId' in value
    && 'name' in value
    && 'quantity' in value
    && 'price' in value
    && typeof value.productId === 'string'
    && typeof value.name === 'string'
    && typeof value.quantity === 'number'
    && typeof value.price === 'number'
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

.tool-surface {
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(360px, 1.05fr);
  gap: 16px;
  align-items: start;
  margin-top: 16px;
}

.operations-grid {
  display: grid;
  grid-template-columns: minmax(280px, 0.85fr) minmax(360px, 1.15fr) minmax(260px, 0.7fr);
  gap: 16px;
  align-items: start;
  margin-top: 16px;
}

@media (max-width: 980px) {
  .tool-surface,
  .operations-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 620px) {
  .demo-shell {
    width: min(100% - 20px, 1440px);
    padding-top: 12px;
    padding-bottom: 36px;
  }
}
</style>
