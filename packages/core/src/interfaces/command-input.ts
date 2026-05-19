import type {
  PlannerContext,
  PlannerProviderConfig,
  PlannerProviderKind,
  ToolInvocationResult,
  ToolPlan,
  ToolPlanner
} from './tool'

export type WebMCPCommandInputPhase = 'idle' | 'preparing' | 'planning' | 'executing' | 'completed' | 'failed'

export interface WebMCPCommandInputConfigureOptions {
  apiKey?: string
  accountId?: string
  authMode?: 'none' | 'server' | 'user-key'
  baseUrl?: string
  buttonLabel?: string
  context?: PlannerContext | (() => PlannerContext)
  disabled?: boolean
  endpoint?: string
  model?: string
  placeholder?: string
  planner?: ToolPlanner
  plannerConfig?: PlannerProviderConfig
  provider?: PlannerProviderKind
}

export interface WebMCPCommandInputElement extends HTMLElement {
  apiKey?: string
  accountId?: string
  authMode?: 'none' | 'server' | 'user-key'
  baseUrl?: string
  buttonLabel?: string
  context?: PlannerContext | (() => PlannerContext)
  disabled: boolean
  endpoint?: string
  model?: string
  placeholder: string
  planner?: ToolPlanner
  plannerConfig?: PlannerProviderConfig
  provider?: PlannerProviderKind
  configure: (options: WebMCPCommandInputConfigureOptions) => void
  run: (message?: string) => Promise<ToolInvocationResult | undefined>
}

export interface WebMCPCommandPlanEventDetail {
  message: string
  plan: ToolPlan
  planner: ToolPlanner
}

export interface WebMCPCommandResultEventDetail {
  message: string
  plan: ToolPlan
  result: ToolInvocationResult
}

export interface WebMCPCommandErrorEventDetail {
  error: string
  message: string
}
