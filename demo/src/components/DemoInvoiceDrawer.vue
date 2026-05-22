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
import type { Invoice, InvoiceDraft } from '@/interfaces/demo'

interface Props {
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
  height: 100%;
  padding: clamp(0.9rem, 1.8vw, 1.25rem);
  border: 1px solid rgba(244, 240, 232, 0.12);
  background: rgba(12, 17, 16, 0.82);
  backdrop-filter: blur(18px);
}

.panel-heading {
  display: grid;
  gap: 8px;
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
  gap: 4px;
  padding: 10px;
  border: 1px solid rgba(48, 167, 121, 0.34);
  background: rgba(48, 167, 121, 0.12);
}

.active-record span {
  color: #9ea8a1;
}

.invoice-form {
  display: grid;
  gap: 10px;
}

label {
  display: grid;
  gap: 5px;
  color: #c9d1cb;
  font-size: 0.88rem;
}

input,
select,
button {
  min-height: 38px;
  border: 1px solid rgba(244, 240, 232, 0.18);
  font: inherit;
}

input,
select {
  min-width: 0;
  padding: 8px 10px;
  background: #f4f0e8;
  color: #0c1110;
}

button {
  border-color: #e8be53;
  background: #e8be53;
  color: #0c1110;
  font-weight: 900;
}
</style>
