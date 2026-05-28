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
  max-height: max(24rem, calc(100svh - 19rem));
  min-width: 0;
  overflow: hidden;
  padding: clamp(0.9rem, 1.8vw, 1.25rem);
  border: 1px solid rgba(244, 240, 232, 0.12);
  background: rgba(12, 17, 16, 0.82);
  backdrop-filter: blur(18px);
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
  max-width: 42rem;
  margin: 0.35rem 0 0;
  color: #9ea8a1;
}

.inventory-summary strong {
  color: #30a779;
}

.inventory-summary span {
  color: #9ea8a1;
}

.inventory-actions {
  align-items: center;
}

button {
  min-height: 34px;
  padding: 6px 10px;
  border: 1px solid rgba(244, 240, 232, 0.18);
  background: rgba(244, 240, 232, 0.06);
  color: #f4f0e8;
  font: inherit;
}

.table-shell {
  min-width: 0;
  min-height: 0;
  max-width: 100%;
  overflow: auto;
  border: 1px solid rgba(244, 240, 232, 0.12);
  background: rgba(244, 240, 232, 0.025);
}

table {
  width: 100%;
  min-width: 820px;
  border-collapse: collapse;
}

th,
td {
  padding: 10px;
  border-bottom: 1px solid rgba(244, 240, 232, 0.1);
  text-align: left;
  vertical-align: middle;
}

thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #131816;
  color: #9ea8a1;
  font-size: 0.74rem;
  font-weight: 600;
  text-transform: uppercase;
}

tbody tr {
  transition: background 120ms ease;
}

tbody tr:hover {
  background: rgba(244, 240, 232, 0.055);
}

tbody tr.selected,
tbody tr.selected:hover {
  background: rgba(48, 167, 121, 0.13);
}

input {
  width: 20px;
  height: 20px;
  margin: 0;
}

tbody th {
  font-weight: inherit;
}

tbody th strong {
  display: block;
  min-width: 0;
  overflow-wrap: anywhere;
  color: #f4f0e8;
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
  color: #8fa098;
  text-align: right;
}

.col-stock,
.col-margin {
  text-align: right;
}

.demand {
  display: inline-block;
  padding: 2px 6px;
  border: 1px solid rgba(244, 240, 232, 0.16);
  color: #c9d1cb;
  font-size: 0.73rem;
  text-transform: uppercase;
}

.demand.high {
  color: #30a779;
}

.demand.low {
  color: #e8be53;
}

@media (max-width: 620px) {
  .semantic-inventory {
    padding: 12px;
  }

  button {
    min-height: 40px;
  }

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
    width: 44px;
  }

  .col-position {
    width: 36px;
  }

  .col-stock {
    width: 74px;
  }

  .col-demand {
    width: 76px;
  }

  .col-margin {
    width: 64px;
  }

  .col-supplier,
  .col-margin {
    display: none;
  }
}
</style>
