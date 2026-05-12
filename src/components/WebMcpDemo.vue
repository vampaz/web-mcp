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
        </div>

        <button class="primary-action" type="button" @click="runPrompt">
          Run command
        </button>

        <div v-if="lastPlan" class="plan-card">
          <span>Selected tool</span>
          <strong>{{ lastPlan.toolName }}</strong>
          <p>{{ lastPlan.reason }}</p>
          <code>{{ JSON.stringify(lastPlan.input, null, 2) }}</code>
        </div>
      </div>

      <aside class="tools-panel">
        <div class="panel-heading">
          <p class="eyebrow">Registry</p>
          <h2>Exposed tools</h2>
        </div>

        <button
          v-for="registration in registeredTools"
          :key="registration.tool.name"
          type="button"
          class="tool-card"
          :class="{ active: selectedToolName === registration.tool.name }"
          @click="selectTool(registration.tool.name)"
        >
          <span>{{ registration.mode }}</span>
          <strong>{{ registration.tool.name }}</strong>
          <small>{{ registration.tool.description }}</small>
        </button>
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
  </main>
</template>

<script setup lang="ts">
import {
  createBestPlanner,
  defineTool,
  getSupportLabel,
  invokeTool,
  listTools,
  registerTool,
  type RegisteredTool,
  type ToolPlan
} from '@webmcp-kit/core'
import { computed, onMounted, onUnmounted, ref } from 'vue'

import type { ActivityItem, CartLine, Invoice, Product, SupportTicket } from '@/interfaces/demo'

const prompt = ref('Create an invoice for Acme for 500 euros')
const plannerName = ref('Loading')
const selectedToolName = ref('create_invoice')
const registeredTools = ref<RegisteredTool[]>([])
const lastPlan = ref<ToolPlan | null>(null)
const unregisterCallbacks: Array<() => void> = []
const supportLabel = computed(function getCurrentSupportLabel() {
  return getSupportLabel()
})

const invoices = ref<Invoice[]>([
  { id: 'inv_100', customerName: 'Globex', amount: 230, status: 'sent' }
])
const products = ref<Product[]>([
  { id: 'kbd-01', name: 'Low-profile keyboard', category: 'Input', price: 129 },
  { id: 'dock-02', name: 'Travel USB-C dock', category: 'Connectivity', price: 89 },
  { id: 'cam-03', name: 'Desk camera', category: 'Video', price: 149 }
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

onMounted(async function handleMounted() {
  registerDemoTools()
  refreshTools()

  const planner = await createBestPlanner()
  plannerName.value = planner.name

  window.__webMCPKitDemoPlanner = planner
})

onUnmounted(function handleUnmounted() {
  for (const unregister of unregisterCallbacks) {
    unregister()
  }
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
    name: 'create_support_ticket',
    description: 'Create a support ticket from a user issue and mark it as open for triage.',
    inputSchema: {
      type: 'object',
      properties: {
        subject: {
          type: 'string',
          description: 'Short issue summary.'
        },
        body: {
          type: 'string',
          description: 'Detailed issue description.'
        }
      },
      required: ['subject', 'body']
    },
    execute(input) {
      const ticket = {
        id: `ticket_${Date.now()}`,
        subject: String(input.subject ?? 'Support request'),
        body: String(input.body ?? ''),
        status: 'open' as const
      }
      tickets.value = [ticket, ...tickets.value]
      addActivity('Ticket opened', ticket.subject, 'success')
      return ticket
    }
  })).unregister)
}

async function runPrompt() {
  const planner = window.__webMCPKitDemoPlanner
  if (!planner) return

  const tools = listTools().map(function mapRegistration(registration) {
    return registration.tool
  })
  const plan = await planner.plan(prompt.value, tools)
  lastPlan.value = plan
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

function selectTool(toolName: string) {
  selectedToolName.value = toolName
}

function setPrompt(nextPrompt: string) {
  prompt.value = nextPrompt
}

function refreshTools() {
  registeredTools.value = listTools()
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
      name: string
      available: boolean
      plan: (message: string, tools: ReturnType<typeof listTools>[number]['tool'][]) => Promise<ToolPlan>
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
.state-grid {
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
.state-panel {
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
.plan-card span {
  color: #9ea8a1;
  font-size: 0.78rem;
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

.prompt-examples button,
.primary-action,
.tool-card {
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

.tool-card {
  display: grid;
  width: 100%;
  gap: 7px;
  padding: 16px;
  text-align: left;
}

.tool-card + .tool-card {
  margin-top: 10px;
}

.tool-card.active {
  border-color: #30a779;
  background: rgba(48, 167, 121, 0.16);
}

.tool-card span,
.tool-card small,
.state-row em,
.empty-state {
  color: #9ea8a1;
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
  .state-grid {
    grid-template-columns: 1fr;
  }

  .status-strip {
    grid-template-columns: 1fr;
  }
}
</style>
