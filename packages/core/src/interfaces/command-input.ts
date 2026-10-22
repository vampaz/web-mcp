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

/** Visible text used by `<webmcp-command-input>`. Every key has an English default. */
export interface WebMCPCommandInputLabels {
  /** Accessible name of the command form. Default `WebMCP command input`. */
  form: string
  /** Idle text of the submit button. `buttonLabel` overrides it. Default `Run`. */
  run: string
  /** Text of the button while a command runs. Default `Stop`. */
  stop: string
  /** Text of the floating panel launcher. Default `Commands`. */
  launcher: string
  /** Summary of the resolver options disclosure. Default `Options`. */
  options: string
  /** Label of the provider select. Default `Provider`. */
  provider: string
  /** Label of the model select. Default `Model`. */
  model: string
  /** Summary of the slotted diagnostics disclosure. Default `Developer diagnostics`. */
  diagnostics: string
  /** Status before the resolver reports its own detail. Default `Resolver is waiting for a command.` */
  idle: string
  /** Status while the resolver is prepared. Default `Preparing...`. */
  preparing: string
  /** Status while the resolver selects a tool. Default `Resolving...`. */
  resolving: string
  /** Status while a tool runs; `{tool}` is replaced with the tool name. Default `Running {tool}.` */
  executing: string
  /** Status after the user or a signal stops a command. Default `Command was cancelled.` */
  cancelled: string
}

export type WebMCPCommandInputConfigureOptions = {
  buttonLabel?: string
  context?: ResolverContext | (() => ResolverContext)
  disabled?: boolean
  floating?: boolean
  initialModel?: string
  initialResolverOptionId?: string
  /** Visible label and accessible name of the command field. Default `Command`. */
  label?: string
  /** Replaces the custom visible strings; omitted keys use the defaults. */
  labels?: Partial<WebMCPCommandInputLabels>
  /** Shows a launcher button that toggles the floating panel. */
  launcher?: boolean
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
  label: string
  get labels(): WebMCPCommandInputLabels
  set labels(value: Partial<WebMCPCommandInputLabels> | undefined)
  launcher: boolean
  panelOpen: boolean
  placeholder: string
  resolver?: ToolResolver
  resolverOptions?: WebMCPCommandInputResolverOption[]
  closePanel(): void
  configure(options: WebMCPCommandInputConfigureOptions): void
  openPanel(): void
  /**
   * Failure results use `code: 'cancelled'` after Stop, Escape, or an aborted signal, and
   * `code: 'resolver_failed'` when creating the resolver or resolving the command fails.
   */
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
