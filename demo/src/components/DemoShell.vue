<template>
  <webmcp-command-input
    ref="commandInput"
    floating
    :placeholder="placeholder"
    @webmcp-command-planner="handleCommandPlanner"
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
      </div>
    </header>

    <slot />
  </section>
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
  type WebMCPCommandInputElement,
  type WebMCPCommandPlannerEventDetail
} from '@webmcp-kit/core'
import { mountDevtoolsOverlay, type DevtoolsOverlay } from '@webmcp-kit/devtools'
import { computed, onMounted, onUnmounted, ref } from 'vue'

import DemoRuntimeStatus from '@/components/DemoRuntimeStatus.vue'
import { getCloudflareBindingModels } from '@/utils/demo-data'

interface Props {
  confirmationsEnabled?: boolean
  eyebrow: string
  getContext: () => unknown
  placeholder: string
  registeredToolsCount: number
  title: string
}

const props = withDefaults(defineProps<Props>(), {
  confirmationsEnabled: true
})
const showDevtools = import.meta.env.DEV || import.meta.env.PUBLIC_WEBMCP_PREVIEW === 'true'
const shouldInstallTestBridge = import.meta.env.DEV || import.meta.env.MODE === 'test'
const shouldDefaultToCloudflareBinding = import.meta.env.MODE !== 'test'
const plannerControlsStorageKey = 'webmcp:admin'
const cloudflareBindingModels = getCloudflareBindingModels()
const plannerName = ref('Loading')
const plannerDetail = ref(shouldDefaultToCloudflareBinding ? 'Using the Cloudflare AI binding planner endpoint.' : 'Checking Chrome built-in AI availability.')
const defaultPlannerProvider: PlannerProviderKind = shouldDefaultToCloudflareBinding ? 'cloudflare-binding' : 'auto'
const defaultPlannerModel = shouldDefaultToCloudflareBinding ? cloudflareBindingModels[0].id : 'openrouter/auto'
const plannerEndpoint = '/api/webmcp/plan'
const unregisterCallbacks: Array<() => void> = []
const commandInput = ref<WebMCPCommandInputElement | null>(null)
const runtimeStatusPanel = ref<{ devtoolsHost: HTMLElement | null } | null>(null)
let devtoolsOverlay: DevtoolsOverlay | undefined
const supportLabel = computed(function getCurrentSupportLabel() {
  return getSupportLabel()
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
  for (const unregister of unregisterCallbacks) {
    unregister()
  }
  devtoolsOverlay?.destroy()
  setConfirmationHandler(undefined)
})

function configureCommandInput() {
  if (shouldShowPlannerControls()) {
    commandInput.value?.configure({
      context: props.getContext,
      endpoint: plannerEndpoint,
      initialModel: shouldDefaultToCloudflareBinding ? defaultPlannerModel : undefined,
      initialProvider: shouldDefaultToCloudflareBinding ? defaultPlannerProvider : undefined
    })
    return
  }

  commandInput.value?.configure({
    context: props.getContext,
    endpoint: plannerEndpoint,
    model: defaultPlannerModel,
    provider: defaultPlannerProvider
  })
}

function shouldShowPlannerControls(): boolean {
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

function confirmToolInvocation(_tool: { name: string }, input: unknown, reason: string): boolean {
  if (!props.confirmationsEnabled) return true
  return window.confirm(`${reason}\n\n${JSON.stringify(input, null, 2)}`)
}

declare global {
  interface Window {
    __webMCPKitDemoPlanner?: {
      name: ToolPlanner['name']
      available: ToolPlanner['available']
      status: ToolPlanner['status']
      detail: ToolPlanner['detail']
      plan: (message: string, tools: ReturnType<typeof listTools>[number]['tool'][], context?: unknown) => Promise<ToolPlan>
    }
  }
}
</script>

<style scoped>
.demo-app-page {
  display: grid;
  gap: clamp(0.9rem, 1.8vw, 1.25rem);
}

webmcp-command-input[floating] {
  position: fixed;
  z-index: 1000;
  width: auto;
}

webmcp-command-input:not(:defined) {
  display: none;
}

.demo-page-header {
  display: grid;
  align-items: end;
  padding-block: clamp(0.25rem, 1vw, 0.7rem) clamp(0.65rem, 1.4vw, 1rem);
  border-bottom: 1px solid rgba(244, 240, 232, 0.12);
}

.demo-page-header p,
.demo-page-header h1 {
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

@media (max-width: 62rem) {
  .demo-page-header {
    align-items: start;
  }
}
</style>
