<template>
  <section class="semantic-inventory" aria-labelledby="inventory-title">
    <div class="inventory-header">
      <div>
        <h2 id="inventory-title">Inventory</h2>
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

    <ul class="inventory-grid" aria-label="Selectable inventory items">
      <li v-for="(item, index) in items" :key="item.id" :class="{ selected: item.selected }">
        <label>
          <input :checked="item.selected" type="checkbox" :aria-label="`Select ${item.name}`" @change="toggleItem(item.id, $event)" />
          <span>{{ index + 1 }}.</span>
          <strong>{{ item.name }}</strong>
        </label>
      </li>
    </ul>
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
  gap: 12px;
  min-width: 0;
  margin-top: 10px;
  padding: 14px;
  border: 1px solid rgba(48, 167, 121, 0.4);
  background: rgba(9, 18, 15, 0.86);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.26);
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

.inventory-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  grid-auto-rows: 58px;
  gap: 8px;
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.inventory-grid li {
  min-width: 0;
  min-height: 0;
  border: 1px solid rgba(244, 240, 232, 0.14);
  background: rgba(244, 240, 232, 0.045);
}

.inventory-grid li.selected {
  border-color: rgba(48, 167, 121, 0.62);
  background: rgba(48, 167, 121, 0.16);
}

label {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  min-height: 100%;
  padding: 8px 10px;
}

input {
  width: 15px;
  height: 15px;
  margin: 0;
}

label span {
  color: #c9d1cb;
}

label strong {
  min-width: 0;
  overflow-wrap: anywhere;
  color: #f4f0e8;
  font-size: 0.98rem;
}

@media (max-width: 620px) {
  .semantic-inventory {
    padding: 12px;
  }

  .inventory-grid {
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  }
}
</style>
