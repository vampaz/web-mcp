import type { WebMCPCommandInputEndpointOption, WebMCPCommandInputPlannerOption } from 'webmcp-kit'

import {
  getCloudflareBindingModels,
  getOpenAIPlannerEndpoints,
  getOpenRouterPlannerEndpoints
} from '@/utils/demo-data'
import {
  createBrowserLocalAIPlanner,
  defaultBrowserLocalAIModel
} from '@/utils/browser-local-ai-planner'
import { createDemoHeuristicPlanner } from '@/utils/demo-heuristic-planner'

const cloudflareBindingModels = getCloudflareBindingModels()
const openAIPlannerEndpoints = getOpenAIPlannerEndpoints()
const openRouterPlannerEndpoints = getOpenRouterPlannerEndpoints()

export const plannerEndpointOptions: WebMCPCommandInputEndpointOption[] = [
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
  }
]

export const plannerOptions: WebMCPCommandInputPlannerOption[] = [
  {
    id: 'browser-local-ai',
    label: `Browser local AI · ${defaultBrowserLocalAIModel}`,
    createPlanner() {
      return createBrowserLocalAIPlanner({
        model: defaultBrowserLocalAIModel
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
