<template>
  <webmcp-command-input
    ref="commandInput"
    floating
    :placeholder="placeholder"
    @webmcp-command-error="handleCommandError"
    @webmcp-command-planner="handleCommandPlanner"
    @webmcp-command-result="handleCommandResult"
  >
    <DemoRuntimeStatus
      ref="runtimeStatusPanel"
      slot="diagnostics"
      :planner-detail="plannerDetail"
      :planner-name="plannerName"
      :registered-tools-count="registeredToolsCount"
      :support-label="supportLabel"
    />
  </webmcp-command-input>

  <section class="demo-app-page">
    <header class="demo-page-header">
      <div>
        <p>{{ eyebrow }}</p>
        <h1>{{ title }}</h1>
        <span v-if="description">{{ description }}</span>
      </div>
      <dl v-if="metrics.length > 0" class="demo-metrics" aria-label="Workspace metrics">
        <div v-for="metric in metrics" :key="metric.label" :class="metric.tone">
          <dt>{{ metric.label }}</dt>
          <dd>{{ metric.value }}</dd>
        </div>
      </dl>
    </header>

    <section class="demo-command-brief" aria-label="Command examples and latest result">
      <div>
        <span>Command layer</span>
        <strong>{{ commandStatusTitle }}</strong>
      </div>
      <div class="suggestion-strip" aria-label="Suggested commands">
        <button
          v-for="suggestion in suggestions"
          :key="suggestion"
          type="button"
          @click="runSuggestion(suggestion)"
        >
          {{ suggestion }}
        </button>
      </div>
    </section>

    <slot />

    <section v-if="activityItems.length > 0" class="activity-rail" aria-label="Recent activity">
      <div class="activity-heading">
        <span>Audit trail</span>
        <strong>{{ activityItems.length }} events</strong>
      </div>
      <ol>
        <li v-for="item in activityItems" :key="item.id" :class="item.kind">
          <span>{{ item.time }}</span>
          <strong>{{ item.title }}</strong>
          <p>{{ item.detail }}</p>
        </li>
      </ol>
    </section>
  </section>

  <Teleport to="body">
    <div
      v-if="pendingConfirmation"
      class="confirmation-backdrop"
      role="presentation"
      @click.self="denyPendingConfirmation"
    >
      <section
        aria-labelledby="confirmation-title"
        aria-modal="true"
        class="confirmation-dialog"
        role="dialog"
      >
        <span>Review required</span>
        <h2 id="confirmation-title">{{ pendingConfirmation.reason }}</h2>
        <p>
          {{ pendingConfirmation.toolName }} will update this workspace. Review the exact input
          before approving.
        </p>
        <pre>{{ formatConfirmationInput(pendingConfirmation.input) }}</pre>
        <div>
          <button type="button" @click="denyPendingConfirmation">Deny</button>
          <button type="button" @click="approvePendingConfirmation">Approve action</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import {
  defineWebMCPCommandInput,
  getSupportLabel,
  installWebMCPKitTestBridge,
  listTools,
  setConfirmationHandler,
  type PlannerProviderKind,
  type ToolPlan,
  type ToolPlanner,
  type WebMCPCommandErrorEventDetail,
  type WebMCPCommandInputElement,
  type WebMCPCommandInputEndpointOption,
  type WebMCPCommandInputPlannerOption,
  type WebMCPCommandPlannerEventDetail,
  type WebMCPCommandResultEventDetail
} from 'webmcp-kit'
import { mountDevtoolsOverlay, type DevtoolsOverlay } from 'webmcp-kit/devtools'
import { computed, onMounted, onUnmounted, ref } from 'vue'

import DemoRuntimeStatus from '@/components/DemoRuntimeStatus.vue'
import {
  getCloudflareBindingModels,
  getOpenAIPlannerEndpoints,
  getOpenRouterPlannerEndpoints
} from '@/utils/demo-data'
import {
  createBrowserLocalAIPlanner,
  defaultBrowserLocalAIModel
} from '@/utils/browser-local-ai-planner'
import type { DemoActivityItem, DemoConfirmationRequest, DemoMetric } from '@/interfaces/demo'

interface Props {
  activityItems?: DemoActivityItem[]
  confirmationsEnabled?: boolean
  description?: string
  eyebrow: string
  getContext: () => unknown
  metrics?: DemoMetric[]
  placeholder: string
  registeredToolsCount: number
  suggestions?: string[]
  title: string
}

const props = withDefaults(defineProps<Props>(), {
  activityItems: () => [],
  confirmationsEnabled: true,
  description: '',
  metrics: () => [],
  suggestions: () => []
})
const showDevtools = import.meta.env.DEV || import.meta.env.PUBLIC_WEBMCP_PREVIEW === 'true'
const shouldInstallTestBridge = import.meta.env.DEV || import.meta.env.MODE === 'test'
const shouldDefaultToCloudflareBinding = import.meta.env.MODE !== 'test'
const plannerControlsStorageKey = 'webmcp:admin'
const cloudflareBindingModels = getCloudflareBindingModels()
const openAIPlannerEndpoints = getOpenAIPlannerEndpoints()
const openRouterPlannerEndpoints = getOpenRouterPlannerEndpoints()
const plannerEndpointOptions: WebMCPCommandInputEndpointOption[] = [
  ...cloudflareBindingModels.flatMap(function mapCloudflareEndpoint(model) {
    return [
      {
        label: model.label,
        model: model.id,
        provider: 'cloudflare-binding' as const
      },
      {
        label: model.label,
        model: model.id,
        provider: 'cloudflare-workers-ai' as const
      }
    ]
  }),
  ...openRouterPlannerEndpoints.map(function mapOpenRouterEndpoint(model) {
    return {
      label: model.label,
      model: model.id,
      provider: 'openrouter' as const
    }
  }),
  ...openAIPlannerEndpoints.map(function mapOpenAIEndpoint(model) {
    return {
      label: model.label,
      model: model.id,
      provider: 'openai' as const
    }
  }),
  {
    label: 'Auto',
    provider: 'auto'
  },
  {
    label: 'Local deterministic',
    provider: 'local'
  }
]
const plannerOptions: WebMCPCommandInputPlannerOption[] = [
  {
    id: 'browser-local-ai',
    label: `Browser local AI · ${defaultBrowserLocalAIModel}`,
    createPlanner() {
      return createBrowserLocalAIPlanner({
        model: defaultBrowserLocalAIModel
      })
    }
  }
]
const plannerName = ref('Loading')
const plannerDetail = ref(
  shouldDefaultToCloudflareBinding
    ? 'Using the Cloudflare AI binding planner endpoint.'
    : 'Checking Chrome built-in AI availability.'
)
const defaultPlannerProvider: PlannerProviderKind = shouldDefaultToCloudflareBinding
  ? 'cloudflare-binding'
  : 'auto'
const defaultPlannerModel = shouldDefaultToCloudflareBinding
  ? cloudflareBindingModels[0].id
  : openRouterPlannerEndpoints[0].id
const plannerEndpoint = '/api/webmcp/plan'
const unregisterCallbacks: Array<() => void> = []
const commandInput = ref<WebMCPCommandInputElement | null>(null)
const runtimeStatusPanel = ref<{ devtoolsHost: HTMLElement | null } | null>(null)
const pendingConfirmation = ref<DemoConfirmationRequest | null>(null)
const latestCommandStatus = ref('Ready for natural-language operations.')
let devtoolsOverlay: DevtoolsOverlay | undefined
const supportLabel = computed(function getCurrentSupportLabel() {
  return getSupportLabel()
})
const commandStatusTitle = computed(function getCommandStatusTitle() {
  return latestCommandStatus.value
})

if (typeof customElements !== 'undefined') {
  defineWebMCPCommandInput()
}

onMounted(async function handleMounted() {
  setConfirmationHandler(confirmToolInvocation)
  if (shouldInstallTestBridge) {
    unregisterCallbacks.push(installWebMCPKitTestBridge())
  }
  if (showDevtools && runtimeStatusPanel.value?.devtoolsHost) {
    devtoolsOverlay = mountDevtoolsOverlay({
      container: runtimeStatusPanel.value.devtoolsHost,
      initiallyOpen: false,
      placement: 'inline'
    })
  }

  configureCommandInput()
})

onUnmounted(function handleUnmounted() {
  pendingConfirmation.value?.deny()
  for (const unregister of unregisterCallbacks) {
    unregister()
  }
  devtoolsOverlay?.destroy()
  setConfirmationHandler(undefined)
})

function configureCommandInput() {
  if (import.meta.env.MODE === 'test') {
    commandInput.value?.configure({
      context: props.getContext
    })
    return
  }

  if (shouldShowPlannerControls()) {
    commandInput.value?.configure({
      context: props.getContext,
      endpoint: plannerEndpoint,
      endpointOptions: plannerEndpointOptions,
      initialModel: shouldDefaultToCloudflareBinding ? defaultPlannerModel : undefined,
      initialProvider: shouldDefaultToCloudflareBinding ? defaultPlannerProvider : undefined,
      plannerOptions
    })
    return
  }

  commandInput.value?.configure({
    context: props.getContext,
    endpoint: plannerEndpoint,
    endpointOptions: plannerEndpointOptions,
    model: defaultPlannerModel,
    plannerOptions,
    provider: defaultPlannerProvider
  })
}

function shouldShowPlannerControls(): boolean {
  if (import.meta.env.MODE === 'test') return false
  if (import.meta.env.DEV) return true
  try {
    return localStorage.getItem(plannerControlsStorageKey) === 'true'
  } catch {
    return false
  }
}

function handleCommandPlanner(event: Event) {
  const planner = (event as CustomEvent<WebMCPCommandPlannerEventDetail>).detail.planner
  plannerName.value = `${planner.name} (${planner.status})`
  plannerDetail.value = planner.detail
  window.__webMCPKitDemoPlanner = planner
}

function handleCommandResult(event: Event) {
  const detail = (event as CustomEvent<WebMCPCommandResultEventDetail>).detail
  const stepCount = detail.plan.steps?.length ?? 1
  latestCommandStatus.value =
    detail.result.status === 'success'
      ? `Completed "${detail.message}" across ${stepCount} ${stepCount === 1 ? 'step' : 'steps'}.`
      : `Blocked "${detail.message}": ${detail.result.error ?? 'workspace rules stopped the action'}.`
}

function handleCommandError(event: Event) {
  const detail = (event as CustomEvent<WebMCPCommandErrorEventDetail>).detail
  latestCommandStatus.value = `Could not run "${detail.message}": ${detail.error}.`
}

async function confirmToolInvocation(
  tool: { name: string },
  input: unknown,
  reason: string
): Promise<boolean> {
  if (!props.confirmationsEnabled) return true
  if (import.meta.env.MODE === 'test' && typeof window.confirm === 'function') {
    return window.confirm(`${reason}\n\n${JSON.stringify(input, null, 2)}`)
  }

  return await new Promise(function resolveConfirmation(resolve) {
    pendingConfirmation.value = {
      approve() {
        latestCommandStatus.value = `Approved ${tool.name}.`
        pendingConfirmation.value = null
        resolve(true)
      },
      deny() {
        latestCommandStatus.value = `Denied ${tool.name}.`
        pendingConfirmation.value = null
        resolve(false)
      },
      input,
      reason,
      toolName: tool.name
    }
  })
}

function approvePendingConfirmation() {
  pendingConfirmation.value?.approve()
}

function denyPendingConfirmation() {
  pendingConfirmation.value?.deny()
}

function formatConfirmationInput(input: unknown): string {
  return JSON.stringify(input, null, 2)
}

async function runSuggestion(suggestion: string) {
  await commandInput.value?.run(suggestion)
}

declare global {
  interface Window {
    __webMCPKitDemoPlanner?: {
      name: ToolPlanner['name']
      available: ToolPlanner['available']
      status: ToolPlanner['status']
      detail: ToolPlanner['detail']
      plan: (
        message: string,
        tools: ReturnType<typeof listTools>[number]['tool'][],
        context?: unknown
      ) => Promise<ToolPlan>
    }
  }
}
</script>

<style scoped>
.demo-app-page {
  display: grid;
  gap: clamp(0.9rem, 1.8vw, 1.25rem);
  padding-bottom: 5.5rem;
}

webmcp-command-input[data-floating] {
  position: fixed;
  z-index: 1000;
  width: auto;
}

webmcp-command-input:not(:defined) {
  display: none;
}

.demo-page-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(18rem, 34rem);
  gap: clamp(1rem, 2vw, 2rem);
  align-items: end;
  padding-block: clamp(0.25rem, 1vw, 0.7rem) clamp(0.65rem, 1.4vw, 1rem);
  border-bottom: 1px solid rgba(244, 240, 232, 0.12);
}

.demo-page-header p,
.demo-page-header h1,
.demo-page-header span {
  margin: 0;
}

.demo-page-header p {
  color: #8fa098;
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.demo-page-header h1 {
  margin-top: 0.2rem;
  color: #f4f0e8;
  font-size: clamp(1.55rem, 3.6vw, 2.55rem);
  line-height: 1;
}

.demo-page-header span {
  display: block;
  max-width: 62rem;
  margin-top: 0.7rem;
  color: #aeb9b3;
  font-size: clamp(0.95rem, 1.4vw, 1.08rem);
  line-height: 1.5;
}

.demo-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  margin: 0;
  border: 1px solid rgba(244, 240, 232, 0.13);
  background: rgba(244, 240, 232, 0.12);
}

.demo-metrics div {
  min-width: 0;
  padding: 0.8rem;
  background: rgba(9, 14, 13, 0.94);
}

.demo-metrics dt {
  color: #899891;
  font-size: 0.7rem;
  font-weight: 800;
  text-transform: uppercase;
}

.demo-metrics dd {
  margin: 0.18rem 0 0;
  color: #f4f0e8;
  font-size: 1.15rem;
  font-weight: 900;
}

.demo-metrics .good dd {
  color: #30a779;
}

.demo-metrics .warn dd {
  color: #e8be53;
}

.demo-metrics .danger dd {
  color: #f39a8d;
}

.demo-command-brief {
  display: grid;
  grid-template-columns: minmax(16rem, 0.42fr) minmax(0, 1fr);
  gap: 1px;
  border: 1px solid rgba(244, 240, 232, 0.13);
  background: rgba(244, 240, 232, 0.12);
}

.demo-command-brief > div {
  min-width: 0;
  padding: 0.8rem;
  background: linear-gradient(135deg, rgba(18, 27, 24, 0.96), rgba(8, 12, 11, 0.96));
}

.demo-command-brief span,
.activity-heading span,
.confirmation-dialog > span {
  display: block;
  color: #8fa098;
  font-size: 0.72rem;
  font-weight: 900;
  text-transform: uppercase;
}

.demo-command-brief strong {
  display: block;
  margin-top: 0.25rem;
  color: #f4f0e8;
  line-height: 1.35;
}

.suggestion-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.suggestion-strip button {
  min-height: 2.15rem;
  border: 1px solid rgba(232, 190, 83, 0.34);
  background: rgba(232, 190, 83, 0.08);
  color: #f4f0e8;
  font: inherit;
  font-size: 0.86rem;
}

.activity-rail {
  display: grid;
  gap: 0.85rem;
  padding: clamp(0.9rem, 1.8vw, 1.25rem);
  border: 1px solid rgba(244, 240, 232, 0.12);
  background: rgba(12, 17, 16, 0.82);
}

.activity-heading {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.activity-heading strong {
  color: #e8be53;
}

.activity-rail ol {
  display: grid;
  gap: 1px;
  margin: 0;
  padding: 0;
  list-style: none;
  background: rgba(244, 240, 232, 0.1);
}

.activity-rail li {
  display: grid;
  grid-template-columns: 5rem minmax(10rem, 0.28fr) minmax(0, 1fr);
  gap: 0.75rem;
  align-items: baseline;
  padding: 0.75rem;
  background: rgba(9, 14, 13, 0.94);
}

.activity-rail li.ai {
  box-shadow: inset 3px 0 0 #30a779;
}

.activity-rail li.system {
  box-shadow: inset 3px 0 0 #e8be53;
}

.activity-rail li.manual {
  box-shadow: inset 3px 0 0 #8fa098;
}

.activity-rail li span,
.activity-rail li p {
  margin: 0;
  color: #9ea8a1;
}

.activity-rail li strong {
  color: #f4f0e8;
}

.confirmation-backdrop {
  position: fixed;
  inset: 0;
  z-index: 4000;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(2, 5, 4, 0.72);
  backdrop-filter: blur(14px);
}

.confirmation-dialog {
  display: grid;
  gap: 1rem;
  width: min(34rem, 100%);
  border: 1px solid rgba(232, 190, 83, 0.44);
  background: #0b100e;
  padding: clamp(1rem, 2vw, 1.35rem);
  box-shadow: 0 32px 90px rgba(0, 0, 0, 0.58);
}

.confirmation-dialog h2,
.confirmation-dialog p {
  margin: 0;
}

.confirmation-dialog h2 {
  color: #f4f0e8;
  font-size: 1.35rem;
  line-height: 1.18;
}

.confirmation-dialog p {
  color: #aeb9b3;
  line-height: 1.45;
}

.confirmation-dialog pre {
  overflow: auto;
  max-height: 15rem;
  margin: 0;
  padding: 0.85rem;
  border: 1px solid rgba(244, 240, 232, 0.12);
  background: rgba(0, 0, 0, 0.28);
  color: #e9f0ec;
  white-space: pre-wrap;
}

.confirmation-dialog div {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
}

.confirmation-dialog button {
  min-height: 2.5rem;
  border: 1px solid rgba(244, 240, 232, 0.18);
  background: rgba(244, 240, 232, 0.06);
  color: #f4f0e8;
  font: inherit;
  font-weight: 800;
}

.confirmation-dialog button:last-child {
  border-color: #e8be53;
  background: #e8be53;
  color: #0c1110;
}

@media (max-width: 62rem) {
  .demo-page-header {
    grid-template-columns: 1fr;
    align-items: start;
  }

  .demo-metrics,
  .demo-command-brief {
    grid-template-columns: 1fr;
  }

  .activity-rail li {
    grid-template-columns: 1fr;
    gap: 0.25rem;
  }
}

@media (max-width: 44rem) {
  webmcp-command-input[data-floating] {
    position: sticky !important;
    top: 0.65rem !important;
    right: auto !important;
    bottom: auto !important;
    left: auto !important;
    display: block;
    width: fit-content;
    margin: 0.65rem 0 0 0.65rem;
  }

  .demo-app-page {
    padding-bottom: 3rem;
  }

  .demo-metrics {
    grid-template-columns: 1fr;
  }
}
</style>
