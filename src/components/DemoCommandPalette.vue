<template>
  <section class="assistant-bar" aria-label="WebMCP command assistant">
    <article class="command-palette" :class="outcomeTone">
      <form class="palette-command" @submit.prevent="submitCommand">
        <label class="palette-input-shell">
          <span>WebMCP</span>
          <input
            :value="prompt"
            type="text"
            aria-label="Natural language command"
            autocomplete="off"
            spellcheck="false"
            placeholder="Tell the page what to do..."
            @input="updatePrompt"
          />
        </label>

        <button class="palette-run" type="submit" :disabled="isCommandRunning" :aria-busy="isCommandRunning">
          {{ commandButtonLabel }}
        </button>
      </form>

      <div class="palette-result" aria-live="polite">
        <div class="result-main">
          <span :class="['result-state', outcomeTone]">{{ outcomeLabel }}</span>
          <strong>{{ outcomeTitle }}</strong>
          <em>{{ selectedToolName }}</em>
        </div>
        <p>{{ outcomeDetail }} <span v-if="affectedRows.length === 0">{{ affectedStateEmpty }}</span></p>
        <div v-if="affectedRows.length > 0" class="result-rows">
          <div v-for="row in affectedRows" :key="row.id" class="result-row">
            <span>{{ row.title }}</span>
            <strong>{{ row.value }}</strong>
            <em>{{ row.meta }}</em>
          </div>
        </div>
      </div>

      <details class="palette-settings">
        <summary>
          <span>Planner</span>
          <strong>{{ plannerName }}</strong>
          <em>{{ plannerModelLabel }}</em>
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
              <option v-if="showCloudflareBinding" value="cloudflare-binding">Cloudflare binding (dev/preview)</option>
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
        </div>
      </details>
    </article>
  </section>
</template>

<script setup lang="ts">
import type { PlannerProviderKind } from '@webmcp-kit/core'

import type { OutcomeRow, PlannerModelOption } from '@/interfaces/demo'

interface Props {
  affectedRows: OutcomeRow[]
  affectedStateEmpty: string
  cloudflareBindingModels: PlannerModelOption[]
  commandButtonLabel: string
  isCommandRunning: boolean
  outcomeDetail: string
  outcomeLabel: string
  outcomeTitle: string
  outcomeTone: string
  plannerModel: string
  plannerModelLabel: string
  plannerName: string
  plannerProvider: PlannerProviderKind
  prompt: string
  selectedToolName: string
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
  display: grid;
  justify-items: center;
  margin: 0 0 12px;
  pointer-events: none;
}

.command-palette {
  display: grid;
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

.palette-run:disabled {
  cursor: progress;
  opacity: 0.78;
}

.palette-settings {
  border-top: 1px solid rgba(244, 240, 232, 0.12);
}

.palette-result {
  display: grid;
  gap: 5px;
  padding: 0 8px 8px;
}

.result-main {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.result-state {
  padding: 3px 7px;
  border: 1px solid rgba(244, 240, 232, 0.18);
  color: #9ea8a1;
  font-size: 0.72rem;
  font-weight: 900;
  text-transform: uppercase;
}

.result-state.success {
  border-color: rgba(48, 167, 121, 0.42);
  color: #30a779;
}

.result-state.error,
.result-state.failed {
  border-color: rgba(243, 154, 141, 0.5);
  color: #f39a8d;
}

.result-state.running {
  border-color: rgba(232, 190, 83, 0.5);
  color: #e8be53;
}

.result-state.blocked,
.result-state.unavailable {
  border-color: rgba(232, 190, 83, 0.5);
  color: #e8be53;
}

.result-main strong,
.result-main em {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-main strong {
  color: #f4f0e8;
}

.result-main em,
.palette-result p,
.palette-result p span,
.result-row em {
  color: #9ea8a1;
  font-style: normal;
}

.palette-result p {
  margin: 0;
  overflow: hidden;
  font-size: 0.82rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-rows {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 6px;
}

.result-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 0.65fr);
  gap: 3px 8px;
  align-items: center;
  min-width: 0;
  padding: 5px 7px;
  border: 1px solid rgba(244, 240, 232, 0.12);
  background: rgba(244, 240, 232, 0.035);
}

.result-row span,
.result-row em {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-row span {
  color: #f4f0e8;
}

.result-row strong {
  color: #e8be53;
}

.result-row em {
  font-size: 0.78rem;
}

.palette-settings summary {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  min-height: 34px;
  padding: 0 12px;
  cursor: pointer;
  color: #9ea8a1;
}

.palette-settings summary span {
  color: #e8be53;
  font-size: 0.76rem;
  font-weight: 900;
  text-transform: uppercase;
}

.palette-settings summary strong,
.palette-settings summary em {
  min-width: 0;
  overflow: hidden;
  color: #f4f0e8;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.palette-settings summary em {
  color: #9ea8a1;
  font-size: 0.84rem;
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

@media (max-width: 620px) {
  .palette-command,
  .palette-settings-row,
  .result-main,
  .result-rows {
    grid-template-columns: 1fr;
  }

  .palette-result p {
    white-space: normal;
  }
}
</style>
