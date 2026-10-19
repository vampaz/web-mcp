import type {
  ResolverContext,
  ResolverProviderConfig,
  ResolverProviderKind,
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

export interface WebMCPCommandInputEndpointOption {
  label: string
  model?: string
  provider: ResolverProviderKind
}

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

export interface WebMCPCommandInputConfigureOptions {
  apiKey?: string
  authMode?: 'none' | 'server' | 'user-key'
  baseUrl?: string
  buttonLabel?: string
  context?: ResolverContext | (() => ResolverContext)
  disabled?: boolean
  endpoint?: string
  endpointOptions?: WebMCPCommandInputEndpointOption[]
  floating?: boolean
  initialModel?: string
  initialResolverOptionId?: string
  initialProvider?: ResolverProviderKind
  model?: string
  placeholder?: string
  resolver?: ToolResolver
  resolverConfig?: ResolverProviderConfig
  resolverOptions?: WebMCPCommandInputResolverOption[]
  provider?: ResolverProviderKind
  settingsOpen?: boolean
  showChromeAI?: boolean
}

export interface WebMCPCommandInputElement extends HTMLElement {
  apiKey?: string
  authMode?: 'none' | 'server' | 'user-key'
  baseUrl?: string
  buttonLabel?: string
  context?: ResolverContext | (() => ResolverContext)
  disabled: boolean
  endpoint?: string
  endpointOptions?: WebMCPCommandInputEndpointOption[]
  floating: boolean
  model?: string
  panelOpen: boolean
  placeholder: string
  resolver?: ToolResolver
  resolverConfig?: ResolverProviderConfig
  resolverOptions?: WebMCPCommandInputResolverOption[]
  provider?: ResolverProviderKind
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
