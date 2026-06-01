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

export interface WebMCPCommandInputPlannerModelOption {
  label: string
  model: string
}

export interface WebMCPCommandInputPlannerCreateOptions {
  model?: string
}

export interface WebMCPCommandInputPlannerOption {
  createPlanner: (
    options?: WebMCPCommandInputPlannerCreateOptions
  ) => Promise<ToolPlanner> | ToolPlanner
  id: string
  label: string
  modelOptions?: WebMCPCommandInputPlannerModelOption[]
}

export interface WebMCPCommandInputConfigureOptions {
  apiKey?: string
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
  authMode?: 'none' | 'server' | 'user-key'
  baseUrl?: string
  buttonLabel?: string
  context?: PlannerContext | (() => PlannerContext)
  disabled: boolean
  endpoint?: string
  endpointOptions?: WebMCPCommandInputEndpointOption[]
  floating: boolean
  model?: string
  panelOpen: boolean
  placeholder: string
  planner?: ToolPlanner
  plannerConfig?: PlannerProviderConfig
  plannerOptions?: WebMCPCommandInputPlannerOption[]
  provider?: PlannerProviderKind
  showChromeAI?: boolean
  closePanel: () => void
  configure: (options: WebMCPCommandInputConfigureOptions) => void
  openPanel: () => void
  run: (
    message?: string,
    options?: WebMCPCommandInputRunOptions
  ) => Promise<ToolInvocationResult | undefined>
  togglePanel: () => void
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

export interface WebMCPCommandPanelToggleEventDetail {
  open: boolean
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
