<template>
  <section class="selection-panel primary-selection">
    <div class="selection-header">
      <div class="panel-heading">
        <p class="eyebrow">Main demo surface</p>
        <h2>Selectable item list</h2>
      </div>

      <div class="selection-summary">
        <strong>{{ selectedCount }} selected</strong>
        <span v-if="hasResult">{{ resultTitle }}. {{ resultSummary }}</span>
        <span v-else>Use the command palette to select by meaning, category, position, or clear the list.</span>
      </div>
    </div>

    <div v-if="isCommandRunning || hasResult" class="surface-result" :class="outcomeTone" aria-live="polite">
      <span>{{ outcomeLabel }}</span>
      <strong>{{ resultTitle }}</strong>
      <em>{{ resultDetail }}</em>
    </div>

    <div class="checklist-grid">
      <label v-for="(item, index) in items" :key="item.id" class="checklist-item" :class="{ selected: item.selected }">
        <input :checked="item.selected" type="checkbox" @change="setItemSelected(item.id, $event)" />
        <span>{{ index + 1 }}. {{ item.name }}</span>
      </label>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { SelectableItem } from '@/interfaces/demo'

interface Props {
  hasResult: boolean
  isCommandRunning: boolean
  items: SelectableItem[]
  outcomeLabel: string
  outcomeTone: string
  resultDetail: string
  resultSummary: string
  resultTitle: string
  selectedCount: number
}

withDefaults(defineProps<Props>(), {})
const emit = defineEmits<{
  'set-item-selected': [id: string, selected: boolean]
}>()

function setItemSelected(id: string, event: Event) {
  emit('set-item-selected', id, event.target instanceof HTMLInputElement && event.target.checked)
}
</script>

<style scoped>
.selection-panel {
  display: grid;
  gap: 16px;
  margin-top: 16px;
  padding: 14px;
  border: 1px solid rgba(48, 167, 121, 0.34);
  background: rgba(9, 18, 15, 0.82);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.26);
  backdrop-filter: blur(18px);
}

.selection-header {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 24px;
  align-items: start;
  justify-content: space-between;
}

.panel-heading {
  display: grid;
  gap: 8px;
  margin-bottom: 18px;
}

.eyebrow {
  margin: 0;
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

.selection-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 18px;
  align-items: baseline;
  color: #c9d1cb;
}

.selection-summary strong {
  color: #30a779;
  font-size: 1rem;
}

.selection-summary span {
  color: #9ea8a1;
}

.surface-result {
  display: grid;
  grid-template-columns: auto minmax(0, auto) minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  padding: 9px 10px;
  border: 1px solid rgba(244, 240, 232, 0.12);
  background: rgba(244, 240, 232, 0.04);
}

.surface-result span {
  color: #9ea8a1;
  font-size: 0.76rem;
  font-weight: 900;
  text-transform: uppercase;
}

.surface-result strong {
  color: #f4f0e8;
}

.surface-result em {
  min-width: 0;
  overflow: hidden;
  color: #9ea8a1;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.surface-result.success {
  border-color: rgba(48, 167, 121, 0.42);
  background: rgba(48, 167, 121, 0.12);
}

.surface-result.error,
.surface-result.failed {
  border-color: rgba(216, 93, 63, 0.52);
  background: rgba(216, 93, 63, 0.12);
}

.surface-result.running {
  border-color: rgba(90, 176, 224, 0.52);
  background: rgba(90, 176, 224, 0.12);
}

.checklist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  grid-auto-rows: 56px;
  gap: 8px;
}

.checklist-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  block-size: 100%;
  min-height: 0;
  padding: 8px 10px;
  border: 1px solid rgba(244, 240, 232, 0.12);
  background: rgba(244, 240, 232, 0.05);
  overflow: hidden;
}

.checklist-item.selected {
  border-color: rgba(48, 167, 121, 0.7);
  background: rgba(48, 167, 121, 0.16);
}

.checklist-item input {
  inline-size: 18px;
  block-size: 18px;
  accent-color: #30a779;
}

.checklist-item span {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: #f4f0e8;
  font-size: 0.96rem;
  line-height: 1.2;
  overflow: hidden;
  overflow-wrap: anywhere;
}

@media (max-width: 620px) {
  .checklist-grid {
    grid-template-columns: 1fr;
  }
}
</style>
