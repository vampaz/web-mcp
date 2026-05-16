<template>
  <section class="invoice-workspace" :class="density">
    <div class="workspace-header">
      <div>
        <p class="eyebrow">Primary WebMCP surface</p>
        <h2>Invoice operations</h2>
      </div>
      <div class="workspace-summary">
        <strong>{{ selectedCount }} selected</strong>
        <span>{{ filteredCount }} visible of {{ totalCount }}</span>
      </div>
    </div>

    <div class="table-controls">
      <label class="search-control">
        Search
        <input :value="filters.query" type="search" placeholder="Customer, owner, status..." @input="updateQuery" />
      </label>

      <label>
        Status
        <select :value="filters.status" @change="updateStatus">
          <option value="all">All</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="overdue">Overdue</option>
          <option value="paid">Paid</option>
          <option value="void">Void</option>
        </select>
      </label>

      <div class="sort-controls">
        <label>
          Sort
          <select :value="sortKey" @change="updateSortKey">
            <option value="dueDate">Due date</option>
            <option value="amount">Amount</option>
            <option value="customerName">Customer</option>
            <option value="status">Status</option>
          </select>
        </label>

        <button
          class="sort-direction"
          type="button"
          :aria-label="sortDirection === 'asc' ? 'Sort ascending' : 'Sort descending'"
          :title="sortDirection === 'asc' ? 'Sort ascending' : 'Sort descending'"
          @click="toggleSortDirection"
        >
          {{ sortDirection === 'asc' ? '↑' : '↓' }}
        </button>
      </div>
    </div>

    <div class="bulk-bar">
      <button type="button" @click="selectVisible">Select visible</button>
      <button type="button" @click="clearSelection">Clear</button>
      <button type="button" :disabled="selectedCount === 0" @click="markSelected('sent')">Mark sent</button>
      <button type="button" :disabled="selectedCount === 0" @click="markSelected('paid')">Mark paid</button>
    </div>

    <div class="table-shell">
      <table>
        <thead>
          <tr>
            <th class="col-select" scope="col">Select</th>
            <th scope="col">Customer</th>
            <th class="col-status" scope="col">Status</th>
            <th class="col-amount" scope="col">Amount</th>
            <th class="col-due" scope="col">Due</th>
            <th class="col-owner" scope="col">Owner</th>
            <th class="col-open" scope="col">Open</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="invoice in invoices" :key="invoice.id" :class="{ selected: invoice.selected, active: invoice.id === activeInvoiceId }">
            <td class="col-select">
              <input :checked="invoice.selected" type="checkbox" :aria-label="`Select ${invoice.customerName}`" @change="toggleInvoice(invoice.id, $event)" />
            </td>
            <td>
              <strong>{{ invoice.customerName }}</strong>
              <span>{{ invoice.id }}</span>
            </td>
            <td class="col-status">
              <span class="status" :class="invoice.status">{{ invoice.status }}</span>
            </td>
            <td class="col-amount">€{{ invoice.amount }}</td>
            <td class="col-due">{{ invoice.dueDate }}</td>
            <td class="col-owner">{{ invoice.owner }}</td>
            <td class="col-open">
              <button type="button" @click="openInvoice(invoice.id)">Open</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { Invoice, InvoiceFilters } from '@/interfaces/demo'

interface Props {
  activeInvoiceId: string
  density: 'comfortable' | 'compact'
  filteredCount: number
  filters: InvoiceFilters
  invoices: Invoice[]
  selectedCount: number
  sortDirection: 'asc' | 'desc'
  sortKey: 'amount' | 'customerName' | 'dueDate' | 'status'
  totalCount: number
}

const props = withDefaults(defineProps<Props>(), {})
const emit = defineEmits<{
  'clear-selection': []
  'mark-selected': [status: Invoice['status']]
  'open-invoice': [id: string]
  'select-visible': []
  'toggle-invoice': [id: string, selected: boolean]
  'update:query': [value: string]
  'update:sort-direction': [value: 'asc' | 'desc']
  'update:sort-key': [value: 'amount' | 'customerName' | 'dueDate' | 'status']
  'update:status': [value: InvoiceFilters['status']]
}>()

function updateQuery(event: Event) {
  emit('update:query', getInputValue(event))
}

function updateStatus(event: Event) {
  emit('update:status', getInputValue(event) as InvoiceFilters['status'])
}

function updateSortKey(event: Event) {
  emit('update:sort-key', getInputValue(event) as 'amount' | 'customerName' | 'dueDate' | 'status')
}

function toggleSortDirection() {
  emit('update:sort-direction', props.sortDirection === 'asc' ? 'desc' : 'asc')
}

function selectVisible() {
  emit('select-visible')
}

function clearSelection() {
  emit('clear-selection')
}

function markSelected(status: Invoice['status']) {
  emit('mark-selected', status)
}

function openInvoice(id: string) {
  emit('open-invoice', id)
}

function toggleInvoice(id: string, event: Event) {
  emit('toggle-invoice', id, event.target instanceof HTMLInputElement && event.target.checked)
}

function getInputValue(event: Event): string {
  return event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement
    ? event.target.value
    : ''
}
</script>

<style scoped>
.invoice-workspace {
  display: grid;
  gap: 12px;
  min-width: 0;
  overflow: hidden;
  margin-top: 10px;
  padding: 14px;
  border: 1px solid rgba(48, 167, 121, 0.34);
  background: rgba(9, 18, 15, 0.82);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.26);
  backdrop-filter: blur(18px);
}

.workspace-header,
.workspace-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 18px;
  align-items: baseline;
  justify-content: space-between;
}

.bulk-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.eyebrow {
  margin: 0 0 8px;
  color: #e8be53;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

h2 {
  margin: 0;
  font-size: clamp(1.05rem, 1.5vw, 1.32rem);
  letter-spacing: 0;
}

.workspace-summary strong {
  color: #30a779;
}

.workspace-summary span {
  color: #9ea8a1;
}

.table-controls {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) minmax(160px, 0.42fr) minmax(240px, 0.58fr);
  gap: 8px;
  align-items: end;
}

.table-controls label,
.sort-controls {
  display: grid;
  gap: 5px;
  min-width: 0;
  color: #c9d1cb;
  font-size: 0.84rem;
}

.sort-controls {
  grid-template-columns: minmax(0, 1fr) 42px;
  align-items: end;
}

.sort-controls label {
  display: grid;
  gap: 5px;
  min-width: 0;
}

input,
select,
button {
  min-height: 36px;
  border: 1px solid rgba(244, 240, 232, 0.18);
  font: inherit;
}

input,
select {
  min-width: 0;
  padding: 7px 9px;
  background: #f4f0e8;
  color: #0c1110;
}

button {
  padding: 7px 10px;
  background: rgba(244, 240, 232, 0.06);
  color: #f4f0e8;
}

.sort-direction {
  display: grid;
  width: 42px;
  min-width: 42px;
  padding: 0;
  place-items: center;
  font-size: 1rem;
  line-height: 1;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.44;
}

.table-shell {
  min-width: 0;
  max-width: 100%;
  overflow: auto;
  border: 1px solid rgba(244, 240, 232, 0.12);
}

table {
  width: 100%;
  border-collapse: collapse;
  min-width: 880px;
}

th,
td {
  padding: 10px;
  border-bottom: 1px solid rgba(244, 240, 232, 0.1);
  text-align: left;
  vertical-align: middle;
}

th {
  color: #9ea8a1;
  font-size: 0.74rem;
  text-transform: uppercase;
}

tr.selected,
tr.active {
  background: rgba(48, 167, 121, 0.13);
}

td strong,
td span {
  display: block;
}

td span {
  color: #9ea8a1;
  font-size: 0.78rem;
}

.status {
  display: inline-block;
  padding: 2px 6px;
  border: 1px solid rgba(244, 240, 232, 0.16);
  color: #f4f0e8;
  text-transform: uppercase;
}

.status.overdue {
  color: #f39a8d;
}

.status.paid {
  color: #30a779;
}

.compact th,
.compact td {
  padding: 7px 9px;
}

@media (max-width: 980px) {
  .table-controls {
    grid-template-columns: 1fr;
  }

  .sort-controls {
    grid-template-columns: minmax(0, 1fr) 42px;
  }
}

@media (max-width: 620px) {
  table {
    min-width: 0;
    table-layout: fixed;
  }

  th,
  td {
    overflow: hidden;
    padding: 8px 6px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .col-select {
    width: 40px;
  }

  .col-status {
    width: 82px;
  }

  .col-amount {
    width: 74px;
  }

  .col-due,
  .col-owner {
    display: none;
  }

  .col-open {
    width: 66px;
  }
}
</style>
