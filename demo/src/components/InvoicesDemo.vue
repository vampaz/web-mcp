<template>
  <DemoShell
    :activity-items="activityItems"
    :confirmations-enabled="settings.confirmationsEnabled"
    :eyebrow="`${visibleInvoices.length} visible records`"
    :get-context="getPlannerContext"
    :metrics="metrics"
    placeholder="Try: Mark Stark Industries invoices as paid"
    :registered-tools-count="registeredToolsCount"
    description="Manage accounts receivable with customer health, invoice risk, bulk updates, and a visible audit trail for AI-assisted changes."
    :suggestions="[
      'Open the Stark invoice',
      'Mark Stark Industries invoices as paid',
      'Show overdue invoices over 900 euros'
    ]"
    title="Invoices"
  >
    <section class="demo-page-content demo-page-content--invoices">
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

      <DemoInvoiceDrawer
        :active-invoice="activeInvoice"
        :active-customer="activeCustomer"
        :draft="invoiceDraft"
        @create-invoice="createInvoiceFromDraft"
        @update:draft="updateInvoiceDraft"
      />
    </section>
  </DemoShell>
</template>

<script setup lang="ts">
import { defineTool, listTools, registerTool } from 'webmcp-kit'
import { computed, onMounted, onUnmounted, ref } from 'vue'

import DemoInvoiceDrawer from '@/components/DemoInvoiceDrawer.vue'
import DemoInvoiceTable from '@/components/DemoInvoiceTable.vue'
import DemoShell from '@/components/DemoShell.vue'
import type {
  Customer,
  DemoActivityItem,
  DemoMetric,
  Invoice,
  InvoiceDraft,
  InvoiceFilters
} from '@/interfaces/demo'
import {
  getInitialCustomers,
  getInitialDemoSettings,
  getInitialInvoiceDraft,
  getInitialInvoices
} from '@/utils/demo-data'

const customers = ref<Customer[]>(getInitialCustomers())
const invoices = ref<Invoice[]>(getInitialInvoices())
const invoiceFilters = ref<InvoiceFilters>({
  query: '',
  status: 'all'
})
const invoiceSortKey = ref<'amount' | 'customerName' | 'dueDate' | 'status'>('dueDate')
const invoiceSortDirection = ref<'asc' | 'desc'>('asc')
const activeInvoiceId = ref(invoices.value[0]?.id ?? '')
const invoiceDraft = ref<InvoiceDraft>(getInitialInvoiceDraft())
const settings = ref(getInitialDemoSettings())
const registeredToolsCount = ref(0)
const activityItems = ref<DemoActivityItem[]>([
  {
    id: 'invoice-seed',
    kind: 'system',
    time: '08:55',
    title: 'Receivables snapshot loaded',
    detail: 'Invoice risk, account health, and owner context are ready for planning.'
  }
])
const unregisterCallbacks: Array<() => void> = []
const selectedInvoices = computed(function getSelectedInvoices() {
  return invoices.value.filter(function filterSelectedInvoice(invoice) {
    return invoice.selected
  })
})
const visibleInvoices = computed(function getVisibleInvoices() {
  const query = invoiceFilters.value.query.trim().toLowerCase()
  const rows = invoices.value.filter(function filterInvoice(invoice) {
    const matchesStatus =
      invoiceFilters.value.status === 'all' || invoice.status === invoiceFilters.value.status
    const searchableText =
      `${invoice.customerName} ${invoice.owner} ${invoice.status} ${invoice.id}`.toLowerCase()
    return matchesStatus && (!query || searchableText.includes(query))
  })

  return [...rows].sort(function sortInvoices(left, right) {
    const direction = invoiceSortDirection.value === 'asc' ? 1 : -1
    const leftValue = left[invoiceSortKey.value]
    const rightValue = right[invoiceSortKey.value]
    if (typeof leftValue === 'number' && typeof rightValue === 'number')
      return (leftValue - rightValue) * direction
    return String(leftValue).localeCompare(String(rightValue)) * direction
  })
})
const activeInvoice = computed(function getActiveInvoice() {
  return invoices.value.find(function findInvoice(invoice) {
    return invoice.id === activeInvoiceId.value
  })
})
const activeCustomer = computed(function getActiveCustomer() {
  const invoice = activeInvoice.value
  if (!invoice) return undefined
  return customers.value.find(function findCustomer(customer) {
    return customer.id === invoice.customerId || customer.name === invoice.customerName
  })
})
const metrics = computed<DemoMetric[]>(function getInvoiceMetrics() {
  const outstanding = invoices.value
    .filter(function filterOpenInvoice(invoice) {
      return invoice.status !== 'paid' && invoice.status !== 'void'
    })
    .reduce(function sumOutstanding(total, invoice) {
      return total + invoice.amount
    }, 0)
  const overdue = invoices.value.filter(function filterOverdue(invoice) {
    return invoice.status === 'overdue'
  }).length
  const riskAccounts = customers.value.filter(function filterRiskCustomer(customer) {
    return customer.health === 'risk'
  }).length

  return [
    {
      label: 'Outstanding',
      value: `€${outstanding.toLocaleString('en-US')}`,
      tone: overdue > 0 ? 'warn' : 'good'
    },
    {
      label: 'Overdue',
      value: String(overdue),
      tone: overdue > 0 ? 'danger' : 'good'
    },
    {
      label: 'Risk accounts',
      value: String(riskAccounts),
      tone: riskAccounts > 0 ? 'warn' : 'good'
    }
  ]
})

onMounted(function handleMounted() {
  registerInvoiceTools()
  refreshTools()
})

onUnmounted(function handleUnmounted() {
  for (const unregister of unregisterCallbacks) {
    unregister()
  }
})

function registerInvoiceTools() {
  unregisterCallbacks.push(
    registerTool(
      defineTool({
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
            customerId: findCustomerId(String(input.customerName ?? 'Acme Corp')),
            customerName: String(input.customerName ?? 'Acme Corp'),
            amount: Number(input.amount ?? 100),
            status: 'draft' as const,
            dueDate: String(input.dueDate ?? invoiceDraft.value.dueDate),
            owner: String(input.owner ?? invoiceDraft.value.owner),
            risk: 'medium' as const,
            selected: false
          }
          invoices.value = [invoice, ...invoices.value]
          activeInvoiceId.value = invoice.id
          addActivity(
            'ai',
            'Invoice created',
            `${invoice.customerName} draft invoice for €${invoice.amount}.`
          )
          return invoice
        }
      })
    ).unregister
  )

  unregisterCallbacks.push(
    registerTool(
      defineTool({
        name: 'filter_invoices',
        description:
          'Apply visible invoice table filters by status, search query, or minimum amount.',
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

          addActivity(
            'ai',
            'Invoice filters applied',
            `${visibleInvoices.value.length} invoices match the current filter set.`
          )

          return {
            filters: invoiceFilters.value,
            visibleInvoices: visibleInvoices.value
          }
        }
      })
    ).unregister
  )

  unregisterCallbacks.push(
    registerTool(
      defineTool({
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
          addActivity('ai', 'Invoice table sorted', `Sorted by ${invoiceSortKey.value}.`)
          return visibleInvoices.value
        }
      })
    ).unregister
  )

  unregisterCallbacks.push(
    registerTool(
      defineTool({
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
          addActivity('ai', 'Invoices selected', `${selectedInvoices.value.length} rows selected.`)
          return selectedInvoices.value
        }
      })
    ).unregister
  )

  unregisterCallbacks.push(
    registerTool(
      defineTool({
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
          return (
            invoices.value.some(function hasInvoice(invoice) {
              return invoice.id === String(input.id ?? '')
            }) || 'Invoice is not visible in the current workspace.'
          )
        },
        execute(input) {
          activeInvoiceId.value = String(input.id)
          const invoice = activeInvoice.value
          if (invoice) {
            addActivity('ai', 'Invoice opened', `${invoice.customerName} ${invoice.id} is active.`)
          }
          return invoice
        }
      })
    ).unregister
  )

  unregisterCallbacks.push(
    registerTool(
      defineTool({
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
          addActivity(
            'ai',
            'Invoice status updated',
            `${selectedInvoices.value.length} selected invoices moved to ${status}.`
          )
          return selectedInvoices.value
        }
      })
    ).unregister
  )
}

function setInvoiceSelected(id: string, selected: boolean) {
  invoices.value = invoices.value.map(function mapInvoice(invoice) {
    if (invoice.id !== id) return invoice
    return {
      ...invoice,
      selected
    }
  })
  const invoice = invoices.value.find(function findInvoice(invoiceItem) {
    return invoiceItem.id === id
  })
  addActivity(
    'manual',
    selected ? 'Invoice selected' : 'Invoice cleared',
    invoice ? `${invoice.customerName} ${invoice.id}.` : id
  )
}

function selectVisibleInvoices() {
  const visibleIds = new Set(
    visibleInvoices.value.map(function mapInvoiceId(invoice) {
      return invoice.id
    })
  )
  invoices.value = invoices.value.map(function mapInvoice(invoice) {
    return {
      ...invoice,
      selected: visibleIds.has(invoice.id)
    }
  })
  addActivity(
    'manual',
    'Visible invoices selected',
    `${visibleInvoices.value.length} rows selected.`
  )
}

function clearInvoiceSelection() {
  invoices.value = invoices.value.map(function mapInvoice(invoice) {
    return {
      ...invoice,
      selected: false
    }
  })
  addActivity('manual', 'Invoice selection cleared', 'No invoice rows are selected.')
}

function markSelectedInvoices(status: Invoice['status']) {
  invoices.value = invoices.value.map(function mapInvoice(invoice) {
    if (!invoice.selected) return invoice
    return {
      ...invoice,
      status
    }
  })
  addActivity('manual', 'Invoice status updated', `Selected invoices moved to ${status}.`)
}

function openInvoice(id: string) {
  activeInvoiceId.value = id
  const invoice = activeInvoice.value
  if (invoice) {
    addActivity('manual', 'Invoice opened', `${invoice.customerName} ${invoice.id} is active.`)
  }
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
    customerId: findCustomerId(invoiceDraft.value.customerName),
    customerName: invoiceDraft.value.customerName,
    dueDate: invoiceDraft.value.dueDate,
    owner: invoiceDraft.value.owner,
    risk: 'medium' as const,
    selected: false,
    status: invoiceDraft.value.status
  }
  invoices.value = [invoice, ...invoices.value]
  activeInvoiceId.value = invoice.id
  addActivity(
    'manual',
    'Invoice created',
    `${invoice.customerName} draft invoice for €${invoice.amount}.`
  )
}

function refreshTools() {
  registeredToolsCount.value = listTools().length
}

function getPlannerContext() {
  return {
    invoiceFilters: invoiceFilters.value,
    customers: customers.value,
    invoices: invoices.value,
    selectedInvoices: selectedInvoices.value,
    settings: settings.value,
    visibleInvoices: visibleInvoices.value
  }
}

function findCustomerId(customerName: string): string {
  const customer = customers.value.find(function findCustomer(candidate) {
    return candidate.name.toLowerCase() === customerName.toLowerCase()
  })

  return customer?.id ?? `cust_${customerName.toLowerCase().replace(/\W+/g, '_')}`
}

function addActivity(kind: DemoActivityItem['kind'], title: string, detail: string) {
  activityItems.value = [
    {
      id: `${Date.now()}-${activityItems.value.length}`,
      kind,
      time: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      }),
      title,
      detail
    },
    ...activityItems.value
  ].slice(0, 7)
}

function isInvoiceStatus(value: unknown): value is Invoice['status'] {
  return (
    value === 'draft' ||
    value === 'sent' ||
    value === 'overdue' ||
    value === 'paid' ||
    value === 'void'
  )
}

function isInvoiceStatusFilter(value: unknown): value is InvoiceFilters['status'] {
  return value === 'all' || isInvoiceStatus(value)
}

function isInvoiceSortKey(
  value: unknown
): value is 'amount' | 'customerName' | 'dueDate' | 'status' {
  return value === 'amount' || value === 'customerName' || value === 'dueDate' || value === 'status'
}
</script>

<style scoped>
.demo-page-content {
  display: grid;
  min-width: 0;
  gap: clamp(0.9rem, 1.6vw, 1.25rem);
}

.demo-page-content--invoices {
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
}

@media (min-width: 78rem) {
  .demo-page-content--invoices {
    grid-template-columns: minmax(0, 1fr) minmax(20rem, 24rem);
    align-items: stretch;
  }

  .demo-page-content--invoices > * {
    min-height: 100%;
  }
}
</style>
