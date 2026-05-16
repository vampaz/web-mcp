<template>
  <section class="settings-panel">
    <div class="panel-heading">
      <p class="eyebrow">App settings</p>
      <h2>Assistant behavior</h2>
    </div>

    <label class="toggle-row">
      <input :checked="settings.confirmationsEnabled" type="checkbox" @change="updateBoolean('confirmationsEnabled', $event)" />
      Require confirmations
    </label>

    <label class="toggle-row">
      <input :checked="settings.notificationsEnabled" type="checkbox" @change="updateBoolean('notificationsEnabled', $event)" />
      Activity notifications
    </label>

    <label>
      Density
      <select :value="settings.density" @change="updateDensity">
        <option value="compact">Compact</option>
        <option value="comfortable">Comfortable</option>
      </select>
    </label>

    <label>
      Confidence threshold
      <input :value="settings.plannerConfidence" type="range" min="0" max="100" @input="updateConfidence" />
      <strong>{{ settings.plannerConfidence }}%</strong>
    </label>
  </section>
</template>

<script setup lang="ts">
import type { DemoSettings } from '@/interfaces/demo'

interface Props {
  settings: DemoSettings
}

withDefaults(defineProps<Props>(), {})
const emit = defineEmits<{
  'update:settings': [settings: Partial<DemoSettings>]
}>()

function updateBoolean(key: 'confirmationsEnabled' | 'notificationsEnabled', event: Event) {
  emit('update:settings', {
    [key]: event.target instanceof HTMLInputElement && event.target.checked
  })
}

function updateDensity(event: Event) {
  emit('update:settings', {
    density: event.target instanceof HTMLSelectElement ? event.target.value as DemoSettings['density'] : 'compact'
  })
}

function updateConfidence(event: Event) {
  emit('update:settings', {
    plannerConfidence: event.target instanceof HTMLInputElement ? Number(event.target.value) : 0
  })
}
</script>

<style scoped>
.settings-panel {
  display: grid;
  gap: 14px;
  padding: clamp(18px, 3vw, 28px);
  border: 1px solid rgba(244, 240, 232, 0.14);
  background: rgba(12, 17, 16, 0.72);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.26);
  backdrop-filter: blur(18px);
}

.panel-heading {
  display: grid;
  gap: 8px;
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
}

label {
  display: grid;
  gap: 6px;
  color: #c9d1cb;
}

.toggle-row {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
}

input,
select {
  accent-color: #30a779;
}

select {
  min-height: 38px;
  padding: 8px 10px;
  border: 1px solid rgba(244, 240, 232, 0.18);
  background: #f4f0e8;
  color: #0c1110;
  font: inherit;
}
</style>
