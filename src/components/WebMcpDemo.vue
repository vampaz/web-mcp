<template>
  <main class="demo-shell">
    <DemoCommandPalette
      :cloudflare-binding-models="cloudflareBindingModels"
      :command-button-label="commandButtonLabel"
      :is-command-running="isCommandRunning"
      :outcome-tone="outcomeTone"
      :planner-model="plannerModel"
      :planner-model-label="plannerModelLabel"
      :planner-name="plannerName"
      :planner-provider="plannerProvider"
      :prompt="prompt"
      :show-cloudflare-binding="showCloudflareBinding"
      :uses-remote-planner="usesRemotePlanner"
      @run="runPrompt"
      @update:planner-model="plannerModel = $event"
      @update:planner-provider="plannerProvider = $event"
      @update:prompt="prompt = $event"
    />

    <DemoSelectionPanel
      :has-result="!!lastResult"
      :is-command-running="isCommandRunning"
      :items="selectableItems"
      :outcome-label="outcomeLabel"
      :outcome-tone="outcomeTone"
      :result-detail="outcomeDetail"
      :result-summary="affectedRows[0]?.title || affectedStateEmpty"
      :result-title="outcomeTitle"
      :selected-count="selectedItems.length"
      @set-item-selected="setItemSelected"
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

    <DemoStateGrid :cart="cart" :invoices="invoices" :products="products" :tickets="tickets" />
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
import DemoCommandPalette from '@/components/DemoCommandPalette.vue'
import DemoRuntimeStatus from '@/components/DemoRuntimeStatus.vue'
import DemoSelectionPanel from '@/components/DemoSelectionPanel.vue'
import DemoStateGrid from '@/components/DemoStateGrid.vue'
import DemoSupportTicketPanel from '@/components/DemoSupportTicketPanel.vue'
import type { ActivityItem, CartLine, Invoice, OutcomeRow, Product, SelectableItem, SupportTicket } from '@/interfaces/demo'
import {
  getCloudflareBindingModels,
  getInitialActivity,
  getInitialInvoices,
  getInitialProducts,
  getInitialSelectableItems
} from '@/utils/demo-data'

const showCloudflareBinding = import.meta.env.DEV || import.meta.env.PUBLIC_WEBMCP_PREVIEW === 'true'
const showDevtools = import.meta.env.DEV || import.meta.env.PUBLIC_WEBMCP_PREVIEW === 'true'
const shouldDefaultToCloudflareBinding = showCloudflareBinding && import.meta.env.MODE !== 'test'
const cloudflareBindingModels = getCloudflareBindingModels()
const prompt = ref(shouldDefaultToCloudflareBinding ? 'Select all pantry items' : 'Select the first five items')
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
const supportTicketPanel = ref<{ supportForm: HTMLFormElement | null } | null>(null)
const activityPanel = ref<{ devtoolsHost: HTMLElement | null } | null>(null)
const supportSubject = ref('Billing access')
const supportBody = ref('I cannot open the latest invoice from the workspace.')
let devtoolsOverlay: DevtoolsOverlay | undefined
const supportLabel = computed(function getCurrentSupportLabel() {
  return getSupportLabel()
})
const selectedItems = computed(function getSelectedItems() {
  return selectableItems.value.filter(function filterSelected(item) {
    return item.selected
  })
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

  if (activeToolName.value === 'select_items' || activeToolName.value === 'clear_item_selection') {
    if (selectedItems.value.length === 0) return []

    return [
      {
        id: 'selected-items',
        title: selectedItems.value.map(function mapSelectedName(item) {
          return item.name
        }).join(', '),
        value: `${selectedItems.value.length} selected`,
        meta: ''
      }
    ]
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
const selectableItems = ref<SelectableItem[]>(getInitialSelectableItems())
const cart = ref<CartLine[]>([])
const tickets = ref<SupportTicket[]>([])
const activity = ref<ActivityItem[]>(getInitialActivity())
let currentPlanner: ToolPlanner | undefined

watch(plannerProvider, function handlePlannerProviderChanged(provider) {
  if (provider === 'openrouter') {
    plannerModel.value = 'openrouter/auto'
    plannerAuthMode.value = 'user-key'
    return
  }

  if (provider === 'openai') {
    plannerModel.value = 'gpt-4.1-mini'
    plannerAuthMode.value = 'user-key'
    return
  }

  if (provider === 'cloudflare-workers-ai') {
    plannerModel.value = '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b'
    plannerAuthMode.value = 'server'
    return
  }

  if (provider === 'cloudflare-binding') {
    plannerModel.value = cloudflareBindingModels[0].id
    plannerAuthMode.value = 'server'
    plannerEndpoint.value = '/api/webmcp/plan'
    return
  }

  if (provider === 'openai-compatible') {
    plannerModel.value = ''
    plannerAuthMode.value = 'user-key'
  }
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
        status: 'draft' as const
      }
      invoices.value = [invoice, ...invoices.value]
      addActivity('Invoice created', `${invoice.customerName} for €${invoice.amount}`, 'success')
      return invoice
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
      const product = products.value.find(function findProduct(item) {
        return item.id === String(input.productId ?? '')
      })
      if (!product) throw new Error('Product is not available in the current catalog.')

      const line = {
        productId: product.id,
        name: product.name,
        quantity: Number(input.quantity ?? 1),
        price: product.price
      }
      cart.value = [line, ...cart.value.filter(function removeExisting(existing) {
        return existing.productId !== product.id
      })]
      addActivity('Cart updated', `${line.name} added`, 'success')
      return line
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
      const total = lines.reduce(function sumCart(sum, line) {
        return sum + line.price * line.quantity
      }, 0)
      cart.value = []
      addActivity('Checkout completed', `${lines.length} lines for €${total}`, 'success')

      return {
        lines,
        total
      }
    }
  })).unregister)

  unregisterCallbacks.push(registerTool(defineTool({
    name: 'select_items',
    description: 'Select checklist items by stable item IDs from the current visible checklist context.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Stable IDs of checklist items to select.'
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
      addActivity('Items selected', `Selected ${selectedItems.value.length} checklist items`, 'success')
      return selectedItems.value
    }
  })).unregister)

  unregisterCallbacks.push(registerTool(defineTool({
    name: 'clear_item_selection',
    description: 'Clear every selected checkbox in the visible checklist.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    execute() {
      selectableItems.value = selectableItems.value.map(function mapItem(item) {
        return {
          ...item,
          selected: false
        }
      })
      addActivity('Selection cleared', 'No checklist items are selected', 'info')
      return []
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
  selectableItems.value = selectableItems.value.map(function mapSelectableItem(item) {
    if (item.id !== id) return item

    return {
      ...item,
      selected
    }
  })
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
    checklistItems: selectableItems.value.map(function mapChecklistItem(item, index) {
      return {
        id: item.id,
        position: index + 1,
        name: item.name,
        selected: item.selected
      }
    }),
    products: products.value,
    invoices: invoices.value,
    cart: cart.value
  }
}

function getToolDisplayName(toolName: string): string {
  if (toolName === 'select_items') return 'Checklist selection'
  if (toolName === 'clear_item_selection') return 'Checklist selection'
  if (toolName === 'search_products') return 'Product search'
  if (toolName === 'create_invoice') return 'Invoice'
  if (toolName === 'add_to_cart') return 'Cart'
  if (toolName === 'checkout_cart') return 'Checkout'
  if (toolName === 'create_support_ticket') return 'Support ticket'
  return toolName
}

function getToolSuccessTitle(toolName: string): string {
  if (toolName === 'select_items') return 'Selection updated'
  if (toolName === 'clear_item_selection') return 'Selection cleared'
  if (toolName === 'search_products') return 'Product search completed'
  if (toolName === 'create_invoice') return 'Invoice created'
  if (toolName === 'add_to_cart') return 'Cart updated'
  if (toolName === 'checkout_cart') return 'Checkout completed'
  if (toolName === 'create_support_ticket') return 'Support ticket created'
  return `${toolName} completed`
}

function createSupportTicket(subject: string, body: string): SupportTicket {
  const ticket = {
    id: `ticket_${Date.now()}`,
    subject,
    body,
    status: 'open' as const
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

@media (max-width: 980px) {
  .tool-surface {
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
