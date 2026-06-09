<template>
  <aside class="invoice-drawer">
    <div class="panel-heading">
      <h2>{{ activeInvoice ? 'Invoice detail' : 'New invoice' }}</h2>
    </div>

    <div v-if="activeInvoice" class="active-record">
      <strong>{{ activeInvoice.customerName }}</strong>
      <span
        >{{ activeInvoice.status }} · €{{ activeInvoice.amount }} · due
        {{ activeInvoice.dueDate }}</span
      >
      <small v-if="activeCustomer">
        {{ activeCustomer.accountTier }} account · {{ activeCustomer.health }} health · €{{
          activeCustomer.outstandingBalance
        }}
        open
      </small>
    </div>

    <form class="invoice-form" @submit.prevent="submitDraft">
      <label>
        Customer
        <input :value="draft.customerName" @input="updateDraft('customerName', $event)" />
      </label>
      <label>
        Amount
        <input :value="draft.amount" type="number" min="1" @input="updateDraft('amount', $event)" />
      </label>
      <label>
        Due date
        <input :value="draft.dueDate" type="date" @input="updateDraft('dueDate', $event)" />
      </label>
      <label>
        Owner
        <select :value="draft.owner" @change="updateDraft('owner', $event)">
          <option>Carlos</option>
          <option>Marta</option>
          <option>Rui</option>
          <option>Sofia</option>
        </select>
      </label>
      <label>
        Status
        <select :value="draft.status" @change="updateDraft('status', $event)">
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="overdue">Overdue</option>
          <option value="paid">Paid</option>
        </select>
      </label>
      <button type="submit">Create invoice</button>
    </form>
  </aside>
</template>

<script setup lang="ts">
import type { Customer, Invoice, InvoiceDraft } from '@/interfaces/demo'

interface Props {
  activeCustomer: Customer | undefined
  activeInvoice: Invoice | undefined
  draft: InvoiceDraft
}

withDefaults(defineProps<Props>(), {})
const emit = defineEmits<{
  'create-invoice': []
  'update:draft': [draft: Partial<InvoiceDraft>]
}>()

function submitDraft() {
  emit('create-invoice')
}

function updateDraft(key: keyof InvoiceDraft, event: Event) {
  const value = getInputValue(event)
  emit('update:draft', {
    [key]: key === 'amount' ? Number(value) : value
  })
}

function getInputValue(event: Event): string {
  return event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement
    ? event.target.value
    : ''
}
</script>

<style scoped>
.invoice-drawer {
  display: grid;
  align-content: start;
  gap: clamp(0.75rem, 1.5vw, 1rem);
  padding: clamp(0.9rem, 1.8vw, 1.25rem);
  border: 1px solid var(--demo-rule-strong);
  background: var(--demo-paper-wash);
}

.panel-heading {
  display: grid;
  gap: 0.5rem;
  min-block-size: 2.35rem;
  align-items: center;
}

h2 {
  margin: 0;
  font-size: clamp(1.05rem, 1.5vw, 1.32rem);
  letter-spacing: 0;
}

.active-record {
  display: grid;
  gap: 0.25rem;
  padding: 0.62rem;
  border: 1px solid var(--demo-blue);
  background: var(--demo-blue-soft);
}

.active-record span {
  color: var(--demo-muted);
}

.active-record small {
  color: var(--demo-blue);
  text-transform: capitalize;
}

.invoice-form {
  display: grid;
  gap: 0.62rem;
}

label {
  display: grid;
  gap: 0.32rem;
  color: var(--demo-muted);
  font-size: 0.88rem;
}

input,
select,
button {
  min-block-size: 2.38rem;
  border: 1px solid var(--demo-rule-strong);
  font: inherit;
}

input,
select {
  min-width: 0;
  padding: 0.5rem 0.62rem;
  background: var(--demo-paper);
  color: var(--demo-ink);
  font-size: 1rem;
}

button {
  border-color: var(--demo-blue);
  background: var(--demo-blue);
  color: var(--demo-paper-wash);
  font-weight: 900;
}
</style>
