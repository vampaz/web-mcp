<template>
  <main class="demo-shell">
    <section class="hero-panel">
      <div class="hero-copy">
        <p class="eyebrow">Local prototype</p>
        <h1>WebMCP Kit</h1>
        <p class="lede">
          A working adoption layer for native WebMCP tools, with Chrome built-in AI planning when available and a local fallback when it is not.
        </p>
      </div>

      <img class="hero-asset" src="/webmcp-circuit.svg" alt="Abstract WebMCP tool routing diagram" />
    </section>

    <section class="status-strip" aria-label="Runtime status">
      <div>
        <span>WebMCP</span>
        <strong>{{ supportLabel }}</strong>
      </div>
      <div>
        <span>Planner</span>
        <strong>{{ plannerName }}</strong>
        <small>{{ plannerDetail }}</small>
      </div>
      <div>
        <span>Registered tools</span>
        <strong>{{ registeredTools.length }}</strong>
      </div>
    </section>

    <section class="workbench">
      <div class="command-panel">
        <div class="panel-heading">
          <p class="eyebrow">Ask the app</p>
          <h2>Natural language command</h2>
        </div>

        <div class="planner-panel">
          <label>
            Provider
            <select v-model="plannerProvider">
              <option value="auto">Auto</option>
              <option value="chrome-built-in">Chrome built-in AI</option>
              <option value="local">Local fallback</option>
              <option value="openrouter">OpenRouter</option>
              <option value="openai">OpenAI</option>
              <option value="openai-compatible">OpenAI-compatible</option>
              <option v-if="showCloudflareBinding" value="cloudflare-binding">Cloudflare binding (dev/preview)</option>
              <option value="cloudflare-workers-ai">Cloudflare Workers AI (REST)</option>
            </select>
          </label>

          <label v-if="usesRemotePlanner && plannerProvider !== 'cloudflare-binding'">
            Model
            <input v-model="plannerModel" type="text" />
          </label>

          <label v-if="plannerProvider === 'cloudflare-binding'">
            Binding model
            <select v-model="plannerModel">
              <option v-for="model in cloudflareBindingModels" :key="model.id" :value="model.id">
                {{ model.label }}
              </option>
            </select>
          </label>

          <label v-if="plannerProvider === 'openai-compatible'">
            Base URL
            <input v-model="plannerBaseUrl" type="url" placeholder="http://localhost:1234/v1" />
          </label>

          <label v-if="plannerProvider === 'cloudflare-workers-ai' && plannerAuthMode === 'user-key'">
            Cloudflare account ID
            <input v-model="plannerAccountId" type="text" />
          </label>

          <label v-if="usesRemotePlanner && plannerProvider !== 'cloudflare-binding'">
            Auth mode
            <select v-model="plannerAuthMode">
              <option value="server">Server endpoint</option>
              <option value="user-key">User key in browser</option>
            </select>
          </label>

          <label v-if="usesRemotePlanner && (plannerAuthMode === 'server' || plannerProvider === 'cloudflare-binding')">
            {{ plannerProvider === 'cloudflare-binding' ? 'Binding endpoint' : 'Planner endpoint' }}
            <input v-model="plannerEndpoint" type="text" placeholder="/api/webmcp/plan" />
          </label>

          <label v-if="usesRemotePlanner && plannerAuthMode === 'user-key' && plannerProvider !== 'cloudflare-binding'">
            User API key
            <input v-model="plannerApiKey" type="password" autocomplete="off" placeholder="Stored in memory for this demo" />
          </label>

          <p v-if="usesRemotePlanner && plannerAuthMode === 'user-key' && plannerProvider !== 'cloudflare-binding'" class="planner-warning">
            User-key mode is simple and has no server, but the key is visible to this browser page. Use it for local experiments or user-owned keys, not shared production app secrets.
          </p>

          <p v-if="plannerProvider === 'cloudflare-binding'" class="planner-warning">
            Cloudflare binding mode is only exposed in local development or preview builds. It calls the selected endpoint and expects that endpoint to use an `AI` binding.
          </p>

          <p v-if="plannerProvider === 'cloudflare-workers-ai' && plannerAuthMode === 'server'" class="planner-warning">
            Cloudflare Workers AI REST server mode needs `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` on the server, or a custom endpoint.
          </p>
        </div>

        <textarea
          v-model="prompt"
          rows="4"
          aria-label="Natural language command"
          placeholder="Create an invoice for Acme for 500 euros"
        />

        <div class="prompt-examples">
          <button type="button" @click="setPrompt('Create an invoice for Northwind for 500 euros')">
            Invoice
          </button>
          <button type="button" @click="setPrompt('Find portable dock products')">
            Search
          </button>
          <button type="button" @click="setPrompt('Add a keyboard to the cart')">
            Cart
          </button>
          <button type="button" @click="setPrompt('Open a support ticket about billing access')">
            Support
          </button>
          <button type="button" @click="setPrompt('Select the first five items')">
            First five
          </button>
          <button type="button" @click="setPrompt('Select all the foods that are French')">
            French foods
          </button>
          <button type="button" @click="setPrompt('Select all the ones that are roots')">
            Roots
          </button>
        </div>

        <button class="primary-action" type="button" @click="runPrompt">
          Run command
        </button>

        <div v-if="lastPlan" class="plan-card">
          <span>Selected tool</span>
          <strong>{{ lastPlan.toolName }}</strong>
          <p>{{ lastPlan.reason }}</p>
          <p class="planner-used">Planned by {{ lastPlannerUsed }}</p>
          <code>{{ JSON.stringify(lastPlan.input, null, 2) }}</code>
        </div>
      </div>

      <aside class="tools-panel support-panel">
        <div class="panel-heading">
          <p class="eyebrow">Form helper</p>
          <h2>Support ticket form</h2>
        </div>

        <form ref="supportForm" class="support-form" @submit.prevent="submitSupportForm">
          <label>
            Subject
            <input v-model="supportSubject" name="subject" required data-tool-description="Short issue summary." />
          </label>
          <label>
            Details
            <textarea v-model="supportBody" name="body" required rows="5" data-tool-description="Detailed issue description." />
          </label>
          <button class="primary-action" type="submit">Create ticket</button>
        </form>

        <p class="helper-copy">
          This form is registered through `registerFormTool()`, which applies WebMCP form metadata and exposes the same action to the devtools overlay.
        </p>
      </aside>
    </section>

    <section class="state-grid">
      <article class="state-panel">
        <h2>Invoices</h2>
        <div v-for="invoice in invoices" :key="invoice.id" class="state-row">
          <span>{{ invoice.customerName }}</span>
          <strong>€{{ invoice.amount }}</strong>
          <em>{{ invoice.status }}</em>
        </div>
      </article>

      <article class="state-panel">
        <h2>Products</h2>
        <div v-for="product in products" :key="product.id" class="state-row">
          <span>{{ product.name }}</span>
          <strong>€{{ product.price }}</strong>
          <em>{{ product.category }}</em>
        </div>
      </article>

      <article class="state-panel">
        <h2>Cart</h2>
        <div v-if="cart.length === 0" class="empty-state">No cart lines yet.</div>
        <div v-for="line in cart" :key="line.productId" class="state-row">
          <span>{{ line.name }}</span>
          <strong>{{ line.quantity }}x</strong>
          <em>€{{ line.price }}</em>
        </div>
      </article>

      <article class="state-panel">
        <h2>Activity</h2>
        <div v-for="item in activity" :key="item.id" class="activity-row" :class="item.tone">
          <strong>{{ item.title }}</strong>
          <span>{{ item.detail }}</span>
        </div>
      </article>
    </section>

    <section class="selection-panel">
      <div class="panel-heading">
        <p class="eyebrow">Selection tools</p>
        <h2>Ten-item checklist</h2>
      </div>

      <div class="selection-summary">
        <strong>{{ selectedItems.length }} selected</strong>
        <span>Try “select the first five items”, “select French foods”, “select roots”, or “clear the selection”.</span>
      </div>

      <div class="checklist-grid">
        <label v-for="(item, index) in selectableItems" :key="item.id" class="checklist-item">
          <input v-model="item.selected" type="checkbox" />
          <span>{{ index + 1 }}. {{ item.name }}</span>
          <em>{{ item.description }}</em>
        </label>
      </div>
    </section>
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
  mountDevtoolsOverlay,
  registerTool,
  registerFormTool,
  type DevtoolsOverlay,
  type PlannerProviderConfig,
  type PlannerProviderKind,
  type ToolPlan,
  type ToolPlanner
} from '@webmcp-kit/core'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import type { ActivityItem, CartLine, Invoice, Product, SelectableItem, SupportTicket } from '@/interfaces/demo'

const prompt = ref('Create an invoice for Acme for 500 euros')
const plannerName = ref('Loading')
const plannerDetail = ref('Checking Chrome built-in AI availability.')
const plannerProvider = ref<PlannerProviderKind>('auto')
const plannerModel = ref('openrouter/auto')
const plannerBaseUrl = ref('')
const plannerEndpoint = ref('/api/webmcp/plan')
const plannerApiKey = ref('')
const plannerAccountId = ref('')
const plannerAuthMode = ref<'server' | 'user-key'>('user-key')
const showCloudflareBinding = import.meta.env.DEV || import.meta.env.PUBLIC_WEBMCP_PREVIEW === 'true'
const cloudflareBindingModels = [
  {
    id: '@cf/google/gemma-4-26b-a4b-it',
    label: 'Gemma 4 26B A4B'
  },
  {
    id: '@cf/moonshotai/kimi-k2.6',
    label: 'Kimi K2.6'
  },
  {
    id: '@cf/zai-org/glm-4.7-flash',
    label: 'GLM 4.7 Flash'
  },
  {
    id: '@cf/qwen/qwen3-30b-a3b-fp8',
    label: 'Qwen3 30B A3B FP8'
  },
  {
    id: '@cf/openai/gpt-oss-20b',
    label: 'GPT OSS 20B'
  },
  {
    id: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
    label: 'DeepSeek R1 Distill Qwen 32B'
  },
  {
    id: '@cf/qwen/qwq-32b',
    label: 'Qwen QwQ 32B'
  },
  {
    id: '@cf/meta/llama-3.1-8b-instruct',
    label: 'Llama 3.1 8B Instruct'
  },
  {
    id: '@cf/meta/llama-3.2-3b-instruct',
    label: 'Llama 3.2 3B Instruct'
  }
]
const lastPlannerUsed = ref('No command has run yet')
const selectedToolName = ref('create_invoice')
const registeredTools = ref<ReturnType<typeof listTools>>([])
const lastPlan = ref<ToolPlan | null>(null)
const unregisterCallbacks: Array<() => void> = []
const supportForm = ref<HTMLFormElement | null>(null)
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

const invoices = ref<Invoice[]>([
  { id: 'inv_100', customerName: 'Globex', amount: 230, status: 'sent' }
])
const products = ref<Product[]>([
  { id: 'kbd-01', name: 'Low-profile keyboard', category: 'Input', price: 129 },
  { id: 'dock-02', name: 'Travel USB-C dock', category: 'Connectivity', price: 89 },
  { id: 'cam-03', name: 'Desk camera', category: 'Video', price: 149 }
])
const selectableItems = ref<SelectableItem[]>([
  { id: 'item_1', name: 'Apple', category: 'fruit', description: 'fruit, food, common snack', selected: false },
  { id: 'item_2', name: 'Banana', category: 'fruit', description: 'fruit, food, tropical snack', selected: false },
  { id: 'item_3', name: 'Carrot', category: 'vegetable', description: 'root vegetable, food', selected: false },
  { id: 'item_4', name: 'Croissant', category: 'bakery', description: 'French bakery food, pastry', selected: false },
  { id: 'item_5', name: 'Orange', category: 'fruit', description: 'fruit, food, citrus', selected: false },
  { id: 'item_6', name: 'Spinach', category: 'vegetable', description: 'leaf vegetable, food', selected: false },
  { id: 'item_7', name: 'Baguette', category: 'bakery', description: 'French bakery food, bread', selected: false },
  { id: 'item_8', name: 'Water', category: 'drink', description: 'drink, beverage, not food', selected: false },
  { id: 'item_9', name: 'Beetroot', category: 'vegetable', description: 'root vegetable, food', selected: false },
  { id: 'item_10', name: 'Coffee', category: 'drink', description: 'drink, beverage, not food', selected: false }
])
const cart = ref<CartLine[]>([])
const tickets = ref<SupportTicket[]>([])
const activity = ref<ActivityItem[]>([
  {
    id: 'activity_1',
    title: 'Demo ready',
    detail: 'Tools will register when the Vue island mounts.',
    tone: 'info'
  }
])

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
  registerDemoTools()
  registerSupportFormTool()
  refreshTools()
  unregisterCallbacks.push(installWebMCPKitTestBridge())
  devtoolsOverlay = mountDevtoolsOverlay({ initiallyOpen: true })

  await refreshPlanner()
})

onUnmounted(function handleUnmounted() {
  for (const unregister of unregisterCallbacks) {
    unregister()
  }
  devtoolsOverlay?.destroy()
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
      required: ['customerName', 'amount']
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
      required: ['query']
    },
    execute(input) {
      const query = String(input.query ?? '').toLowerCase()
      const matches = products.value.filter(function filterProduct(product) {
        return product.name.toLowerCase().includes(query) || product.category.toLowerCase().includes(query)
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
      required: ['productId', 'quantity']
    },
    execute(input) {
      const product = products.value.find(function findProduct(item) {
        return item.id === input.productId
      }) ?? products.value[0]
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
      required: ['ids']
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
    description: 'Clear every selected checkbox in the visible ten-item checklist.',
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
  if (!supportForm.value) return

  unregisterCallbacks.push(registerFormTool({
    form: supportForm.value,
    name: 'create_support_ticket',
    description: 'Create a support ticket from the visible support form and mark it as open for triage.',
    execute(input) {
      return createSupportTicket(String(input.subject ?? 'Support request'), String(input.body ?? ''))
    }
  }).unregister)
}

async function runPrompt() {
  const planner = await getCurrentPlanner()
  if (!planner) return

  const tools = listTools().map(function mapRegistration(registration) {
    return registration.tool
  })
  const plan = await planner.plan(prompt.value, tools, getPlannerContext())
  lastPlan.value = plan
  lastPlannerUsed.value = `${planner.name} (${planner.status})`
  selectedToolName.value = plan.toolName

  const registration = listTools().find(function findRegistration(item) {
    return item.tool.name === plan.toolName
  })
  const needsConfirmation = registration?.tool.confirmation?.required === true
  const confirmed = needsConfirmation ? window.confirm(registration?.tool.confirmation?.reason ?? 'Confirm this action?') : true

  const result = await invokeTool({
    toolName: plan.toolName,
    input: plan.input,
    confirmed,
    source: 'planner'
  })

  if (result.status !== 'success') {
    addActivity('Command blocked', result.error ?? 'The selected tool could not run.', 'warning')
  }
}

function setPrompt(nextPrompt: string) {
  prompt.value = nextPrompt
}

async function submitSupportForm() {
  const result = await invokeTool({
    toolName: 'create_support_ticket',
    input: {
      subject: supportSubject.value,
      body: supportBody.value
    }
  })

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
  const planner = plannerConfig ? await createConfiguredPlanner(plannerConfig) : await createBestPlanner()
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
        category: item.category,
        description: item.description,
        selected: item.selected
      }
    }),
    products: products.value,
    invoices: invoices.value
  }
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
  padding: 24px 0 48px;
}

.hero-panel {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(320px, 1.1fr);
  gap: clamp(20px, 4vw, 64px);
  align-items: center;
  min-height: clamp(360px, 56vh, 620px);
  border-bottom: 1px solid rgba(244, 240, 232, 0.16);
}

.hero-copy {
  display: grid;
  gap: 20px;
}

.eyebrow {
  margin: 0;
  color: #e8be53;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

h1,
h2 {
  margin: 0;
  letter-spacing: 0;
}

h1 {
  color: #f4f0e8;
  font-family: Georgia, Cambria, serif;
  font-size: clamp(4rem, 13vw, 11rem);
  font-weight: 900;
  line-height: 0.82;
}

h2 {
  font-size: clamp(1.15rem, 2vw, 1.55rem);
}

.lede {
  max-width: 660px;
  margin: 0;
  color: #c9d1cb;
  font-size: clamp(1.05rem, 1.8vw, 1.45rem);
  line-height: 1.55;
}

.hero-asset {
  width: 100%;
  max-height: 460px;
  object-fit: contain;
  filter: drop-shadow(0 30px 80px rgba(0, 0, 0, 0.38));
}

.status-strip,
.workbench,
.state-grid,
.selection-panel {
  display: grid;
  gap: 16px;
}

.status-strip {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 22px 0;
}

.status-strip div,
.command-panel,
.tools-panel,
.state-panel,
.selection-panel {
  border: 1px solid rgba(244, 240, 232, 0.14);
  background: rgba(12, 17, 16, 0.72);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.26);
  backdrop-filter: blur(18px);
}

.status-strip div {
  display: grid;
  gap: 6px;
  padding: 16px;
}

.status-strip span,
.plan-card span,
.status-strip small {
  color: #9ea8a1;
  font-size: 0.78rem;
}

.status-strip span,
.plan-card span {
  text-transform: uppercase;
}

.status-strip strong {
  color: #f4f0e8;
  font-size: clamp(1rem, 2vw, 1.3rem);
}

.workbench {
  grid-template-columns: minmax(0, 1.25fr) minmax(300px, 0.75fr);
  align-items: start;
}

.command-panel,
.tools-panel,
.state-panel {
  padding: clamp(18px, 3vw, 28px);
}

.panel-heading {
  display: grid;
  gap: 8px;
  margin-bottom: 18px;
}

textarea {
  width: 100%;
  resize: vertical;
  min-height: 132px;
  padding: 16px;
  border: 1px solid rgba(244, 240, 232, 0.2);
  border-radius: 0;
  outline: none;
  background: #f4f0e8;
  color: #0c1110;
  line-height: 1.5;
}

textarea:focus {
  border-color: #e8be53;
  box-shadow: 0 0 0 4px rgba(232, 190, 83, 0.2);
}

.prompt-examples {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 14px 0;
}

.planner-panel {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin: 14px 0;
  padding: 14px;
  border: 1px solid rgba(244, 240, 232, 0.14);
  background: rgba(244, 240, 232, 0.04);
}

.planner-panel label {
  display: grid;
  gap: 7px;
  min-width: 0;
  color: #c9d1cb;
  font-size: 0.86rem;
}

.planner-panel input,
.planner-panel select {
  min-width: 0;
  min-height: 42px;
  padding: 10px;
  border: 1px solid rgba(244, 240, 232, 0.18);
  background: #f4f0e8;
  color: #0c1110;
  font: inherit;
}

.planner-warning {
  grid-column: 1 / -1;
  margin: 0;
  border-left: 3px solid #e8be53;
  padding-left: 10px;
  color: #e7d7a5;
  font-size: 0.88rem;
  line-height: 1.45;
}

.prompt-examples button,
.primary-action,
.support-form input {
  border: 1px solid rgba(244, 240, 232, 0.18);
  color: #f4f0e8;
  background: rgba(244, 240, 232, 0.06);
}

.prompt-examples button {
  padding: 9px 12px;
}

.primary-action {
  width: 100%;
  padding: 16px 18px;
  border-color: #e8be53;
  background: #e8be53;
  color: #0c1110;
  font-weight: 900;
}

.support-form {
  display: grid;
  gap: 12px;
}

.support-form label {
  display: grid;
  gap: 8px;
  color: #c9d1cb;
  font-size: 0.92rem;
}

.support-form input {
  min-height: 46px;
  padding: 12px;
  outline: none;
}

.state-row em,
.empty-state,
.helper-copy {
  color: #9ea8a1;
}

.helper-copy {
  margin: 14px 0 0;
  line-height: 1.5;
}

.plan-card {
  display: grid;
  gap: 8px;
  margin-top: 16px;
  padding: 16px;
  border-left: 4px solid #30a779;
  background: rgba(48, 167, 121, 0.12);
}

.plan-card p {
  margin: 0;
  color: #c9d1cb;
}

.planner-used {
  color: #e8be53;
  font-size: 0.88rem;
}

code {
  display: block;
  overflow: auto;
  padding: 12px;
  background: rgba(0, 0, 0, 0.34);
  color: #f4f0e8;
  white-space: pre-wrap;
}

.state-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-top: 16px;
}

.selection-panel {
  margin-top: 16px;
  padding: clamp(18px, 3vw, 28px);
}

.selection-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 18px;
  align-items: baseline;
  color: #c9d1cb;
}

.selection-summary strong {
  color: #30a779;
  font-size: 1.2rem;
}

.selection-summary span {
  color: #9ea8a1;
}

.checklist-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.checklist-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 6px 10px;
  align-items: center;
  padding: 12px;
  border: 1px solid rgba(244, 240, 232, 0.12);
  background: rgba(244, 240, 232, 0.05);
}

.checklist-item input {
  inline-size: 18px;
  block-size: 18px;
  accent-color: #30a779;
}

.checklist-item span {
  color: #f4f0e8;
  overflow-wrap: anywhere;
}

.checklist-item em {
  grid-column: 2;
  color: #9ea8a1;
  font-size: 0.78rem;
  font-style: normal;
}

.state-panel h2 {
  margin-bottom: 14px;
}

.state-row,
.activity-row {
  display: grid;
  gap: 4px;
  padding: 12px 0;
  border-top: 1px solid rgba(244, 240, 232, 0.1);
}

.activity-row.success strong {
  color: #30a779;
}

.activity-row.warning strong {
  color: #e8be53;
}

.activity-row.error strong {
  color: #d85d3f;
}

@media (max-width: 980px) {
  .hero-panel,
  .workbench,
  .state-grid,
  .checklist-grid {
    grid-template-columns: 1fr;
  }

  .planner-panel {
    grid-template-columns: 1fr;
  }

  .status-strip {
    grid-template-columns: 1fr;
  }
}
</style>
