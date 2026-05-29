<template>
  <section class="semantic-inventory" aria-labelledby="inventory-title">
    <div class="inventory-header">
      <div>
        <h2 id="inventory-title">Inventory list</h2>
        <p>Merchandising context includes aisle, stock, supplier, demand, and margin.</p>
      </div>
      <div class="inventory-summary">
        <strong>{{ selectedCount }} selected</strong>
        <span>{{ items.length }} visible</span>
      </div>
    </div>

    <div class="inventory-actions">
      <button type="button" @click="selectAll">Select all</button>
      <button type="button" @click="clearSelection">Clear</button>
    </div>

    <div class="table-shell">
      <table aria-label="Selectable inventory items">
        <thead>
          <tr>
            <th class="col-select" scope="col">Select</th>
            <th class="col-position" scope="col">#</th>
            <th scope="col">Item</th>
            <th scope="col">Aisle</th>
            <th class="col-stock" scope="col">Stock</th>
            <th class="col-supplier" scope="col">Supplier</th>
            <th class="col-demand" scope="col">Demand</th>
            <th class="col-margin" scope="col">Margin</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, index) in items" :key="item.id" :class="{ selected: item.selected }">
            <td class="col-select">
              <input
                :checked="item.selected"
                type="checkbox"
                :aria-label="`Select ${item.name}`"
                @change="toggleItem(item.id, $event)"
              />
            </td>
            <td class="col-position">{{ index + 1 }}</td>
            <th scope="row">
              <strong>{{ item.name }}</strong>
            </th>
            <td>{{ item.aisle }}</td>
            <td class="col-stock">{{ item.stock }} units</td>
            <td class="col-supplier">{{ item.supplier }}</td>
            <td class="col-demand">
              <span class="demand" :class="item.demand">{{ item.demand }}</span>
            </td>
            <td class="col-margin">{{ item.margin }}%</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { SelectableItem } from '@/interfaces/demo'

interface Props {
  items: SelectableItem[]
  selectedCount: number
}

withDefaults(defineProps<Props>(), {})
const emit = defineEmits<{
  'clear-selection': []
  'select-all': []
  'toggle-item': [id: string, selected: boolean]
}>()

function clearSelection() {
  emit('clear-selection')
}

function selectAll() {
  emit('select-all')
}

function toggleItem(id: string, event: Event) {
  emit('toggle-item', id, event.target instanceof HTMLInputElement && event.target.checked)
}
</script>

<style scoped>
.semantic-inventory {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: clamp(0.75rem, 1.5vw, 1rem);
  max-block-size: max(24rem, calc(100svh - 19rem));
  min-width: 0;
  overflow: hidden;
  padding: clamp(0.9rem, 1.8vw, 1.25rem);
  border: 1px solid var(--demo-rule-strong);
  background: var(--demo-paper-wash);
}

.inventory-header,
.inventory-summary,
.inventory-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  align-items: baseline;
}

.inventory-header {
  justify-content: space-between;
}

h2 {
  margin: 0;
  font-size: clamp(1.05rem, 1.5vw, 1.32rem);
  letter-spacing: 0;
}

.inventory-header p {
  max-inline-size: 42rem;
  margin: 0.35rem 0 0;
  color: var(--demo-muted);
}

.inventory-summary strong {
  color: var(--demo-blue);
}

.inventory-summary span {
  color: var(--demo-muted);
}

.inventory-actions {
  align-items: center;
}

button {
  min-block-size: 2.12rem;
  padding: 0.38rem 0.62rem;
  border: 1px solid var(--demo-blue);
  background: transparent;
  color: var(--demo-blue);
  font: inherit;
}

.table-shell {
  min-width: 0;
  min-height: 0;
  max-width: 100%;
  overflow: auto;
  border: 1px solid var(--demo-blue-rule);
  background: rgba(36, 88, 255, 0.035);
}

table {
  width: 100%;
  min-inline-size: min(100%, 51.25rem);
  border-collapse: collapse;
}

th,
td {
  padding: 0.62rem;
  border-bottom: 1px solid var(--demo-rule);
  text-align: left;
  vertical-align: middle;
}

thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--demo-paper-deep);
  color: var(--demo-muted);
  font-size: 0.74rem;
  font-weight: 600;
  text-transform: uppercase;
}

tbody tr {
  transition: background 120ms ease;
}

tbody tr:hover {
  background: var(--demo-blue-wash);
}

tbody tr.selected,
tbody tr.selected:hover {
  background: var(--demo-blue-soft);
}

input {
  inline-size: 1.25rem;
  block-size: 1.25rem;
  margin: 0;
}

tbody th {
  font-weight: inherit;
}

tbody th strong {
  display: block;
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--demo-ink);
  font-size: 0.98rem;
  font-weight: 500;
}

.col-select,
.col-position,
.col-stock,
.col-demand,
.col-margin {
  white-space: nowrap;
}

.col-select {
  width: 1%;
}

.col-position {
  color: var(--demo-muted);
  text-align: right;
}

.col-stock,
.col-margin {
  text-align: right;
}

.demand {
  display: inline-block;
  padding: 0.12rem 0.38rem;
  border: 1px solid var(--demo-rule-strong);
  color: var(--demo-muted);
  font-size: 0.73rem;
  text-transform: uppercase;
}

.demand.high {
  color: var(--demo-good);
}

.demand.low {
  color: var(--demo-warn);
}

@media (max-width: 620px) {
  .semantic-inventory {
    padding: 0.75rem;
  }

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
    inline-size: 2.75rem;
  }

  .col-position {
    inline-size: 4ch;
  }

  .col-stock {
    inline-size: 7ch;
  }

  .col-demand {
    inline-size: 8ch;
  }

  .col-margin {
    inline-size: 7ch;
  }

  .col-supplier,
  .col-margin {
    display: none;
  }
}
</style>
