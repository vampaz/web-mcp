import type {
  ResolverContext,
  ResolverProviderConfig,
  ResolverProviderKind,
  ToolInvocationResult,
  ToolResolution,
  ToolResolver
} from './interfaces/tool'
import type {
  WebMCPCommandErrorEventDetail,
  WebMCPCommandInputConfigureOptions,
  WebMCPCommandInputElement,
  WebMCPCommandInputEndpointOption,
  WebMCPCommandInputResolverOption,
  WebMCPCommandInputPhase,
  WebMCPCommandPanelToggleEventDetail,
  WebMCPCommandResolutionEventDetail,
  WebMCPCommandResolverEventDetail,
  WebMCPCommandResultEventDetail,
  WebMCPCommandStepEventDetail,
  WebMCPCommandInputRunOptions
} from './interfaces/command-input'
import {
  getShadowMarkup,
  getStructureSignature,
  type CommandInputViewState
} from './command-input-render'
import { invokeResolvedSteps, throwIfAborted } from './command-input-runner'
import { getErrorMessage } from './confirmation'
import {
  createCommandInputResolver,
  defaultEndpoint,
  defaultModel,
  getDefaultModelForProvider,
  getDefaultModelForResolverOption,
  getDefaultProvider,
  getModelControlMarkup,
  getModelOptionCount,
  getOptionsStatusText,
  getResolverOptionModelControlMarkup,
  getResolverOptionModelOptionCount,
  getResolverOptionId,
  getResolverOptionStatusText,
  getResolverOptionValue,
  getProviderControlMarkup,
  getProviderOptionCount,
  isAuthMode,
  isResolverAttribute,
  isResolverProviderKind
} from './command-input-options'
import { createChromeAIResolver } from './resolver'
import { listAvailableTools } from './registry'
import { validateToolResolution } from './resolution-validation'

type CommandInputConstructor = CustomElementConstructor & {
  observedAttributes: string[]
}

type CommandInputRuntimeState = {
  buttonLabel: string
  disabled: boolean
  fixedModel?: string
  fixedProvider?: ResolverProviderKind
  floating: boolean
  floatingExpanded: boolean
  hasDiagnostics: boolean
  diagnosticsOpen: boolean
  model: string
  phase: WebMCPCommandInputPhase
  resolverOptionId?: string
  placeholder: string
  prompt: string
  resolverDetail: string
  resolverName: string
  provider: ResolverProviderKind
  settingsOpen: boolean
}

const defaultPlaceholder = 'Tell this app what to do'
const defaultButtonLabel = 'Run'
const supersededResolverRefreshMessage = 'Resolver refresh was superseded.'
const webMCPCommandInputTagName = 'webmcp-command-input'
const observedAttributes = [
  'api-key',
  'auth-mode',
  'base-url',
  'button-label',
  'disabled',
  'endpoint',
  'floating',
  'model',
  'placeholder',
  'provider'
]

export function defineWebMCPCommandInput(
  tagName = webMCPCommandInputTagName
): CommandInputConstructor {
  assertCustomElementsAvailable()

  const existingConstructor = customElements.get(tagName)
  if (existingConstructor) return existingConstructor as CommandInputConstructor

  class WebMCPCommandInput extends HTMLElement implements WebMCPCommandInputElement {
    static observedAttributes = observedAttributes

    apiKey?: string
    authMode?: 'none' | 'server' | 'user-key'
    baseUrl?: string
    context?: ResolverContext | (() => ResolverContext)
    endpoint?: string
    endpointOptions?: WebMCPCommandInputEndpointOption[]
    resolverOptions?: WebMCPCommandInputResolverOption[]
    showChromeAI = true
    private chromeAIAvailable = false
    private chromeAILoadId = 0
    private currentResolver?: ToolResolver
    private currentResolverSignature = ''
    private currentResolverWasCreated = false
    private isConnectedToDom = false
    private providerWasChosen = false
    private lightDomObserver?: MutationObserver
    private resolverLoadId = 0
    private resolverRevision = 0
    private providedResolver?: ToolResolver
    private providedResolverConfig?: ResolverProviderConfig
    private renderedStructureSignature = ''
    private running = false
    private activeCommand?: AbortController
    private userSelectedModel = false
    private userSelectedResolver = false
    private readonly state: CommandInputRuntimeState = {
      buttonLabel: defaultButtonLabel,
      disabled: false,
      diagnosticsOpen: false,
      floating: false,
      floatingExpanded: false,
      hasDiagnostics: false,
      model: defaultModel,
      phase: 'idle',
      placeholder: defaultPlaceholder,
      prompt: '',
      resolverDetail: 'Resolver is waiting for a command.',
      resolverName: 'Resolver',
      provider: 'auto',
      settingsOpen: false
    }

    constructor() {
      super()
      this.attachShadow({ mode: 'open' })
    }

    connectedCallback() {
      this.isConnectedToDom = true
      this.syncAttributes()
      this.syncDiagnosticsContent()
      this.observeLightDom()
      this.render()
      if (this.state.floatingExpanded) this.focusPromptInput()
      void this.refreshChromeAIAvailability()
      void this.refreshResolverStatus()
    }

    disconnectedCallback() {
      this.isConnectedToDom = false
      this.lightDomObserver?.disconnect()
      this.lightDomObserver = undefined
      this.invalidateResolver()
    }

    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
      if (oldValue === newValue) return
      this.applyAttribute(name, newValue)
      if (!this.isConnectedToDom) return
      this.render()
      if (isResolverAttribute(name)) {
        this.invalidateResolver()
        void this.refreshResolverStatus()
      }
    }

    get buttonLabel(): string {
      return this.state.buttonLabel
    }

    set buttonLabel(value: string | undefined) {
      this.applyButtonLabelState(value)
      this.renderIfConnected()
    }

    get disabled(): boolean {
      return this.state.disabled
    }

    set disabled(value: boolean) {
      this.state.disabled = value
      this.renderIfConnected()
    }

    get floating(): boolean {
      return this.state.floating
    }

    set floating(value: boolean) {
      this.applyFloatingState(value)
      this.renderIfConnected()
    }

    get panelOpen(): boolean {
      return this.state.floatingExpanded
    }

    set panelOpen(value: boolean) {
      this.setPanelOpen(value)
    }

    get model(): string | undefined {
      return this.state.fixedModel
    }

    set model(value: string | undefined) {
      this.applyModelState(value)
      this.invalidateResolver()
      this.renderIfConnected()
      void this.refreshResolverStatus()
    }

    get placeholder(): string {
      return this.state.placeholder
    }

    set placeholder(value: string | undefined) {
      this.applyPlaceholderState(value)
      this.renderIfConnected()
    }

    get resolver(): ToolResolver | undefined {
      return this.providedResolver
    }

    set resolver(value: ToolResolver | undefined) {
      this.providedResolver = value
      this.invalidateResolver()
      this.renderIfConnected()
      void this.refreshResolverStatus()
    }

    get resolverConfig(): ResolverProviderConfig | undefined {
      return this.providedResolverConfig
    }

    set resolverConfig(value: ResolverProviderConfig | undefined) {
      this.providedResolverConfig = value
      this.invalidateResolver()
      this.renderIfConnected()
      void this.refreshResolverStatus()
    }

    get provider(): ResolverProviderKind | undefined {
      return this.state.fixedProvider
    }

    set provider(value: ResolverProviderKind | undefined) {
      this.applyProviderState(value)
      this.invalidateResolver()
      this.renderIfConnected()
      void this.refreshResolverStatus()
    }

    configure(options: WebMCPCommandInputConfigureOptions) {
      this.apiKey = options.apiKey ?? this.apiKey
      this.authMode = options.authMode ?? this.authMode
      this.baseUrl = options.baseUrl ?? this.baseUrl
      this.context = options.context ?? this.context
      this.endpoint = options.endpoint ?? this.endpoint
      this.endpointOptions = options.endpointOptions ?? this.endpointOptions
      this.resolverOptions = options.resolverOptions ?? this.resolverOptions
      if (options.showChromeAI !== undefined) {
        this.showChromeAI = options.showChromeAI
        if (!this.showChromeAI) {
          this.chromeAIAvailable = false
          if (!this.state.fixedProvider && this.state.provider === 'chrome-built-in') {
            this.state.provider = getDefaultProvider(this.endpointOptions, false)
            this.state.model = getDefaultModelForProvider(this.state.provider, this.endpointOptions)
          }
        }
      }
      if (options.floating !== undefined) this.applyFloatingState(options.floating)
      if (
        options.initialProvider !== undefined &&
        !this.state.fixedProvider &&
        !this.userSelectedResolver
      ) {
        this.providerWasChosen = true
        this.state.resolverOptionId = undefined
        this.state.provider = options.initialProvider
      } else if (
        options.endpointOptions !== undefined &&
        !this.state.fixedProvider &&
        this.state.provider === 'auto'
      ) {
        this.state.provider = getDefaultProvider(
          options.endpointOptions,
          this.shouldShowChromeAIOption()
        )
      }
      if (
        options.initialModel !== undefined &&
        !this.state.fixedModel &&
        !this.userSelectedResolver &&
        !this.userSelectedModel
      ) {
        this.state.model = options.initialModel
      } else if (
        options.endpointOptions !== undefined &&
        !this.state.fixedModel &&
        !this.userSelectedModel
      ) {
        this.state.model = getDefaultModelForProvider(this.state.provider, options.endpointOptions)
      }
      if (
        options.initialResolverOptionId !== undefined &&
        !this.state.fixedProvider &&
        !this.userSelectedResolver
      ) {
        const initialResolverOption = this.getResolverOptionById(options.initialResolverOptionId)
        if (initialResolverOption) {
          this.providerWasChosen = true
          this.state.resolverOptionId = initialResolverOption.id
          this.state.provider = 'auto'
          if (!this.state.fixedModel) {
            this.state.model = getDefaultModelForResolverOption(initialResolverOption)
          }
        }
      }
      if (options.settingsOpen !== undefined) this.state.settingsOpen = options.settingsOpen
      if (options.resolver !== undefined) this.providedResolver = options.resolver
      if (options.resolverConfig !== undefined) this.providedResolverConfig = options.resolverConfig

      if (options.buttonLabel !== undefined) this.applyButtonLabelState(options.buttonLabel)
      if (options.disabled !== undefined) this.state.disabled = options.disabled
      if (options.placeholder !== undefined) this.applyPlaceholderState(options.placeholder)
      if (options.model !== undefined) this.applyModelState(options.model)
      if (options.provider !== undefined) this.applyProviderState(options.provider)

      this.invalidateResolver()
      this.renderIfConnected()
      void this.refreshChromeAIAvailability()
      void this.refreshResolverStatus()
    }

    openPanel() {
      this.setPanelOpen(true)
    }

    closePanel() {
      this.setPanelOpen(false)
    }

    togglePanel() {
      this.setPanelOpen(!this.state.floatingExpanded)
    }

    async run(
      message?: string,
      options: WebMCPCommandInputRunOptions = {}
    ): Promise<ToolInvocationResult | undefined> {
      if (this.state.floating) {
        this.openPanel()
      }

      const input = this.getPromptInput()
      const command = (message ?? input?.value ?? this.state.prompt).trim()
      if (this.running || this.disabled || !command) return undefined

      this.state.prompt = command
      this.running = true
      this.setPhase('preparing')

      try {
        this.invalidateAutoResolverBeforeRun()
        const controller = new AbortController()
        this.activeCommand = controller
        const signal = options.signal
          ? AbortSignal.any([controller.signal, options.signal])
          : controller.signal
        const resolver = await this.getCurrentResolver()
        const tools = listAvailableTools().map(function mapRegistration(registration) {
          return registration.tool
        })

        this.setPhase('resolving')
        throwIfAborted(signal)
        const resolution = await resolver.resolve(command, tools, this.getResolverContext(), {
          signal
        })
        throwIfAborted(signal)
        validateToolResolution(resolution, tools)
        this.dispatchResolutionEvent(command, resolution, resolver)
        this.setPhase('executing')

        const result = await invokeResolvedSteps(
          resolution,
          this.setActiveToolName.bind(this),
          (detail) => this.dispatchStepEvent(command, detail),
          signal
        )
        this.setPhase(result.status === 'success' ? 'completed' : 'failed')
        this.dispatchResultEvent(command, resolution, result)
        return result
      } catch (error) {
        const errorMessage = getErrorMessage(error)
        this.state.resolverDetail = errorMessage
        this.setPhase('failed')
        this.dispatchErrorEvent(command, errorMessage)
        return {
          toolName: this.state.resolverName,
          status: 'error',
          error: errorMessage,
          durationMs: 0
        }
      } finally {
        this.activeCommand = undefined
        this.running = false
        this.renderIfConnected()
      }
    }

    private syncAttributes() {
      for (const attributeName of observedAttributes) {
        if (this.hasAttribute(attributeName)) {
          this.applyAttribute(attributeName, this.getAttribute(attributeName))
        }
      }
    }

    private observeLightDom() {
      this.lightDomObserver?.disconnect()
      this.lightDomObserver = new MutationObserver(this.handleLightDomChanged.bind(this))
      this.lightDomObserver.observe(this, {
        attributeFilter: ['slot'],
        attributes: true,
        childList: true,
        subtree: true
      })
    }

    private handleLightDomChanged() {
      if (this.syncDiagnosticsContent()) this.renderIfConnected()
    }

    private syncDiagnosticsContent(): boolean {
      const hasDiagnostics = this.hasDiagnosticsContent()
      if (this.state.hasDiagnostics === hasDiagnostics) return false
      this.state.hasDiagnostics = hasDiagnostics
      return true
    }

    private hasDiagnosticsContent(): boolean {
      return Boolean(this.querySelector('[slot="diagnostics"]'))
    }

    private applyAttribute(name: string, value: string | null) {
      if (name === 'api-key') this.apiKey = value ?? undefined
      if (name === 'auth-mode') this.authMode = isAuthMode(value) ? value : undefined
      if (name === 'base-url') this.baseUrl = value ?? undefined
      if (name === 'button-label') this.applyButtonLabelState(value ?? undefined)
      if (name === 'disabled') this.state.disabled = value !== null
      if (name === 'endpoint') this.endpoint = value ?? undefined
      if (name === 'floating') this.applyFloatingState(value !== null)
      if (name === 'model') this.applyModelState(value ?? undefined)
      if (name === 'placeholder') this.applyPlaceholderState(value ?? undefined)
      if (name === 'provider') this.applyProviderState(value)
    }

    private applyButtonLabelState(value: string | undefined) {
      this.state.buttonLabel = value || defaultButtonLabel
    }

    private applyPlaceholderState(value: string | undefined) {
      this.state.placeholder = value || defaultPlaceholder
    }

    private applyFloatingState(value: boolean) {
      this.state.floating = value
      if (!value) this.state.floatingExpanded = false
    }

    private applyModelState(value: string | undefined) {
      this.state.fixedModel = value || undefined
      this.state.model = value || defaultModel
    }

    private applyProviderState(value: string | null | undefined) {
      this.state.fixedProvider = isResolverProviderKind(value) ? value : undefined
      this.providerWasChosen = Boolean(this.state.fixedProvider)
      this.state.resolverOptionId = undefined
      this.state.provider = this.state.fixedProvider ?? 'auto'
    }

    private async getCurrentResolver(): Promise<ToolResolver> {
      if (this.resolver) {
        this.state.resolverName = `${this.resolver.name} (${this.resolver.status})`
        this.state.resolverDetail = this.resolver.detail
        this.dispatchResolverEvent(this.resolver)
        return this.resolver
      }

      const resolverOption = this.getSelectedResolverOption()
      if (resolverOption) {
        const resolverModel = this.state.fixedModel ?? this.state.model
        const resolverSignature = JSON.stringify({
          resolverOption: resolverOption.id,
          model: resolverModel || undefined
        })
        if (this.currentResolver && this.currentResolverSignature === resolverSignature)
          return this.currentResolver

        this.disposeCreatedResolver()
        const loadId = this.resolverLoadId + 1
        this.resolverLoadId = loadId
        const revision = this.resolverRevision
        const resolver = await resolverOption.createResolver({
          model: resolverModel || undefined,
          modelOption: resolverOption.modelOptions?.find(function findModelOption(option) {
            return option.model === resolverModel
          })
        })
        if (revision !== this.resolverRevision || loadId !== this.resolverLoadId) {
          resolver.dispose?.()
          throw new Error(supersededResolverRefreshMessage)
        }

        this.currentResolver = resolver
        this.currentResolverWasCreated = true
        this.currentResolverSignature = resolverSignature
        this.state.resolverName = `${this.currentResolver.name} (${this.currentResolver.status})`
        this.state.resolverDetail = this.currentResolver.detail
        this.dispatchResolverEvent(this.currentResolver)
        return this.currentResolver
      }

      const resolverConfig = this.getResolverConfig()
      const resolverSignature = JSON.stringify(resolverConfig ?? { provider: 'auto' })
      if (this.currentResolver && this.currentResolverSignature === resolverSignature)
        return this.currentResolver

      this.disposeCreatedResolver()
      const loadId = this.resolverLoadId + 1
      this.resolverLoadId = loadId
      const revision = this.resolverRevision
      const resolver = await createCommandInputResolver(resolverConfig)
      if (revision !== this.resolverRevision || loadId !== this.resolverLoadId) {
        resolver.dispose?.()
        throw new Error(supersededResolverRefreshMessage)
      }

      this.currentResolver = resolver
      this.currentResolverWasCreated = true
      this.currentResolverSignature = resolverSignature
      this.state.resolverName = `${this.currentResolver.name} (${this.currentResolver.status})`
      this.state.resolverDetail = this.currentResolver.detail
      this.dispatchResolverEvent(this.currentResolver)
      return this.currentResolver
    }

    private getResolverConfig(): ResolverProviderConfig | undefined {
      if (this.resolverConfig) return this.resolverConfig

      const provider = this.state.fixedProvider ?? this.state.provider
      if (provider === 'auto') return undefined
      if (provider === 'chrome-built-in' || provider === 'local') {
        return {
          provider,
          auth: { mode: 'none' }
        }
      }

      const model = this.state.fixedModel ?? this.state.model
      const authMode = this.getAuthMode(provider)
      return {
        provider,
        model: model || undefined,
        baseUrl: this.baseUrl || undefined,
        auth:
          authMode === 'server'
            ? {
                mode: 'server',
                endpoint: this.endpoint || defaultEndpoint
              }
            : {
                mode: authMode,
                apiKey: this.apiKey || undefined
              }
      }
    }

    private getAuthMode(provider: ResolverProviderKind): 'none' | 'server' | 'user-key' {
      if (this.authMode) return this.authMode
      if (provider === 'cloudflare-binding') return 'server'
      if (this.endpoint && provider !== 'openai-compatible') return 'server'
      return 'user-key'
    }

    private getResolverContext(): ResolverContext {
      const context = this.context
      if (typeof context === 'function') return context()
      return context ?? {}
    }

    private async refreshResolverStatus() {
      if (!this.isConnectedToDom) return

      try {
        await this.getCurrentResolver()
      } catch (error) {
        if (getErrorMessage(error) === supersededResolverRefreshMessage) return
        this.state.resolverName = 'Resolver'
        this.state.resolverDetail = getErrorMessage(error)
      }

      this.renderIfConnected()
    }

    private async refreshChromeAIAvailability() {
      const loadId = this.chromeAILoadId + 1
      this.chromeAILoadId = loadId
      if (!this.showChromeAI) {
        this.chromeAIAvailable = false
        this.renderIfConnected()
        return
      }

      const resolver = await createChromeAIResolver()
      resolver.dispose?.()
      if (!this.isConnectedToDom || loadId !== this.chromeAILoadId) return
      if (this.chromeAIAvailable === resolver.available) return
      const wasAvailable = this.chromeAIAvailable
      this.chromeAIAvailable = resolver.available
      if (
        !wasAvailable &&
        this.chromeAIAvailable &&
        !this.providerWasChosen &&
        !this.state.fixedProvider &&
        !this.state.resolverOptionId
      ) {
        this.state.provider = 'chrome-built-in'
        this.state.model = ''
        this.invalidateResolver()
        void this.refreshResolverStatus()
      }
      this.renderIfConnected()
    }

    private disposeCreatedResolver() {
      if (this.currentResolverWasCreated) this.currentResolver?.dispose?.()
      this.currentResolver = undefined
      this.currentResolverSignature = ''
      this.currentResolverWasCreated = false
    }

    private invalidateResolver() {
      this.activeCommand?.abort()
      this.resolverRevision += 1
      this.resolverLoadId += 1
      this.disposeCreatedResolver()
    }

    private invalidateAutoResolverBeforeRun() {
      if (this.resolver || this.resolverConfig) return
      if (this.state.resolverOptionId) return
      const provider = this.state.fixedProvider ?? this.state.provider
      if (provider === 'auto') this.invalidateResolver()
    }

    private shouldShowChromeAIOption(): boolean {
      return this.showChromeAI && this.chromeAIAvailable
    }

    private setPhase(phase: WebMCPCommandInputPhase) {
      this.state.phase = phase
      this.renderIfConnected()
    }

    private setActiveToolName(toolName: string) {
      this.state.resolverDetail = `Running ${toolName}.`
      this.renderIfConnected()
    }

    private dispatchResolutionEvent(
      message: string,
      resolution: ToolResolution,
      resolver: ToolResolver
    ) {
      this.dispatchEvent(
        new CustomEvent<WebMCPCommandResolutionEventDetail>('webmcp-command-resolution', {
          bubbles: true,
          composed: true,
          detail: {
            message,
            resolution,
            resolver
          }
        })
      )
    }

    private dispatchResolverEvent(resolver: ToolResolver) {
      this.dispatchEvent(
        new CustomEvent<WebMCPCommandResolverEventDetail>('webmcp-command-resolver', {
          bubbles: true,
          composed: true,
          detail: {
            resolver
          }
        })
      )
    }

    private dispatchResultEvent(
      message: string,
      resolution: ToolResolution,
      result: ToolInvocationResult
    ) {
      this.dispatchEvent(
        new CustomEvent<WebMCPCommandResultEventDetail>('webmcp-command-result', {
          bubbles: true,
          composed: true,
          detail: {
            message,
            resolution,
            result
          }
        })
      )
    }

    private dispatchStepEvent(
      message: string,
      detail: Omit<WebMCPCommandStepEventDetail, 'message'>
    ) {
      this.dispatchEvent(
        new CustomEvent<WebMCPCommandStepEventDetail>('webmcp-command-step', {
          bubbles: true,
          composed: true,
          detail: {
            message,
            ...detail
          }
        })
      )
    }

    private dispatchErrorEvent(message: string, error: string) {
      this.dispatchEvent(
        new CustomEvent<WebMCPCommandErrorEventDetail>('webmcp-command-error', {
          bubbles: true,
          composed: true,
          detail: {
            error,
            message
          }
        })
      )
    }

    private getPromptInput(): HTMLInputElement | null {
      return this.shadowRoot?.querySelector<HTMLInputElement>('[data-command-input]') ?? null
    }

    private handleSubmit(event: SubmitEvent) {
      event.preventDefault()
      void this.run()
    }

    private handleProviderChanged(event: Event) {
      const target = event.target
      if (!(target instanceof HTMLSelectElement)) return
      const resolverOptionId = getResolverOptionId(target.value)
      const provider = isResolverProviderKind(target.value) ? target.value : 'auto'
      this.providerWasChosen = true
      this.userSelectedResolver = true
      this.state.resolverOptionId = resolverOptionId
      this.state.provider = provider
      this.state.model = resolverOptionId
        ? getDefaultModelForResolverOption(this.getResolverOptionById(resolverOptionId))
        : getDefaultModelForProvider(provider, this.endpointOptions)
      this.state.settingsOpen = true
      this.invalidateResolver()
      this.render()
      void this.refreshResolverStatus()
    }

    private handleModelChanged(event: Event) {
      const target = event.target
      if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) return
      this.userSelectedModel = true
      this.state.model = target.value
      this.invalidateResolver()
      void this.refreshResolverStatus()
    }

    private handleSettingsToggled(event: Event) {
      const target = event.target
      if (!(target instanceof HTMLDetailsElement)) return
      this.state.settingsOpen = target.open
    }

    private handleDiagnosticsToggled(event: Event) {
      const target = event.target
      if (!(target instanceof HTMLDetailsElement)) return
      this.state.diagnosticsOpen = target.open
    }

    private handlePanelKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || !this.state.floatingExpanded) return
      event.preventDefault()
      this.closePanel()
    }

    private setPanelOpen(value: boolean) {
      if (this.state.floatingExpanded === value) {
        if (value) this.focusPromptInput()
        return
      }
      this.state.floatingExpanded = value
      this.renderIfConnected()
      this.dispatchPanelToggleEvent(value)
      if (value) this.focusPromptInput()
    }

    private focusPromptInput() {
      this.getPromptInput()?.focus()
    }

    private dispatchPanelToggleEvent(open: boolean) {
      this.dispatchEvent(
        new CustomEvent<WebMCPCommandPanelToggleEventDetail>('webmcp-command-panel-toggle', {
          bubbles: true,
          composed: true,
          detail: {
            open
          }
        })
      )
    }

    private handlePromptChanged(event: Event) {
      const target = event.target
      if (!(target instanceof HTMLInputElement)) return
      this.state.prompt = target.value
    }

    private renderIfConnected() {
      if (this.isConnectedToDom) this.render()
    }

    private render() {
      if (!this.shadowRoot) return
      const view = this.getViewState()
      const structureSignature = getStructureSignature(view)
      if (this.renderedStructureSignature !== structureSignature) {
        this.renderStructure(view)
        this.renderedStructureSignature = structureSignature
      }
      this.applyViewState(view)
    }

    private getViewState(): CommandInputViewState {
      const resolverOption = this.getSelectedResolverOption()
      const provider =
        this.resolverConfig?.provider ?? this.state.fixedProvider ?? this.state.provider
      const model = this.resolverConfig?.model ?? this.state.fixedModel ?? this.state.model
      const providerControlValue = resolverOption
        ? getResolverOptionValue(resolverOption.id)
        : provider
      const showChromeAIOption = this.shouldShowChromeAIOption()
      const showProviderControl =
        !this.resolver &&
        !this.resolverConfig &&
        !this.state.fixedProvider &&
        getProviderOptionCount(this.endpointOptions, showChromeAIOption, this.resolverOptions) > 1
      const showModelControl =
        !this.resolver &&
        !this.resolverConfig &&
        !this.state.fixedModel &&
        (resolverOption
          ? getResolverOptionModelOptionCount(resolverOption) > 1
          : getModelOptionCount(provider, this.endpointOptions) > 1)
      const optionsStatus = this.resolver
        ? this.state.resolverName
        : resolverOption
          ? getResolverOptionStatusText(resolverOption, model)
          : getOptionsStatusText(provider, model, this.endpointOptions)

      return {
        buttonLabel: this.running ? getStatusLabel(this.state.phase) : this.state.buttonLabel,
        diagnosticsOpen: this.state.diagnosticsOpen,
        disabled: this.state.disabled,
        floating: this.state.floating,
        floatingExpanded: this.state.floatingExpanded,
        modelControlMarkup: showModelControl
          ? resolverOption
            ? getResolverOptionModelControlMarkup(resolverOption, model)
            : getModelControlMarkup(provider, model, this.endpointOptions)
          : '',
        optionsStatus,
        phase: this.state.phase,
        placeholder: this.state.placeholder,
        prompt: this.state.prompt,
        providerControlMarkup: showProviderControl
          ? getProviderControlMarkup(
              providerControlValue,
              this.endpointOptions,
              showChromeAIOption,
              this.resolverOptions
            )
          : '',
        running: this.running,
        settingsOpen: this.state.settingsOpen,
        showDiagnostics: this.state.hasDiagnostics,
        showSettings: showProviderControl || showModelControl
      }
    }

    private renderStructure(view: CommandInputViewState) {
      if (!this.shadowRoot) return
      const previousInput = this.getPromptInput()
      const shouldRestorePromptFocus = this.shadowRoot.activeElement === previousInput
      const selectionStart = previousInput?.selectionStart
      const selectionEnd = previousInput?.selectionEnd

      this.shadowRoot.innerHTML = getShadowMarkup(view)

      const form = this.shadowRoot.querySelector<HTMLFormElement>('form')
      const input = this.shadowRoot.querySelector<HTMLInputElement>('[data-command-input]')
      const floatingPanel = this.shadowRoot.querySelector<HTMLElement>('.webmcp-floating-panel')
      const settingsControl = this.shadowRoot.querySelector<HTMLDetailsElement>('.webmcp-settings')
      const diagnosticsControl =
        this.shadowRoot.querySelector<HTMLDetailsElement>('.webmcp-diagnostics')
      const providerControl = this.shadowRoot.querySelector<HTMLSelectElement>('[data-provider]')
      const modelControl = this.shadowRoot.querySelector<HTMLInputElement | HTMLSelectElement>(
        '[data-model]'
      )

      form?.addEventListener('submit', this.handleSubmit.bind(this))
      input?.addEventListener('input', this.handlePromptChanged.bind(this))
      floatingPanel?.addEventListener('keydown', this.handlePanelKeyDown.bind(this))
      settingsControl?.addEventListener('toggle', this.handleSettingsToggled.bind(this))
      diagnosticsControl?.addEventListener('toggle', this.handleDiagnosticsToggled.bind(this))
      providerControl?.addEventListener('change', this.handleProviderChanged.bind(this))
      modelControl?.addEventListener('input', this.handleModelChanged.bind(this))
      modelControl?.addEventListener('change', this.handleModelChanged.bind(this))
      if (shouldRestorePromptFocus) {
        input?.focus({ preventScroll: true })
        if (selectionStart !== null && selectionEnd !== null) {
          input?.setSelectionRange(selectionStart ?? 0, selectionEnd ?? selectionStart ?? 0)
        }
      }
    }

    private applyViewState(view: CommandInputViewState) {
      const root = this.shadowRoot
      if (!root) return

      const input = this.getPromptInput()
      if (input) {
        input.placeholder = view.placeholder
        if (input.value !== view.prompt) input.value = view.prompt
        if (input.getAttribute('value') !== view.prompt) input.setAttribute('value', view.prompt)
        input.toggleAttribute('disabled', view.disabled)
      }

      const button = root.querySelector<HTMLButtonElement>('.webmcp-run-button')
      if (button) {
        button.dataset.phase = view.phase
        button.toggleAttribute('disabled', view.running || view.disabled)
        button.setAttribute('aria-busy', String(view.running))
        if (button.textContent.trim() !== view.buttonLabel) button.textContent = view.buttonLabel
      }

      const settingsControl = root.querySelector<HTMLDetailsElement>('.webmcp-settings')
      if (settingsControl && settingsControl.open !== view.settingsOpen) {
        settingsControl.open = view.settingsOpen
      }
      const status = root.querySelector<HTMLElement>('.webmcp-settings-summary .webmcp-status')
      if (status && status.textContent.trim() !== view.optionsStatus) {
        status.textContent = view.optionsStatus
      }

      const diagnosticsControl = root.querySelector<HTMLDetailsElement>('.webmcp-diagnostics')
      if (diagnosticsControl && diagnosticsControl.open !== view.diagnosticsOpen) {
        diagnosticsControl.open = view.diagnosticsOpen
      }

      const floatingPanel = root.querySelector<HTMLElement>('.webmcp-floating-panel')
      if (floatingPanel) floatingPanel.hidden = !view.floatingExpanded

      this.syncFloatingHost()
    }

    private getSelectedResolverOption(): WebMCPCommandInputResolverOption | undefined {
      const resolverOptionId = this.state.resolverOptionId
      if (!resolverOptionId) return undefined

      return this.getResolverOptionById(resolverOptionId)
    }

    private getResolverOptionById(
      resolverOptionId: string
    ): WebMCPCommandInputResolverOption | undefined {
      return this.resolverOptions?.find(function findResolverOption(option) {
        return option.id === resolverOptionId
      })
    }

    private syncFloatingHost() {
      this.toggleAttribute('data-floating', this.state.floating)
      this.toggleAttribute(
        'data-floating-expanded',
        this.state.floating && this.state.floatingExpanded
      )
      if (!this.state.floating) {
        this.style.removeProperty('left')
        this.style.removeProperty('top')
        this.style.removeProperty('right')
        this.style.removeProperty('bottom')
      }
    }
  }

  customElements.define(tagName, WebMCPCommandInput)
  return WebMCPCommandInput
}

function getStatusLabel(phase: WebMCPCommandInputPhase): string {
  if (phase === 'preparing') return 'Preparing...'
  if (phase === 'resolving') return 'Resolving...'
  if (phase === 'executing') return 'Running...'
  return defaultButtonLabel
}

function assertCustomElementsAvailable() {
  if (typeof customElements === 'undefined' || typeof HTMLElement === 'undefined') {
    throw new Error(
      'WebMCP command input can only be defined in a browser custom elements environment.'
    )
  }
}
