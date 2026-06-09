import { onMounted, onUnmounted, ref, type Ref } from 'vue'

import { listTools, registerTool, type WebMCPTool } from 'webmcp-kit'

import type { DemoActivityItem, DemoSettings } from '@/interfaces/demo'
import { getInitialDemoSettings } from '@/utils/demo-data'

export interface UseDemoToolsOptions {
  maxActivityItems?: number
  registerTools: () => void
  seedActivity?: DemoActivityItem[]
}

export interface UseDemoToolsResult {
  activityItems: Ref<DemoActivityItem[]>
  addActivity: (kind: DemoActivityItem['kind'], title: string, detail: string) => void
  registerDemoTool: <TInput, TOutput>(tool: WebMCPTool<TInput, TOutput>) => void
  registeredToolsCount: Ref<number>
  settings: Ref<DemoSettings>
  trackUnregister: (unregister: () => void) => void
}

export function useDemoTools(options: UseDemoToolsOptions): UseDemoToolsResult {
  const maxActivityItems = options.maxActivityItems ?? 7
  const settings = ref(getInitialDemoSettings())
  const registeredToolsCount = ref(0)
  const activityItems = ref<DemoActivityItem[]>(options.seedActivity ?? [])
  const unregisterCallbacks: Array<() => void> = []

  function trackUnregister(unregister: () => void): void {
    unregisterCallbacks.push(unregister)
  }

  function registerDemoTool<TInput, TOutput>(tool: WebMCPTool<TInput, TOutput>): void {
    trackUnregister(registerTool(tool).unregister)
  }

  function addActivity(kind: DemoActivityItem['kind'], title: string, detail: string) {
    activityItems.value = [
      {
        id: `${Date.now()}-${activityItems.value.length}`,
        kind,
        time: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        }),
        title,
        detail
      },
      ...activityItems.value
    ].slice(0, maxActivityItems)
  }

  onMounted(function handleDemoToolsMounted() {
    options.registerTools()
    registeredToolsCount.value = listTools().length
  })

  onUnmounted(function handleDemoToolsUnmounted() {
    for (const unregister of unregisterCallbacks) {
      unregister()
    }
  })

  return {
    activityItems,
    addActivity,
    registerDemoTool,
    registeredToolsCount,
    settings,
    trackUnregister
  }
}
