import type {
  PlannerContext,
  PlannerProviderConfig,
  PlannerProviderKind,
  ToolInvocationResult,
  ToolPlan,
  ToolPlanStep,
  ToolPlanner
} from './tool'

export type WebMCPCommandInputPhase =
  | 'idle'
  | 'preparing'
  | 'planning'
  | 'executing'
  | 'completed'
  | 'failed'

export interface WebMCPCommandInputEndpointOption {
  label: string
  model?: string
  provider: PlannerProviderKind
}

export interface WebMCPCommandInputPlannerOption {
  createPlanner: () => Promise<ToolPlanner> | ToolPlanner
  id: string
  label: string
}

export interface WebMCPCommandInputConfigureOptions {
  apiKey?: string
  accountId?: string
  authMode?: 'none' | 'server' | 'user-key'
  baseUrl?: string
  buttonLabel?: string
  context?: PlannerContext | (() => PlannerContext)
  disabled?: boolean
  endpoint?: string
  endpointOptions?: WebMCPCommandInputEndpointOption[]
  floating?: boolean
  initialModel?: string
  initialProvider?: PlannerProviderKind
  model?: string
  placeholder?: string
  planner?: ToolPlanner
  plannerConfig?: PlannerProviderConfig
  plannerOptions?: WebMCPCommandInputPlannerOption[]
  provider?: PlannerProviderKind
  showChromeAI?: boolean
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
  endpointOptions?: WebMCPCommandInputEndpointOption[]
  floating: boolean
  model?: string
  placeholder: string
  planner?: ToolPlanner
  plannerConfig?: PlannerProviderConfig
  plannerOptions?: WebMCPCommandInputPlannerOption[]
  provider?: PlannerProviderKind
  showChromeAI?: boolean
  configure: (options: WebMCPCommandInputConfigureOptions) => void
  run: (
    message?: string,
    options?: WebMCPCommandInputRunOptions
  ) => Promise<ToolInvocationResult | undefined>
}

export interface WebMCPCommandInputRunOptions {
  signal?: AbortSignal
}

export interface WebMCPCommandPlanEventDetail {
  message: string
  plan: ToolPlan
  planner: ToolPlanner
}

export interface WebMCPCommandPlannerEventDetail {
  planner: ToolPlanner
}

export interface WebMCPCommandResultEventDetail {
  message: string
  plan: ToolPlan
  result: ToolInvocationResult
}

export interface WebMCPCommandStepEventDetail {
  message: string
  phase: 'started' | 'completed'
  plan: ToolPlan
  result?: ToolInvocationResult
  step: ToolPlanStep
  stepCount: number
  stepIndex: number
}

export interface WebMCPCommandErrorEventDetail {
  error: string
  message: string
}
