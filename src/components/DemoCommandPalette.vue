<template>
  <section class="assistant-bar" aria-label="WebMCP command assistant">
    <article class="command-palette">
      <form class="palette-command" @submit.prevent="submitCommand">
        <label class="palette-input-shell">
          <span>WebMCP</span>
          <input
            :value="prompt"
            type="text"
            aria-label="Natural language command"
            autocomplete="off"
            spellcheck="false"
            placeholder="Try: Select all French items"
            @input="updatePrompt"
          />
        </label>

        <button class="palette-run" type="submit" :disabled="isCommandRunning || !prompt.trim()" :aria-busy="isCommandRunning">
          {{ commandButtonLabel }}
        </button>
      </form>
      <p class="visually-hidden" aria-live="polite" aria-atomic="true">
        {{ commandStatusLabel }}
      </p>

      <details class="palette-settings">
        <summary>
          <span>Options</span>
        </summary>

        <div class="palette-settings-row">
          <label>
            Provider
            <select :value="plannerProvider" @change="updatePlannerProvider">
              <option value="auto">Auto</option>
              <option value="chrome-built-in">Chrome built-in AI</option>
              <option value="local">Local deterministic</option>
              <option value="openrouter">OpenRouter</option>
              <option value="openai">OpenAI</option>
              <option value="openai-compatible">OpenAI-compatible</option>
              <option v-if="showCloudflareBinding" value="cloudflare-binding">Cloudflare binding</option>
              <option value="cloudflare-workers-ai">Cloudflare Workers AI (REST)</option>
            </select>
          </label>

          <label v-if="plannerProvider === 'cloudflare-binding'">
            Model
            <select :value="plannerModel" @change="updatePlannerModel">
              <option v-for="model in cloudflareBindingModels" :key="model.id" :value="model.id">
                {{ model.label }}
              </option>
            </select>
          </label>

          <label v-else-if="usesRemotePlanner">
            Model
            <input :value="plannerModel" type="text" @input="updatePlannerModel" />
          </label>

          <div v-else class="planner-readout">
            <span>Model</span>
            <strong>{{ plannerProvider === 'auto' ? 'Best available' : 'Managed by provider' }}</strong>
          </div>

          <div class="planner-readout">
            <span>Planner</span>
            <strong>{{ plannerName }}</strong>
            <em>{{ plannerModelLabel }}</em>
          </div>
        </div>
      </details>
    </article>
  </section>
</template>

<script setup lang="ts">
import type { PlannerProviderKind } from '@webmcp-kit/core'

import type { PlannerModelOption } from '@/interfaces/demo'

interface Props {
  cloudflareBindingModels: PlannerModelOption[]
  commandButtonLabel: string
  commandStatusLabel: string
  isCommandRunning: boolean
  plannerModel: string
  plannerModelLabel: string
  plannerName: string
  plannerProvider: PlannerProviderKind
  prompt: string
  showCloudflareBinding: boolean
  usesRemotePlanner: boolean
}

withDefaults(defineProps<Props>(), {})
const emit = defineEmits<{
  run: []
  'update:plannerModel': [value: string]
  'update:plannerProvider': [value: PlannerProviderKind]
  'update:prompt': [value: string]
}>()

function submitCommand() {
  emit('run')
}

function updatePrompt(event: Event) {
  emit('update:prompt', getInputValue(event))
}

function updatePlannerModel(event: Event) {
  emit('update:plannerModel', getInputValue(event))
}

function updatePlannerProvider(event: Event) {
  emit('update:plannerProvider', getInputValue(event) as PlannerProviderKind)
}

function getInputValue(event: Event): string {
  return event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement
    ? event.target.value
    : ''
}
</script>

<style scoped>
.assistant-bar {
  position: sticky;
  top: 10px;
  z-index: 1000;
  display: flex;
  justify-content: center;
  margin: 0 0 12px;
  pointer-events: none;
}

.command-palette {
  display: flex;
  flex-direction: column;
  width: min(920px, 100%);
  border: 1px solid rgba(244, 240, 232, 0.2);
  background: rgba(8, 13, 12, 0.96);
  box-shadow: 0 22px 80px rgba(0, 0, 0, 0.48);
  backdrop-filter: blur(22px);
  pointer-events: auto;
}

.palette-command {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  padding: 8px;
}

.palette-input-shell {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
  min-height: 42px;
  padding: 0 12px;
  border: 1px solid rgba(244, 240, 232, 0.28);
  background: #f4f0e8;
  color: #0c1110;
}

.palette-input-shell span {
  flex: 0 0 auto;
  color: rgba(12, 17, 16, 0.62);
  font-size: 0.78rem;
  font-weight: 900;
  text-transform: uppercase;
}

.palette-input-shell input {
  flex: 1;
  min-width: 0;
  min-height: 40px;
  border: 0;
  outline: 0;
  background: transparent;
  color: #0c1110;
  font: inherit;
}

.palette-input-shell:focus-within {
  outline: 2px solid #e8be53;
  outline-offset: 2px;
}

.palette-run {
  min-width: 112px;
  min-height: 42px;
  border: 1px solid #e8be53;
  background: #e8be53;
  color: #0c1110;
  font: inherit;
  font-weight: 900;
  white-space: nowrap;
}

.palette-run:focus-visible,
.palette-settings summary:focus-visible,
.palette-settings-row select:focus-visible,
.palette-settings-row input:focus-visible {
  outline: 2px solid #e8be53;
  outline-offset: 2px;
}

.palette-run:disabled {
  cursor: progress;
  opacity: 0.78;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

.palette-settings {
  padding: 0 8px 8px;
}

.palette-settings summary {
  display: inline-flex;
  min-height: 28px;
  padding: 4px 0;
  cursor: pointer;
  color: #9ea8a1;
}

.palette-settings summary span {
  color: #9ea8a1;
  font-size: 0.76rem;
  font-weight: 900;
  text-transform: uppercase;
}

.palette-settings-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 0 10px 10px;
}

.palette-settings-row label,
.palette-settings-row .planner-readout {
  display: grid;
  gap: 5px;
  min-width: 0;
  color: #c9d1cb;
  font-size: 0.84rem;
}

.palette-settings-row select,
.palette-settings-row input {
  min-width: 0;
  min-height: 38px;
  padding: 8px 10px;
  border: 1px solid rgba(244, 240, 232, 0.18);
  background: #f4f0e8;
  color: #0c1110;
  font: inherit;
}

.planner-readout em {
  color: #9ea8a1;
  font-style: normal;
}

@media (max-width: 620px) {
  .palette-command,
  .palette-settings-row {
    grid-template-columns: 1fr;
  }
}
</style>
