<template>
  <webmcp-command-input
    ref="commandInput"
    floating
    placeholder="Try: Select all French items"
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
  createBestPlanner,
  createConfiguredPlanner,
  defineWebMCPCommandInput,
  getSupportLabel,
  installWebMCPKitTestBridge,
  listTools,
  setConfirmationHandler,
  type PlannerProviderConfig,
  type PlannerProviderKind,
  type ToolPlan,
  type ToolPlanner,
  type WebMCPCommandInputElement,
  type WebMCPCommandPlannerEventDetail
} from '@webmcp-kit/core'
import { mountDevtoolsOverlay, type DevtoolsOverlay } from '@webmcp-kit/devtools'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import DemoRuntimeStatus from '@/components/DemoRuntimeStatus.vue'
import { getCloudflareBindingModels } from '@/utils/demo-data'

interface Props {
  confirmationsEnabled?: boolean
  eyebrow: string
  getContext: () => unknown
  registeredToolsCount: number
  title: string
}

const props = withDefaults(defineProps<Props>(), {
  confirmationsEnabled: true
})
const showDevtools = import.meta.env.DEV || import.meta.env.PUBLIC_WEBMCP_PREVIEW === 'true'
const showPlannerControls = import.meta.env.DEV
const shouldInstallTestBridge = import.meta.env.DEV || import.meta.env.MODE === 'test'
const shouldDefaultToCloudflareBinding = import.meta.env.MODE !== 'test'
const openAIPlannerModel = 'gpt-5.4-mini'
const cloudflareBindingModels = getCloudflareBindingModels()
const plannerName = ref('Loading')
const plannerDetail = ref(shouldDefaultToCloudflareBinding ? 'Using the Cloudflare AI binding planner endpoint.' : 'Checking Chrome built-in AI availability.')
const plannerProvider = ref<PlannerProviderKind>(shouldDefaultToCloudflareBinding ? 'cloudflare-binding' : 'auto')
const plannerModel = ref(shouldDefaultToCloudflareBinding ? cloudflareBindingModels[0].id : 'openrouter/auto')
const plannerBaseUrl = ref('')
const plannerEndpoint = ref('/api/webmcp/plan')
const plannerApiKey = ref('')
const plannerAccountId = ref('')
const plannerAuthMode = ref<'server' | 'user-key'>(shouldDefaultToCloudflareBinding ? 'server' : 'user-key')
const unregisterCallbacks: Array<() => void> = []
const commandInput = ref<WebMCPCommandInputElement | null>(null)
const runtimeStatusPanel = ref<{ devtoolsHost: HTMLElement | null } | null>(null)
let currentPlanner: ToolPlanner | undefined
let devtoolsOverlay: DevtoolsOverlay | undefined
const supportLabel = computed(function getCurrentSupportLabel() {
  return getSupportLabel()
})

watch(plannerProvider, function handlePlannerProviderChanged(provider) {
  if (provider === 'openrouter') {
    plannerModel.value = 'openrouter/auto'
    plannerAuthMode.value = 'user-key'
  } else if (provider === 'openai') {
    plannerModel.value = openAIPlannerModel
    plannerAuthMode.value = 'server'
    plannerEndpoint.value = '/api/webmcp/plan'
  } else if (provider === 'cloudflare-workers-ai') {
    plannerModel.value = '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b'
    plannerAuthMode.value = 'server'
  } else if (provider === 'cloudflare-binding') {
    plannerModel.value = cloudflareBindingModels[0].id
    plannerAuthMode.value = 'server'
    plannerEndpoint.value = '/api/webmcp/plan'
  } else if (provider === 'openai-compatible') {
    plannerModel.value = ''
    plannerAuthMode.value = 'user-key'
  }

  void refreshPlanner().then(configureCommandInput)
})

onMounted(async function handleMounted() {
  defineWebMCPCommandInput()
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

  await refreshPlanner()
  configureCommandInput()
})

onUnmounted(function handleUnmounted() {
  for (const unregister of unregisterCallbacks) {
    unregister()
  }
  currentPlanner?.dispose?.()
  devtoolsOverlay?.destroy()
  setConfirmationHandler(undefined)
})

function configureCommandInput() {
  if (showPlannerControls) {
    commandInput.value?.configure({
      context: props.getContext,
      endpoint: plannerEndpoint.value,
      initialModel: shouldDefaultToCloudflareBinding ? plannerModel.value : undefined,
      initialProvider: shouldDefaultToCloudflareBinding ? plannerProvider.value : undefined
    })
    return
  }

  commandInput.value?.configure({
    context: props.getContext,
    endpoint: plannerEndpoint.value,
    model: plannerModel.value,
    planner: currentPlanner,
    provider: plannerProvider.value
  })
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

async function refreshPlanner() {
  const plannerConfig = getSelectedPlannerConfig()
  currentPlanner?.dispose?.()
  const planner = plannerConfig ? await createConfiguredPlanner(plannerConfig) : await createBestPlanner()
  currentPlanner = planner
  plannerName.value = `${planner.name} (${planner.status})`
  plannerDetail.value = planner.detail
  window.__webMCPKitDemoPlanner = planner

  return planner
}

function getSelectedPlannerConfig(): PlannerProviderConfig | undefined {
  if (plannerProvider.value === 'auto') return undefined

  if (plannerProvider.value === 'chrome-built-in' || plannerProvider.value === 'local') {
    return {
      provider: plannerProvider.value,
      auth: {
        mode: 'none'
      }
    }
  }

  if (plannerProvider.value === 'cloudflare-binding') {
    return {
      provider: plannerProvider.value,
      model: plannerModel.value || cloudflareBindingModels[0].id,
      auth: {
        mode: 'server',
        endpoint: plannerEndpoint.value
      }
    }
  }

  return {
    provider: plannerProvider.value,
    model: plannerModel.value || undefined,
    baseUrl: plannerBaseUrl.value || undefined,
    accountId: plannerAccountId.value || undefined,
    auth: plannerAuthMode.value === 'server'
      ? {
          mode: 'server',
          endpoint: plannerEndpoint.value
        }
      : {
          mode: 'user-key',
          apiKey: plannerApiKey.value || undefined
        }
  }
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
