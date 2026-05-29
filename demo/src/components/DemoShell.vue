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
      <div class="demo-header-copy">
        <p>{{ eyebrow }}</p>
        <h1>{{ title }}</h1>
        <span v-if="description">{{ description }}</span>
      </div>
      <div class="demo-header-diagram" aria-hidden="true">
        <svg viewBox="0 0 420 230" role="img">
          <path
            class="diagram-grid"
            d="M28 34H392M28 86H392M28 138H392M28 190H392M68 16V214M150 16V214M232 16V214M314 16V214"
          />
          <path class="diagram-wire" d="M72 74h84c18 0 28 10 28 28v12c0 18 10 28 28 28h58" />
          <path class="diagram-wire" d="M72 158h74c20 0 32-12 32-32v-4c0-20 12-32 32-32h114" />
          <path class="diagram-wire diagram-wire--faint" d="M260 58h44c22 0 40 18 40 40v54" />
          <rect x="42" y="48" width="72" height="52" />
          <rect x="270" y="116" width="96" height="62" />
          <circle cx="184" cy="114" r="30" />
          <circle cx="344" cy="98" r="17" />
          <text x="44" y="38">SCOPE</text>
          <text x="154" y="202">PLAN</text>
          <text x="278" y="108">EXECUTE</text>
        </svg>
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
  type WebMCPCommandPanelToggleEventDetail,
  type WebMCPCommandPlannerEventDetail,
  type WebMCPCommandResultEventDetail
} from 'webmcp-kit'
import { mountDevtoolsOverlay, type DevtoolsOverlay } from 'webmcp-kit/devtools'
import { computed, onMounted, onUnmounted, ref } from 'vue'

import DemoRuntimeStatus from '@/components/DemoRuntimeStatus.vue'
import { createDemoHeuristicPlanner } from '@/utils/demo-heuristic-planner'
import {
  defaultPlannerModel,
  plannerEndpointOptions,
  plannerOptions
} from '@/utils/demo-planner-options'
import type { DemoConfirmationRequest, DemoShellProps, LatestPlanSummary } from '@/interfaces/demo'

const props = withDefaults(defineProps<DemoShellProps>(), {
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

const showDevtools = import.meta.env.DEV || import.meta.env.PUBLIC_WEBMCP_PREVIEW === 'true'
const shouldInstallTestBridge = import.meta.env.DEV || import.meta.env.MODE === 'test'
const plannerName = ref('Loading')
const shouldDefaultToBrowserLocalAI = import.meta.env.DEV && !import.meta.env.PROD
const plannerDetail = ref(
  shouldDefaultToBrowserLocalAI
    ? 'Using the browser-local AI planner.'
    : 'Using the OpenAI planner endpoint.'
)
const defaultPlannerProvider: PlannerProviderKind = 'openai'
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
    if (typeof window !== 'undefined' && 'LanguageModel' in window) {
      element?.configure({
        context: props.getContext
      })
      return
    }

    element?.configure({
      context: props.getContext,
      planner: createDemoHeuristicPlanner()
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
  width: min(57.5rem, calc(100vw - 1rem));
  --webmcp-accent: var(--demo-blue);
  --webmcp-accent-dark: var(--demo-ink);
  --webmcp-dark: var(--demo-ink);
  --webmcp-field: var(--demo-paper);
  --webmcp-floating-panel-max-height: calc(100vh - 5rem);
  --webmcp-ink: var(--demo-ink);
  --webmcp-line: var(--demo-rule-strong);
  --webmcp-muted: var(--demo-muted);
  --webmcp-paper: var(--demo-paper-wash);
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
  min-inline-size: 3rem;
  min-block-size: 2.75rem;
  padding: 0.18em 0.36em;
  border: 2px solid var(--demo-blue);
  background: var(--demo-blue);
  color: var(--demo-paper-wash);
  font: inherit;
  font-size: 0.88rem;
  font-weight: 950;
  line-height: 0.9;
  text-align: center;
  cursor: pointer;
  box-shadow: 0 14px 0 rgba(36, 88, 255, 0.14);
}

.webmcp-command-launcher:hover {
  background: var(--demo-ink);
}

.webmcp-command-launcher:focus-visible {
  outline: 2px solid var(--demo-blue);
  outline-offset: 3px;
}

.webmcp-command-launcher span {
  display: block;
}

.demo-page-header {
  display: grid;
  grid-template-columns:
    minmax(min(100%, 22rem), 0.84fr) minmax(min(100%, 16rem), 0.48fr)
    minmax(min(100%, 18rem), 0.48fr);
  gap: clamp(1rem, 2vw, 2rem);
  align-items: stretch;
  padding-block: clamp(1rem, 2.8vw, 2.2rem) clamp(0.8rem, 1.6vw, 1.2rem);
  border-bottom: 2px solid var(--demo-ink);
}

.demo-page-header p,
.demo-page-header h1,
.demo-page-header span {
  margin: 0;
}

.demo-page-header p {
  color: var(--demo-muted);
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.demo-page-header h1 {
  margin-top: 0.35rem;
  color: var(--demo-blue);
  font-family: var(--demo-font-mono);
  font-size: clamp(2.4rem, 7vw, 5.4rem);
  font-weight: 900;
  line-height: 0.88;
  max-inline-size: 9ch;
  text-wrap: balance;
  text-transform: uppercase;
}

.demo-page-header span {
  display: block;
  max-inline-size: 62rem;
  margin-top: 1rem;
  color: var(--demo-ink);
  font-family: var(--demo-font-sans);
  font-size: clamp(1rem, 1.35vw, 1.18rem);
  line-height: 1.55;
  text-wrap: pretty;
}

.demo-header-copy {
  display: grid;
  align-content: end;
}

.demo-header-diagram {
  display: grid;
  aspect-ratio: 21 / 11.5;
  border-inline: 1px solid var(--demo-blue-rule);
}

.demo-header-diagram svg {
  width: 100%;
  height: 100%;
}

.demo-header-diagram path,
.demo-header-diagram rect,
.demo-header-diagram circle {
  fill: none;
  stroke: var(--demo-blue);
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
}

.demo-header-diagram .diagram-grid,
.demo-header-diagram .diagram-wire--faint {
  opacity: 0.24;
}

.demo-header-diagram .diagram-wire {
  stroke-width: 2.4;
}

.demo-header-diagram text {
  fill: var(--demo-blue);
  font-family: var(--demo-font-mono);
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 0;
}

.demo-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  margin: 0;
  border: 1px solid var(--demo-rule-strong);
  background: var(--demo-rule-strong);
}

.demo-metrics div {
  min-width: 0;
  padding: 0.8rem;
  background: var(--demo-paper-wash);
}

.demo-metrics dt {
  color: var(--demo-muted);
  font-size: 0.7rem;
  font-weight: 800;
  text-transform: uppercase;
}

.demo-metrics dd {
  margin: 0.18rem 0 0;
  color: var(--demo-ink);
  font-size: 1.15rem;
  font-weight: 900;
}

.demo-metrics .good dd {
  color: var(--demo-good);
}

.demo-metrics .warn dd {
  color: var(--demo-warn);
}

.demo-metrics .danger dd {
  color: var(--demo-danger);
}

.demo-command-brief {
  display: grid;
  grid-template-columns: minmax(min(100%, 16rem), 0.42fr) minmax(0, 1fr);
  gap: 1px;
  border: 1px solid var(--demo-rule-strong);
  background: var(--demo-rule-strong);
}

.demo-command-brief > div {
  min-width: 0;
  padding: 0.8rem;
  background: var(--demo-paper-wash);
}

.demo-command-brief span,
.activity-heading span,
.confirmation-dialog > span {
  display: block;
  color: var(--demo-muted);
  font-size: 0.72rem;
  font-weight: 900;
  text-transform: uppercase;
}

.demo-command-brief strong {
  display: block;
  margin-top: 0.25rem;
  color: var(--demo-ink);
  line-height: 1.35;
}

.demo-wire-panel {
  display: grid;
  grid-template-columns:
    minmax(min(100%, 18rem), 0.36fr) minmax(min(100%, 16rem), 0.32fr)
    minmax(min(100%, 18rem), 0.32fr);
  gap: 1px;
  border: 1px solid var(--demo-rule-strong);
  background: var(--demo-rule-strong);
}

.demo-wire-panel > * {
  min-width: 0;
  background: var(--demo-paper-wash);
  padding: 0.8rem;
}

.demo-wire-panel--active {
  grid-template-columns: minmax(min(100%, 16rem), 0.42fr) minmax(min(100%, 18rem), 0.58fr);
}

.demo-wire-panel--active .wire-points {
  display: none;
}

.wire-copy span,
.latest-plan span,
.confirmation-input-label {
  display: block;
  color: var(--demo-muted);
  font-size: 0.72rem;
  font-weight: 900;
  text-transform: uppercase;
}

.wire-copy strong,
.latest-plan strong {
  display: block;
  margin-top: 0.25rem;
  color: var(--demo-ink);
  line-height: 1.3;
}

.wire-copy p,
.latest-plan p {
  margin: 0.35rem 0 0;
  color: var(--demo-muted);
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
  color: var(--demo-muted);
  font-size: 0.7rem;
  font-weight: 900;
  text-transform: uppercase;
}

.wire-points dd {
  margin: 0.18rem 0 0;
  color: var(--demo-ink);
  font-size: 0.86rem;
  line-height: 1.35;
}

.latest-plan {
  box-shadow: inset 3px 0 0 var(--demo-blue-rule);
}

.latest-plan--success {
  box-shadow: inset 3px 0 0 var(--demo-good);
}

.latest-plan--blocked {
  box-shadow: inset 3px 0 0 var(--demo-danger);
}

.latest-plan pre {
  overflow: auto;
  max-height: 10rem;
  margin: 0.7rem 0 0;
  border: 1px solid var(--demo-blue-rule);
  background: rgba(36, 88, 255, 0.045);
  color: var(--demo-ink);
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
  border: 1px solid var(--demo-blue);
  background: transparent;
  color: var(--demo-blue);
  font: inherit;
  font-size: 0.86rem;
}

.activity-rail {
  display: grid;
  gap: 0.85rem;
  padding: clamp(0.9rem, 1.8vw, 1.25rem);
  border: 1px solid var(--demo-rule-strong);
  background: var(--demo-paper-wash);
}

.activity-heading {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.activity-heading strong {
  color: var(--demo-blue);
}

.activity-rail ol {
  display: grid;
  gap: 1px;
  margin: 0;
  padding: 0;
  list-style: none;
  background: var(--demo-rule-strong);
}

.activity-rail li {
  display: grid;
  grid-template-columns: max-content minmax(min(100%, 10rem), 0.28fr) minmax(0, 1fr);
  gap: 0.75rem;
  align-items: baseline;
  padding: 0.75rem;
  background: var(--demo-paper);
}

.activity-rail li.ai {
  box-shadow: inset 3px 0 0 var(--demo-good);
}

.activity-rail li.system {
  box-shadow: inset 3px 0 0 var(--demo-blue);
}

.activity-rail li.manual {
  box-shadow: inset 3px 0 0 var(--demo-muted);
}

.activity-rail li span,
.activity-rail li p {
  margin: 0;
  color: var(--demo-muted);
}

.activity-rail li strong {
  color: var(--demo-ink);
}

.confirmation-backdrop {
  position: fixed;
  inset: 0;
  z-index: 4000;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(247, 243, 236, 0.72);
  backdrop-filter: blur(14px);
}

.confirmation-dialog {
  display: grid;
  gap: 1rem;
  width: min(34rem, 100%);
  border: 2px solid var(--demo-blue);
  background: var(--demo-paper-wash);
  padding: clamp(1rem, 2vw, 1.35rem);
  box-shadow: 0 32px 90px rgba(0, 0, 0, 0.58);
}

.confirmation-dialog h2,
.confirmation-dialog p {
  margin: 0;
}

.confirmation-dialog h2 {
  color: var(--demo-ink);
  font-size: 1.35rem;
  line-height: 1.18;
  text-wrap: balance;
}

.confirmation-dialog p {
  color: var(--demo-muted);
  line-height: 1.45;
}

.confirmation-dialog p strong {
  color: var(--demo-ink);
}

.confirmation-dialog pre {
  overflow: auto;
  max-height: 15rem;
  margin: 0;
  padding: 0.85rem;
  border: 1px solid var(--demo-blue-rule);
  background: rgba(36, 88, 255, 0.045);
  color: var(--demo-ink);
  white-space: pre-wrap;
}

.confirmation-dialog div {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
}

.confirmation-dialog button {
  min-height: 2.5rem;
  border: 1px solid var(--demo-rule-strong);
  background: transparent;
  color: var(--demo-ink);
  font: inherit;
  font-weight: 800;
}

.confirmation-dialog button:last-child {
  border-color: var(--demo-blue);
  background: var(--demo-blue);
  color: var(--demo-paper-wash);
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
    --webmcp-floating-panel-max-height: min(34rem, calc(100svh - 6rem));
  }

  .demo-app-page {
    gap: 0.65rem;
    padding-bottom: 4rem;
  }

  .demo-page-header {
    gap: 0.65rem;
    padding-block: 0 0.55rem;
  }

  .demo-page-header span {
    margin-top: 0.5rem;
    font-size: 0.9rem;
    line-height: 1.35;
  }

  .demo-metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .demo-metrics div,
  .demo-command-brief > div,
  .demo-wire-panel > * {
    padding: 0.6rem;
  }

  .demo-metrics dt {
    font-size: 0.62rem;
    line-height: 1.15;
  }

  .demo-metrics dd {
    font-size: 0.95rem;
  }

  .suggestion-strip {
    display: grid;
    grid-template-columns: 1fr;
    align-items: stretch;
    overflow: visible;
    padding-bottom: 0;
  }

  .suggestion-strip button {
    width: 100%;
    min-height: 2.5rem;
    text-align: left;
    white-space: normal;
  }

  .demo-wire-panel .wire-points {
    display: none;
  }

  .wire-copy p,
  .latest-plan p {
    font-size: 0.82rem;
  }

  .latest-plan pre {
    max-height: 7rem;
  }

  .activity-rail {
    padding: 0.75rem;
  }

  .confirmation-dialog {
    max-height: calc(100svh - 2rem);
    overflow: auto;
  }

  .confirmation-dialog div {
    flex-direction: column-reverse;
  }

  .confirmation-dialog button {
    width: 100%;
  }
}
</style>
