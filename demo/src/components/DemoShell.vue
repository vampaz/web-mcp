<template>
  <button
    class="webmcp-command-launcher"
    type="button"
    aria-label="Open WebMCP command input"
    :aria-expanded="String(commandPanelOpen)"
    @click="toggleCommandPanel"
  >
    <span>WEB</span>
    <span>MCP</span>
  </button>

  <webmcp-command-input
    ref="commandInput"
    floating
    :placeholder="placeholder"
    @webmcp-command-error="handleCommandError"
    @webmcp-command-panel-toggle="handleCommandPanelToggle"
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

    <section class="demo-wire-panel" :class="wirePanelState" aria-label="How this page is wired">
      <div class="wire-copy">
        <span>How this page is wired</span>
        <strong>{{ proofTitle }}</strong>
        <p>{{ proofDescription }}</p>
      </div>
      <dl class="wire-points">
        <div v-for="point in proofPoints" :key="point.label">
          <dt>{{ point.label }}</dt>
          <dd>{{ point.value }}</dd>
        </div>
      </dl>
      <div class="latest-plan" :class="latestPlanStatus">
        <span>Planned input</span>
        <strong>{{ latestPlanTitle }}</strong>
        <p>{{ latestPlanDetail }}</p>
        <pre v-if="latestPlanInput">{{ latestPlanInput }}</pre>
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
        <span>Approval boundary</span>
        <h2 id="confirmation-title">{{ pendingConfirmation.reason }}</h2>
        <p>
          The planner selected <strong>{{ pendingConfirmation.toolName }}</strong
          >, but this app still owns the final decision. Review the validated input before
          approving.
        </p>
        <span class="confirmation-input-label">Validated input</span>
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
  type WebMCPCommandPanelToggleEventDetail,
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
import type {
  DemoActivityItem,
  DemoConfirmationRequest,
  DemoMetric,
  DemoProofPoint
} from '@/interfaces/demo'

interface Props {
  activityItems?: DemoActivityItem[]
  confirmationsEnabled?: boolean
  description?: string
  eyebrow: string
  getContext: () => unknown
  metrics?: DemoMetric[]
  placeholder: string
  proofDescription?: string
  proofPoints?: DemoProofPoint[]
  proofTitle?: string
  registeredToolsCount: number
  suggestions?: string[]
  title: string
}

const props = withDefaults(defineProps<Props>(), {
  activityItems: () => [],
  confirmationsEnabled: true,
  description: '',
  metrics: () => [],
  proofDescription:
    'The app registers typed tools, validates planner input, and keeps ownership of execution.',
  proofPoints: () => [
    {
      label: 'Tools',
      value: 'Registered by the current page.'
    },
    {
      label: 'Validation',
      value: 'JSON Schema runs before execution.'
    },
    {
      label: 'Execution',
      value: 'The app updates its own state.'
    }
  ],
  proofTitle: 'Typed app actions',
  suggestions: () => []
})
interface LatestPlanSummary {
  detail: string
  input: string
  status: 'blocked' | 'idle' | 'success'
  title: string
}

const showDevtools = import.meta.env.DEV || import.meta.env.PUBLIC_WEBMCP_PREVIEW === 'true'
const shouldInstallTestBridge = import.meta.env.DEV || import.meta.env.MODE === 'test'
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
const shouldDefaultToBrowserLocalAI = import.meta.env.DEV && !import.meta.env.PROD
const plannerDetail = ref(
  shouldDefaultToBrowserLocalAI
    ? 'Using the browser-local AI planner.'
    : 'Using the OpenAI planner endpoint.'
)
const defaultPlannerProvider: PlannerProviderKind = 'openai'
const defaultPlannerModel = openAIPlannerEndpoints[0]?.id
const defaultPlannerOptionId = shouldDefaultToBrowserLocalAI ? 'browser-local-ai' : undefined
const plannerEndpoint = '/api/webmcp/plan'
const unregisterCallbacks: Array<() => void> = []
const commandInput = ref<WebMCPCommandInputElement | null>(null)
const commandPanelOpen = ref(false)
const runtimeStatusPanel = ref<{ devtoolsHost: HTMLElement | null } | null>(null)
const pendingConfirmation = ref<DemoConfirmationRequest | null>(null)
const latestCommandStatus = ref('Ready for natural-language operations.')
const latestPlan = ref<LatestPlanSummary>({
  detail: 'Run a suggested command to see the selected tool and exact planned input.',
  input: '',
  status: 'idle',
  title: 'No command run yet'
})
let devtoolsOverlay: DevtoolsOverlay | undefined
const supportLabel = computed(function getCurrentSupportLabel() {
  return getSupportLabel()
})
const commandStatusTitle = computed(function getCommandStatusTitle() {
  return latestCommandStatus.value
})
const latestPlanTitle = computed(function getLatestPlanTitle() {
  return latestPlan.value.title
})
const latestPlanDetail = computed(function getLatestPlanDetail() {
  return latestPlan.value.detail
})
const latestPlanInput = computed(function getLatestPlanInput() {
  return latestPlan.value.input
})
const latestPlanStatus = computed(function getLatestPlanStatus() {
  return `latest-plan--${latestPlan.value.status}`
})
const wirePanelState = computed(function getWirePanelState() {
  return latestPlan.value.status === 'idle' ? '' : 'demo-wire-panel--active'
})

if (typeof customElements !== 'undefined') {
  defineWebMCPCommandInput()
}

onMounted(async function handleMounted() {
  setConfirmationHandler(confirmToolInvocation)
  window.addEventListener('keydown', handleCommandShortcut)
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
  syncCommandPanelState()
})

onUnmounted(function handleUnmounted() {
  window.removeEventListener('keydown', handleCommandShortcut)
  pendingConfirmation.value?.deny()
  for (const unregister of unregisterCallbacks) {
    unregister()
  }
  devtoolsOverlay?.destroy()
  setConfirmationHandler(undefined)
})

function configureCommandInput() {
  const element = getCommandInputElement()
  if (import.meta.env.MODE === 'test') {
    element?.configure({
      context: props.getContext
    })
    return
  }

  element?.configure({
    context: props.getContext,
    endpoint: plannerEndpoint,
    endpointOptions: plannerEndpointOptions,
    initialModel: defaultPlannerModel,
    initialProvider: defaultPlannerProvider,
    plannerOptions
  })

  applyBrowserLocalDefault()
}

function applyBrowserLocalDefault() {
  if (!defaultPlannerOptionId) return

  const providerControl =
    getCommandInputElement()?.shadowRoot?.querySelector<HTMLSelectElement>('[data-provider]')
  if (!providerControl) return

  providerControl.value = `planner:${defaultPlannerOptionId}`
  providerControl.dispatchEvent(new Event('change', { bubbles: true }))

  const settingsControl =
    getCommandInputElement()?.shadowRoot?.querySelector<HTMLDetailsElement>('.webmcp-settings')
  if (!settingsControl) return

  settingsControl.open = false
  settingsControl.dispatchEvent(new Event('toggle'))
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
  latestPlan.value = {
    detail:
      detail.result.status === 'success'
        ? detail.plan.reason
        : (detail.result.error ?? 'The app blocked this planner-selected action.'),
    input: formatPlanInput(detail.plan),
    status: detail.result.status === 'success' ? 'success' : 'blocked',
    title: formatPlanTitle(detail.plan)
  }
}

function handleCommandError(event: Event) {
  const detail = (event as CustomEvent<WebMCPCommandErrorEventDetail>).detail
  latestCommandStatus.value = `Could not run "${detail.message}": ${detail.error}.`
  latestPlan.value = {
    detail: detail.error,
    input: '',
    status: 'blocked',
    title: 'Planner error'
  }
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

function formatPlanTitle(plan: ToolPlan): string {
  if (!plan.steps?.length) return plan.toolName

  return plan.steps
    .map(function getStepToolName(step) {
      return step.toolName
    })
    .join(' -> ')
}

function formatPlanInput(plan: ToolPlan): string {
  if (!plan.steps?.length) return JSON.stringify(plan.input, null, 2)

  return JSON.stringify(
    plan.steps.map(function mapStep(step) {
      return {
        toolName: step.toolName,
        input: step.input
      }
    }),
    null,
    2
  )
}

async function runSuggestion(suggestion: string) {
  openCommandPanel()
  await getCommandInputElement()?.run(suggestion)
  syncCommandPanelState()
}

function toggleCommandPanel() {
  getCommandInputElement()?.togglePanel()
  syncCommandPanelState()
}

function openCommandPanel() {
  getCommandInputElement()?.openPanel()
  syncCommandPanelState()
}

function syncCommandPanelState() {
  commandPanelOpen.value = getCommandInputElement()?.panelOpen ?? false
}

function handleCommandPanelToggle(event: Event) {
  commandPanelOpen.value = (event as CustomEvent<WebMCPCommandPanelToggleEventDetail>).detail.open
}

function handleCommandShortcut(event: KeyboardEvent) {
  if (!event.metaKey || event.key.toLowerCase() !== 'k') return

  event.preventDefault()
  openCommandPanel()
}

function getCommandInputElement(): WebMCPCommandInputElement | null {
  return (
    commandInput.value ?? document.querySelector<WebMCPCommandInputElement>('webmcp-command-input')
  )
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
  right: 0.5rem;
  bottom: 4rem;
  z-index: 1000;
  width: min(920px, calc(100vw - 1rem));
  --webmcp-floating-panel-max-height: calc(100vh - 5rem);
}

webmcp-command-input:not(:defined) {
  display: none;
}

.webmcp-command-launcher {
  position: fixed;
  right: 0.5rem;
  bottom: 0.5rem;
  z-index: 1001;
  display: grid;
  place-items: center;
  min-width: auto;
  min-height: auto;
  padding: 0.18em 0.36em;
  border: 2px solid #0f1512;
  background: #e8be53;
  color: #0c1110;
  font: inherit;
  font-size: 0.88rem;
  font-weight: 950;
  line-height: 0.9;
  text-align: center;
  cursor: pointer;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.34);
}

.webmcp-command-launcher:hover {
  background: #f1cd70;
}

.webmcp-command-launcher:focus-visible {
  outline: 2px solid #e8be53;
  outline-offset: 3px;
}

.webmcp-command-launcher span {
  display: block;
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

.demo-wire-panel {
  display: grid;
  grid-template-columns: minmax(18rem, 0.36fr) minmax(16rem, 0.32fr) minmax(18rem, 0.32fr);
  gap: 1px;
  border: 1px solid rgba(244, 240, 232, 0.13);
  background: rgba(244, 240, 232, 0.12);
}

.demo-wire-panel > * {
  min-width: 0;
  background: rgba(9, 14, 13, 0.94);
  padding: 0.8rem;
}

.demo-wire-panel--active {
  grid-template-columns: minmax(16rem, 0.42fr) minmax(18rem, 0.58fr);
}

.demo-wire-panel--active .wire-points {
  display: none;
}

.wire-copy span,
.latest-plan span,
.confirmation-input-label {
  display: block;
  color: #8fa098;
  font-size: 0.72rem;
  font-weight: 900;
  text-transform: uppercase;
}

.wire-copy strong,
.latest-plan strong {
  display: block;
  margin-top: 0.25rem;
  color: #f4f0e8;
  line-height: 1.3;
}

.wire-copy p,
.latest-plan p {
  margin: 0.35rem 0 0;
  color: #aeb9b3;
  font-size: 0.88rem;
  line-height: 1.45;
}

.wire-points {
  display: grid;
  gap: 0.65rem;
  margin: 0;
}

.wire-points div {
  min-width: 0;
}

.wire-points dt {
  color: #8fa098;
  font-size: 0.7rem;
  font-weight: 900;
  text-transform: uppercase;
}

.wire-points dd {
  margin: 0.18rem 0 0;
  color: #e0e7e2;
  font-size: 0.86rem;
  line-height: 1.35;
}

.latest-plan {
  box-shadow: inset 3px 0 0 #8fa098;
}

.latest-plan--success {
  box-shadow: inset 3px 0 0 #30a779;
}

.latest-plan--blocked {
  box-shadow: inset 3px 0 0 #f39a8d;
}

.latest-plan pre {
  overflow: auto;
  max-height: 10rem;
  margin: 0.7rem 0 0;
  border: 1px solid rgba(244, 240, 232, 0.12);
  background: rgba(0, 0, 0, 0.24);
  color: #e9f0ec;
  padding: 0.65rem;
  font-size: 0.78rem;
  white-space: pre-wrap;
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

.confirmation-dialog p strong {
  color: #f4f0e8;
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
  .demo-command-brief,
  .demo-wire-panel {
    grid-template-columns: 1fr;
  }

  .activity-rail li {
    grid-template-columns: 1fr;
    gap: 0.25rem;
  }
}

@media (max-width: 44rem) {
  webmcp-command-input[data-floating] {
    width: calc(100vw - 1rem);
  }

  .demo-app-page {
    padding-bottom: 3rem;
  }

  .demo-metrics {
    grid-template-columns: 1fr;
  }
}
</style>
