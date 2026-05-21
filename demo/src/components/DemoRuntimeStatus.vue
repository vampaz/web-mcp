<template>
  <section
    class="diagnostics-content"
    aria-label="Developer diagnostics"
    data-webmcp-diagnostics
  >
    <section class="status-strip" aria-label="Runtime status">
      <div>
        <span>WebMCP</span>
        <strong>{{ supportLabel }}</strong>
        <small>{{ nativeSupportDetail }}</small>
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
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

interface Props {
  plannerDetail: string
  plannerName: string
  registeredToolsCount: number
  supportLabel: string
}

const props = withDefaults(defineProps<Props>(), {})
const devtoolsHost = ref<HTMLElement | null>(null)
const nativeSupportDetail = computed(function getNativeSupportDetail() {
  if (props.supportLabel.toLowerCase().includes('native')) {
    return 'Native browser tools are live. Cross-check in Chrome DevTools or the WebMCP extension.'
  }

  return 'Fallback simulation. Enable chrome://flags/#enable-webmcp-testing, then verify with Chrome DevTools or the WebMCP extension.'
})

defineExpose({
  devtoolsHost
})
</script>

<style scoped>
.diagnostics-content {
  background: #09110e;
}

.status-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  width: 100%;
  border-top: 1px solid rgba(224, 234, 229, 0.12);
  border-bottom: 1px solid rgba(224, 234, 229, 0.1);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.015));
}

.status-strip div {
  display: flex;
  min-width: 0;
  gap: 10px;
  align-items: center;
  overflow: hidden;
  padding: 10px 12px;
  border-right: 1px solid rgba(224, 234, 229, 0.1);
}

.status-strip div:last-child {
  border-right: 0;
}

.status-strip span,
.status-strip small {
  color: #9aa8a1;
  font-size: 0.78rem;
}

.status-strip span {
  font-weight: 800;
  text-transform: uppercase;
}

.status-strip strong {
  color: #f7faf8;
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
  border-top: 1px solid rgba(224, 234, 229, 0.08);
}

@media (max-width: 980px) {
  .status-strip {
    grid-template-columns: 1fr;
  }

  .status-strip div {
    border-right: 0;
    border-bottom: 1px solid rgba(224, 234, 229, 0.1);
  }

  .status-strip div:last-child {
    border-bottom: 0;
  }
}
</style>
