import type { PlannerProviderConfig, ToolPlanner } from './interfaces/tool'
import type { WebMCPPaidServicesConfig } from './interfaces/access-key'
import { createConfiguredPlanner } from './planner'

export interface WebMCPKitOptions {
  paidServices?: WebMCPPaidServicesConfig
  planner?: PlannerProviderConfig
}

export interface WebMCPKit {
  paidServices?: WebMCPPaidServicesConfig
  planner: ToolPlanner
  plannerConfig?: PlannerProviderConfig
}

export async function createWebMCPKit(options: WebMCPKitOptions = {}): Promise<WebMCPKit> {
  const plannerConfig = options.planner
    ? {
        ...options.planner,
        paidServices: options.paidServices ?? options.planner.paidServices
      }
    : undefined
  const planner = await createConfiguredPlanner(plannerConfig)

  return {
    paidServices: options.paidServices,
    planner,
    plannerConfig
  }
}
