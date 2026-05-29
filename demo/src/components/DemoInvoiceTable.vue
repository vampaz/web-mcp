<template>
  <section class="invoice-workspace" :class="density">
    <div class="workspace-header">
      <div>
        <h2>Invoice list</h2>
      </div>
      <div class="workspace-summary">
        <strong>{{ selectedCount }} selected</strong>
        <span>{{ filteredCount }} visible of {{ totalCount }}</span>
      </div>
    </div>

    <div class="table-controls">
      <label>
        Search
        <input
          :value="filters.query"
          type="search"
          placeholder="Customer, owner, status..."
          @input="updateQuery"
        />
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
      <button type="button" :disabled="selectedCount === 0" @click="markSelected('sent')">
        Mark sent
      </button>
      <button type="button" :disabled="selectedCount === 0" @click="markSelected('paid')">
        Mark paid
      </button>
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
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="invoice in invoices"
            :key="invoice.id"
            :aria-current="invoice.id === activeInvoiceId ? 'true' : undefined"
            :class="{ selected: invoice.selected, active: invoice.id === activeInvoiceId }"
            tabindex="0"
            @click="openInvoice(invoice.id)"
            @keydown.enter.prevent="openInvoice(invoice.id)"
            @keydown.space.prevent="openInvoice(invoice.id)"
          >
            <td class="col-select" @click.stop>
              <input
                :checked="invoice.selected"
                type="checkbox"
                :aria-label="`Select ${invoice.customerName}`"
                @change="toggleInvoice(invoice.id, $event)"
              />
            </td>
            <td>
              <strong>{{ invoice.customerName }}</strong>
              <span>{{ invoice.id }} · {{ invoice.risk }} risk</span>
            </td>
            <td class="col-status">
              <span class="status" :class="invoice.status">{{ invoice.status }}</span>
            </td>
            <td class="col-amount">€{{ invoice.amount }}</td>
            <td class="col-due">{{ invoice.dueDate }}</td>
            <td class="col-owner">{{ invoice.owner }}</td>
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
  align-content: start;
  gap: clamp(0.75rem, 1.5vw, 1rem);
  height: 100%;
  min-width: 0;
  overflow: hidden;
  padding: clamp(0.9rem, 1.8vw, 1.25rem);
  border: 1px solid var(--demo-rule-strong);
  background: var(--demo-paper-wash);
}

.workspace-header,
.workspace-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 18px;
  align-items: baseline;
  justify-content: space-between;
}

.workspace-header {
  min-block-size: 2.35rem;
}

.bulk-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

h2 {
  margin: 0;
  font-size: clamp(1.05rem, 1.5vw, 1.32rem);
  letter-spacing: 0;
}

.workspace-summary strong {
  color: var(--demo-blue);
}

.workspace-summary span {
  color: var(--demo-muted);
}

.table-controls {
  display: grid;
  grid-template-columns: minmax(min(100%, 18rem), 1fr) minmax(9rem, 0.42fr) minmax(13rem, 0.58fr);
  gap: 8px;
  align-items: end;
}

.table-controls label,
.sort-controls {
  display: grid;
  gap: 5px;
  min-width: 0;
  color: var(--demo-muted);
  font-size: 0.84rem;
}

.sort-controls {
  grid-template-columns: minmax(0, 1fr) minmax(2.65rem, max-content);
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
  min-block-size: 2.25rem;
  border: 1px solid var(--demo-rule-strong);
  font: inherit;
}

input,
select {
  min-width: 0;
  padding: 0.44rem 0.56rem;
  background: var(--demo-paper);
  color: var(--demo-ink);
}

input[type='checkbox'] {
  inline-size: 1.25rem;
  block-size: 1.25rem;
  padding: 0;
}

button {
  padding: 0.44rem 0.62rem;
  background: transparent;
  color: var(--demo-blue);
}

.sort-direction {
  display: grid;
  min-inline-size: 2.65rem;
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
  border: 1px solid var(--demo-blue-rule);
  background: rgba(36, 88, 255, 0.035);
}

table {
  width: 100%;
  border-collapse: collapse;
  min-inline-size: min(100%, 48.75rem);
}

th,
td {
  padding: 0.62rem;
  border-bottom: 1px solid var(--demo-rule);
  text-align: left;
  vertical-align: middle;
}

th {
  color: var(--demo-muted);
  font-size: 0.74rem;
  text-transform: uppercase;
}

tr.selected,
tr.active {
  background: var(--demo-blue-soft);
}

tbody tr {
  cursor: pointer;
  transition:
    background 120ms ease,
    box-shadow 120ms ease;
}

tbody tr:hover {
  background: var(--demo-blue-wash);
}

tbody tr.active,
tbody tr.active:hover {
  background: var(--demo-blue-soft);
}

tbody tr:focus-visible {
  outline: 2px solid var(--demo-blue);
  outline-offset: -2px;
}

tbody tr.active {
  box-shadow: inset 3px 0 0 var(--demo-blue);
}

td strong,
td span {
  display: block;
}

td span {
  color: var(--demo-muted);
  font-size: 0.78rem;
}

.status {
  display: inline-block;
  padding: 0.12rem 0.38rem;
  border: 1px solid var(--demo-rule-strong);
  color: var(--demo-ink);
  text-transform: uppercase;
}

.status.overdue {
  color: var(--demo-danger);
}

.status.paid {
  color: var(--demo-good);
}

.compact th,
.compact td {
  padding: 0.44rem 0.56rem;
}

@media (max-width: 980px) {
  .table-controls {
    grid-template-columns: 1fr;
  }

  .sort-controls {
    grid-template-columns: minmax(0, 1fr) minmax(2.65rem, max-content);
  }
}

@media (max-width: 620px) {
  input:not([type='checkbox']),
  select,
  button {
    min-block-size: 2.5rem;
  }

  table {
    min-width: 0;
    table-layout: fixed;
  }

  th,
  td {
    overflow: hidden;
    padding: 0.5rem 0.38rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .col-select {
    inline-size: 2.5rem;
  }

  .col-status {
    inline-size: 8ch;
  }

  .col-amount {
    inline-size: 8ch;
  }

  .col-due,
  .col-owner {
    display: none;
  }
}
</style>
