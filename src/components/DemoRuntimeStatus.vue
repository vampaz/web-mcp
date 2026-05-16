<template>
  <details class="diagnostics-panel">
    <summary>Developer diagnostics</summary>

    <section class="status-strip" aria-label="Runtime status">
      <div>
        <span>WebMCP</span>
        <strong>{{ supportLabel }}</strong>
      </div>
      <div>
        <span>Planner</span>
        <strong>{{ plannerName }}</strong>
        <small>{{ plannerDetail }}</small>
      </div>
      <div>
        <span>Registered tools</span>
        <strong>{{ registeredToolsCount }}</strong>
      </div>
    </section>

    <div ref="devtoolsHost" class="devtools-host" />
  </details>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface Props {
  plannerDetail: string
  plannerName: string
  registeredToolsCount: number
  supportLabel: string
}

withDefaults(defineProps<Props>(), {})
const devtoolsHost = ref<HTMLElement | null>(null)

defineExpose({
  devtoolsHost
})
</script>

<style scoped>
.diagnostics-panel {
  margin-top: 16px;
  border: 1px solid rgba(244, 240, 232, 0.14);
  background: rgba(8, 12, 11, 0.86);
}

.diagnostics-panel summary {
  padding: 9px 10px;
  cursor: pointer;
  color: #9ea8a1;
  font-size: 0.78rem;
  font-weight: 900;
  text-transform: uppercase;
}

.status-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  width: 100%;
  border-top: 1px solid rgba(244, 240, 232, 0.14);
  background: rgba(8, 12, 11, 0.96);
}

.status-strip div {
  display: flex;
  min-width: 0;
  gap: 8px;
  align-items: center;
  overflow: hidden;
  padding: 8px 10px;
  border-right: 1px solid rgba(244, 240, 232, 0.12);
}

.status-strip div:last-child {
  border-right: 0;
}

.status-strip span,
.status-strip small {
  color: #9ea8a1;
  font-size: 0.78rem;
}

.status-strip span {
  text-transform: uppercase;
}

.status-strip strong {
  color: #f4f0e8;
  min-width: 0;
  font-size: 0.92rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-strip small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.devtools-host {
  border-top: 1px solid rgba(244, 240, 232, 0.14);
}

@media (max-width: 980px) {
  .status-strip {
    grid-template-columns: 1fr;
  }

  .status-strip div {
    border-right: 0;
    border-bottom: 1px solid rgba(244, 240, 232, 0.12);
  }

  .status-strip div:last-child {
    border-bottom: 0;
  }
}
</style>
