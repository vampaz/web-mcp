<template>
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
</template>

<script setup lang="ts">
interface Props {
  plannerDetail: string
  plannerName: string
  registeredToolsCount: number
  supportLabel: string
}

withDefaults(defineProps<Props>(), {})
</script>

<style scoped>
.status-strip {
  position: fixed;
  right: 16px;
  bottom: 12px;
  left: 16px;
  z-index: 1001;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  width: min(1440px, calc(100% - 32px));
  margin: 0 auto;
  border: 1px solid rgba(244, 240, 232, 0.14);
  background: rgba(8, 12, 11, 0.96);
  box-shadow: 0 -16px 48px rgba(0, 0, 0, 0.36);
  backdrop-filter: blur(18px);
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
