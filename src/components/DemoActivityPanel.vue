<template>
  <article class="tools-panel activity-panel">
    <div class="panel-heading">
      <p class="eyebrow">Recent events</p>
      <h2>Activity trail</h2>
    </div>
    <div v-for="item in activity" :key="item.id" class="activity-row" :class="item.tone">
      <strong>{{ item.title }}</strong>
      <span>{{ item.detail }}</span>
    </div>
    <div ref="devtoolsHost" class="devtools-host" />
  </article>
</template>

<script setup lang="ts">
import { ref } from 'vue'

import type { ActivityItem } from '@/interfaces/demo'

interface Props {
  activity: ActivityItem[]
}

withDefaults(defineProps<Props>(), {})
const devtoolsHost = ref<HTMLElement | null>(null)

defineExpose({
  devtoolsHost
})
</script>

<style scoped>
.tools-panel {
  padding: clamp(18px, 3vw, 28px);
  border: 1px solid rgba(244, 240, 232, 0.14);
  background: rgba(12, 17, 16, 0.72);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.26);
  backdrop-filter: blur(18px);
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

.activity-row {
  display: grid;
  gap: 4px;
  padding: 12px 0;
  border-top: 1px solid rgba(244, 240, 232, 0.1);
}

.activity-row.success strong {
  color: #30a779;
}

.activity-row.warning strong {
  color: #e8be53;
}

.activity-row.error strong {
  color: #d85d3f;
}

.devtools-host {
  margin-top: 16px;
}
</style>
