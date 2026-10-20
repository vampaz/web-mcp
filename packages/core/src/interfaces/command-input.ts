import type {
  ResolverContext,
  ToolInvocationResult,
  ToolResolution,
  ToolResolutionStep,
  ToolResolver
} from './tool'

export type WebMCPCommandInputPhase =
  | 'idle'
  | 'preparing'
  | 'resolving'
  | 'executing'
  | 'completed'
  | 'failed'

export interface WebMCPCommandInputResolverModelOption {
  label: string
  model: string
}

export interface WebMCPCommandInputResolverCreateOptions {
  model?: string
  modelOption?: WebMCPCommandInputResolverModelOption
}

export interface WebMCPCommandInputResolverOption {
  createResolver: (
    options?: WebMCPCommandInputResolverCreateOptions
  ) => Promise<ToolResolver> | ToolResolver
  id: string
  label: string
  modelOptions?: WebMCPCommandInputResolverModelOption[]
}

export type WebMCPCommandInputConfigureOptions = {
  buttonLabel?: string
  context?: ResolverContext | (() => ResolverContext)
  disabled?: boolean
  floating?: boolean
  initialModel?: string
  initialResolverOptionId?: string
  placeholder?: string
  settingsOpen?: boolean
} & (
  | { resolver?: ToolResolver; resolverOptions?: never }
  | { resolver?: never; resolverOptions?: WebMCPCommandInputResolverOption[] }
)

export interface WebMCPCommandInputElement extends HTMLElement {
  buttonLabel?: string
  context?: ResolverContext | (() => ResolverContext)
  disabled: boolean
  floating: boolean
  panelOpen: boolean
  placeholder: string
  resolver?: ToolResolver
  resolverOptions?: WebMCPCommandInputResolverOption[]
  closePanel(): void
  configure(options: WebMCPCommandInputConfigureOptions): void
  openPanel(): void
  run(
    message?: string,
    options?: WebMCPCommandInputRunOptions
  ): Promise<ToolInvocationResult | undefined>
  togglePanel(): void
}

export interface WebMCPCommandInputRunOptions {
  signal?: AbortSignal
}

export interface WebMCPCommandResolutionEventDetail {
  message: string
  resolution: ToolResolution
  resolver: ToolResolver
}

export interface WebMCPCommandResolverEventDetail {
  resolver: ToolResolver
}

export interface WebMCPCommandResultEventDetail {
  message: string
  resolution: ToolResolution
  result: ToolInvocationResult
}

export interface WebMCPCommandPanelToggleEventDetail {
  open: boolean
}

export interface WebMCPCommandStepEventDetail {
  message: string
  phase: 'started' | 'completed'
  resolution: ToolResolution
  result?: ToolInvocationResult
  step: ToolResolutionStep
  stepCount: number
  stepIndex: number
}

export interface WebMCPCommandErrorEventDetail {
  error: string
  message: string
}
