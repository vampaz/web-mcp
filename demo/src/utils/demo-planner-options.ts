import type { WebMCPCommandInputEndpointOption, WebMCPCommandInputPlannerOption } from 'webmcp-kit'

import {
  getCloudflareBindingModels,
  getOpenAIPlannerEndpoints,
  getOpenRouterPlannerEndpoints
} from '@/utils/demo-data'
import {
  createBrowserLocalAIPlanner,
  defaultBrowserLocalAIModel,
  qwenBrowserLocalAIModel
} from '@/utils/browser-local-ai-planner'
import { createDemoHeuristicPlanner } from '@/utils/demo-heuristic-planner'

const cloudflareBindingModels = getCloudflareBindingModels()
const openAIPlannerEndpoints = getOpenAIPlannerEndpoints()
const openRouterPlannerEndpoints = getOpenRouterPlannerEndpoints()
const browserLocalAIModels = [
  {
    label: 'Hermes 3 Llama 3.1 8B',
    model: defaultBrowserLocalAIModel
  },
  {
    label: 'Qwen3.5 2B',
    model: qwenBrowserLocalAIModel
  }
]

export const plannerEndpointOptions: WebMCPCommandInputEndpointOption[] = [
  ...cloudflareBindingModels.map(function mapCloudflareEndpoint(model) {
    return {
      label: model.label,
      model: model.id,
      provider: 'cloudflare-binding' as const
    }
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
  }
]

export const plannerOptions: WebMCPCommandInputPlannerOption[] = [
  {
    id: 'browser-local-ai',
    label: 'Browser local AI',
    modelOptions: browserLocalAIModels,
    createPlanner(options) {
      return createBrowserLocalAIPlanner({
        model: options?.model ?? defaultBrowserLocalAIModel
      })
    }
  },
  {
    id: 'demo-deterministic',
    label: 'Demo deterministic',
    createPlanner() {
      return createDemoHeuristicPlanner()
    }
  }
]

export const defaultPlannerModel = openAIPlannerEndpoints[0]?.id
