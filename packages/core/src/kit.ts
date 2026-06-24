import type { PlannerProviderConfig, ToolPlanner } from './interfaces/tool'
import { createConfiguredPlanner } from './planner'

export interface WebMCPKitOptions {
  planner?: PlannerProviderConfig
}

export interface WebMCPKit {
  planner: ToolPlanner
  plannerConfig?: PlannerProviderConfig
}

export async function createWebMCPKit(options: WebMCPKitOptions = {}): Promise<WebMCPKit> {
  const planner = await createConfiguredPlanner(options.planner)

  return {
    planner,
    plannerConfig: options.planner
  }
}
